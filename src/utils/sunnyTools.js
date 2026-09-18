/**
 * Pure helpers for Sunny's tool-calling contract.
 *
 * Edge Function `chat-sunny` returns this JSON shape:
 *
 *   { reply: string, toolCalls: [{ name: string, args: object }] }
 *
 * OpenAI-style `{ choices: [{ message: { content, tool_calls } }] }` and
 * Gemini `{ candidates: [{ content: { parts: [{ text, functionCall }] } }] }`
 * payloads are also accepted so the frontend can consume either.
 *
 * @module utils/sunnyTools
 */

export const SUNNY_TOOL_NAMES = Object.freeze(['setTimeOfDay', 'setFilters', 'panToVenue']);

const TOD_MIN = 0;
const TOD_MAX = 1439;
const MAX_FILTER_TAGS = 12;
const MAX_TAG_LEN = 64;
const MAX_VENUE_ID_LEN = 128;
const MAX_VISIBLE_VENUES = 40;
const MAX_MESSAGE_CHARS = 2000;
const MAX_TURNS = 12;

const KNOWN_TOOLS = new Set(SUNNY_TOOL_NAMES);

function asFiniteNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

function parseArgs(raw) {
    if (raw == null) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
}

function clampTodMinutes(n) {
    return Math.min(TOD_MAX, Math.max(TOD_MIN, Math.round(n)));
}

/**
 * @param {string} name
 * @param {unknown} args
 * @returns {{ name: string, args: object }|null}
 */
export function validateToolCall(name, args) {
    if (!KNOWN_TOOLS.has(name)) return null;
    const a = parseArgs(args);

    if (name === 'setTimeOfDay') {
        const n = asFiniteNumber(a.todMinutes);
        if (n == null) return null;
        return { name, args: { todMinutes: clampTodMinutes(n) } };
    }

    if (name === 'setFilters') {
        if (!Array.isArray(a.tags)) return null;
        const tags = [];
        const seen = new Set();
        for (const tag of a.tags) {
            if (typeof tag !== 'string') continue;
            const trimmed = tag.trim();
            if (!trimmed || trimmed.length > MAX_TAG_LEN) continue;
            if (seen.has(trimmed)) continue;
            seen.add(trimmed);
            tags.push(trimmed);
            if (tags.length >= MAX_FILTER_TAGS) break;
        }
        return { name, args: { tags } };
    }

    if (name === 'panToVenue') {
        if (typeof a.venueId !== 'string') return null;
        const venueId = a.venueId.trim();
        if (!venueId || venueId.length > MAX_VENUE_ID_LEN) return null;
        return { name, args: { venueId } };
    }

    return null;
}

function collectRawToolCalls(payload) {
    if (!payload || typeof payload !== 'object') return [];

    if (Array.isArray(payload.toolCalls)) return payload.toolCalls;

    const openaiCalls = payload.choices?.[0]?.message?.tool_calls
        ?? payload.message?.tool_calls
        ?? payload.tool_calls;
    if (Array.isArray(openaiCalls)) {
        return openaiCalls.map((call) => ({
            name: call?.function?.name ?? call?.name,
            args: call?.function?.arguments ?? call?.args ?? call?.arguments,
        }));
    }

    const geminiParts = payload.candidates?.[0]?.content?.parts;
    if (!Array.isArray(geminiParts)) return [];
    return geminiParts
        .map((part) => part?.functionCall ?? part?.function_call)
        .filter(Boolean)
        .map((fc) => ({
            name: fc.name,
            args: fc.args ?? fc.arguments,
        }));
}

function readReply(payload) {
    if (!payload || typeof payload !== 'object') return '';
    if (typeof payload.reply === 'string') return payload.reply;
    const content = payload.choices?.[0]?.message?.content ?? payload.message?.content;
    if (typeof content === 'string') return content;
    const geminiParts = payload.candidates?.[0]?.content?.parts;
    if (Array.isArray(geminiParts)) {
        return geminiParts
            .map((part) => (typeof part?.text === 'string' ? part.text : ''))
            .filter((text) => text.trim())
            .join('\n');
    }
    return '';
}

/**
 * Normalize an Edge Function / OpenAI payload into the frontend contract.
 * Never throws.
 *
 * @param {unknown} payload
 * @returns {{ reply: string, toolCalls: Array<{ name: string, args: object }> }}
 */
export function parseChatSunnyResponse(payload) {
    try {
        const reply = readReply(payload);
        const toolCalls = [];
        for (const raw of collectRawToolCalls(payload)) {
            const validated = validateToolCall(raw?.name, raw?.args ?? raw?.arguments);
            if (validated) toolCalls.push(validated);
        }
        return { reply, toolCalls };
    } catch {
        return { reply: '', toolCalls: [] };
    }
}

const UNKNOWN_VENUE_NOTE = "I can't see that venue on the map right now.";

/**
 * Execute validated tool calls against UI setters. Never throws.
 *
 * @param {Array<{ name: string, args: object }>} toolCalls
 * @param {{ setTimeOfDay?: Function, setFilters?: Function, panToVenue?: Function }} handlers
 * @returns {string[]} soft status notes (e.g. unknown venue)
 */
export function applySunnyToolCalls(toolCalls, handlers = {}) {
    const notes = [];
    if (!Array.isArray(toolCalls)) return notes;

    for (const call of toolCalls) {
        try {
            if (!call || typeof call !== 'object') continue;
            if (call.name === 'setTimeOfDay' && typeof handlers.setTimeOfDay === 'function') {
                handlers.setTimeOfDay(call.args.todMinutes);
            } else if (call.name === 'setFilters' && typeof handlers.setFilters === 'function') {
                handlers.setFilters(call.args.tags);
            } else if (call.name === 'panToVenue' && typeof handlers.panToVenue === 'function') {
                const ok = handlers.panToVenue(call.args.venueId);
                if (ok === false) notes.push(UNKNOWN_VENUE_NOTE);
            }
        } catch {
            // Bad model output or a flaky setter must not crash the chat.
        }
    }
    return notes;
}

function pickMicroclimate(row) {
    if (!row || typeof row !== 'object') return {};
    const out = {};
    for (const key of [
        'effective_sun',
        'effective_wind',
        'sun_now',
        'wind_shelter_score',
        'comfort_hint',
        'canyon_aspect_hw',
        'geometry_confidence',
    ]) {
        if (row[key] != null) out[key] = row[key];
    }
    return out;
}

function slimVenue(row) {
    if (!row || typeof row !== 'object' || row.id == null) return null;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    return {
        id: String(row.id),
        name: String(row.name || row.venueName || ''),
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        ...pickMicroclimate(row),
    };
}

/**
 * Hidden context posted with the chat, never rendered in the transcript.
 *
 * @param {{ timeOfDay: number|null, activeVenue: object|null, visibleById: Record<string, object>|Array }} input
 */
export function buildSunnyContext({ timeOfDay = null, activeVenue = null, visibleById = {} } = {}) {
    const rows = Array.isArray(visibleById) ? visibleById : Object.values(visibleById || {});
    const visibleVenues = [];
    for (const row of rows) {
        const slim = slimVenue(row);
        if (slim) visibleVenues.push(slim);
        if (visibleVenues.length >= MAX_VISIBLE_VENUES) break;
    }

    const slimActive = activeVenue ? slimVenue(activeVenue) : null;

    const tod = asFiniteNumber(timeOfDay);

    return {
        timeOfDay: tod == null ? null : clampTodMinutes(tod),
        activeVenue: slimActive,
        visibleVenues,
    };
}

/**
 * Convert ChatWidget bubbles into OpenAI chat messages.
 *
 * @param {Array<{ type?: string, text?: string }>} uiMessages
 */
export function toLlmMessages(uiMessages) {
    if (!Array.isArray(uiMessages)) return [];
    const out = [];
    for (const msg of uiMessages) {
        const text = typeof msg?.text === 'string' ? msg.text.trim() : '';
        if (!text) continue;
        const role = msg.type === 'user' ? 'user' : 'assistant';
        out.push({ role, content: text.slice(0, MAX_MESSAGE_CHARS) });
        if (out.length >= MAX_TURNS) {
            return out.slice(-MAX_TURNS);
        }
    }
    return out;
}

export async function postChatSunny({
    supabaseUrl,
    anonKey,
    accessToken,
    messages,
    sunnyContext,
    fetchImpl = fetch,
} = {}) {
    if (!supabaseUrl || !anonKey) {
        return { ok: false, error: 'missing_supabase', payload: null };
    }
    const token = accessToken || anonKey;
    try {
        const res = await fetchImpl(`${String(supabaseUrl).replace(/\/$/, '')}/functions/v1/chat-sunny`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: anonKey,
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ messages, sunnyContext }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
            return { ok: false, error: `http_${res.status}`, payload: json };
        }
        return { ok: true, error: null, payload: json };
    } catch (err) {
        return { ok: false, error: err?.message || 'network', payload: null };
    }
}
