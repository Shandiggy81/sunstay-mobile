// Daily cap on chat-sunny's Gemini asks, so a bad day (bot traffic, a client
// loop, a sudden spike) can't run up the Gemini bill. limits.js caps bursts
// per instance in memory; this is the one count every instance shares.
//
// Each ask that passes the rate and size limits takes one slot from today's
// count just before chat-sunny calls Gemini. "Today" is the Melbourne date,
// so the count resets at local midnight. The count lives in
// public.chat_sunny_daily_usage, and only the service role can change it,
// through chat_sunny_take_daily_slot (migration 20261125140000).
//
// If the check itself fails (database down, or the migration not applied
// yet), the ask goes through and chat-sunny logs why: the per-client limits
// still apply and Sunny stays up.

// Approved by Shannon, 25 Nov 2026. One ask makes at most two Gemini calls
// and limits.js bounds its size, so this bounds a day's spend.
export const DAILY_ASK_CAP = 500;
// Ceiling for the CHAT_SUNNY_DAILY_CAP secret (chat_sunny_take_daily_slot
// refuses anything above it).
export const MAX_DAILY_ASK_CAP = 100000;
export const DAILY_CAP_TIMEOUT_MS = 2000;
export const DAILY_SLOT_RPC = 'chat_sunny_take_daily_slot';
export const MELBOURNE_TZ = 'Australia/Melbourne';

const melbourneClock = new Intl.DateTimeFormat('en-CA', {
    timeZone: MELBOURNE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

function melbourneParts(ms) {
    const parts = {};
    for (const { type, value } of melbourneClock.formatToParts(new Date(ms))) {
        if (type !== 'literal') parts[type] = Number(value);
    }
    return parts;
}

// Melbourne's UTC offset at an instant, in ms: 10 h in AEST, 11 h in AEDT.
function melbourneOffsetMs(ms) {
    const p = melbourneParts(ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** The Melbourne date at an instant, as YYYY-MM-DD: the key for that day's count. */
export function melbourneDay(now = Date.now()) {
    const p = melbourneParts(now);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Seconds until the next Melbourne midnight, when the count resets: the
 * Retry-After for a capped ask. Daylight saving changes at 2–3am, so the
 * day can be 23 or 25 hours long; the offset at midnight is what counts.
 */
export function secondsUntilMelbourneMidnight(now = Date.now()) {
    const p = melbourneParts(now);
    const midnightWall = Date.UTC(p.year, p.month - 1, p.day + 1);
    // Guess with the offset now, then use the offset at the guess in case
    // daylight saving changes before midnight.
    const guess = midnightWall - melbourneOffsetMs(now);
    const midnight = midnightWall - melbourneOffsetMs(guess);
    return Math.max(1, Math.ceil((midnight - now) / 1000));
}

/**
 * The cap from the optional CHAT_SUNNY_DAILY_CAP secret: a whole number,
 * 0 to turn Gemini off, at most MAX_DAILY_ASK_CAP. Anything else, or no
 * secret, gives DAILY_ASK_CAP.
 */
export function dailyCapFromEnv(raw) {
    const text = String(raw ?? '').trim();
    if (!/^\d+$/.test(text)) return DAILY_ASK_CAP;
    return Math.min(Number(text), MAX_DAILY_ASK_CAP);
}

/**
 * Takes one slot from today's count. Never throws. Resolves to
 *   { ok: true }                          under the cap: call Gemini
 *   { ok: false, retryAfterSec }          today's cap is used up
 *   { ok: true, skipped, detail? }        the check failed: call Gemini and log why
 */
export async function takeDailySlot({
    supabaseUrl,
    serviceRoleKey,
    cap = DAILY_ASK_CAP,
    now = Date.now(),
    fetchImpl = fetch,
    timeoutMs = DAILY_CAP_TIMEOUT_MS,
} = {}) {
    const capped = () => ({ ok: false, retryAfterSec: secondsUntilMelbourneMidnight(now) });
    if (cap <= 0) return capped();
    if (!supabaseUrl || !serviceRoleKey) return { ok: true, skipped: 'missing_env' };
    try {
        const res = await fetchImpl(`${String(supabaseUrl).replace(/\/+$/, '')}/rest/v1/rpc/${DAILY_SLOT_RPC}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ p_day: melbourneDay(now), p_cap: cap }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            return { ok: true, skipped: `http_${res.status}`, detail: String(detail).slice(0, 200) };
        }
        const allowed = await res.json().catch(() => null);
        if (allowed === true) return { ok: true };
        if (allowed === false) return capped();
        return { ok: true, skipped: 'bad_response' };
    } catch (err) {
        return { ok: true, skipped: err?.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
    }
}
