// Abuse limits for chat-sunny. The function accepts the public anon key, so
// anyone who copies it from the site bundle can call Gemini through it.
//
// The rate limiter lives in isolate memory: each Edge Function instance
// counts on its own and forgets on restart. That caps bursts from one client
// cheaply; it is not a global quota. Pair it with a Gemini API quota in
// Google Cloud.

// Same per-message and turn limits the app already applies before posting
// (src/utils/sunnyTools.js), so a request from the app never trips them.
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_TURNS = 12;
// buildSunnyContext sends at most 40 slim venues (~10 KB).
export const MAX_CONTEXT_CHARS = 24000;
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_OUTPUT_TOKENS = 512;

export const RATE_LIMITS = Object.freeze({
  perClientPerMinute: 10,
  perClientPerHour: 60,
  perInstancePerMinute: 120,
});

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_TRACKED_CLIENTS = 5000;

/** First hop of x-forwarded-for, else the edge's client IP header. */
export function clientKey(headers) {
  const get = (name) => (headers && typeof headers.get === 'function' ? headers.get(name) : null);
  const forwarded = get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return get('cf-connecting-ip') || get('x-real-ip') || 'unknown';
}

/**
 * Returns an error code when the parsed body breaks a limit, else null.
 * Over-long input is rejected rather than trimmed so callers see why.
 */
export function payloadLimitError(body) {
  const messages = body?.messages;
  if (messages != null && !Array.isArray(messages)) return 'invalid_messages';
  if (Array.isArray(messages)) {
    if (messages.length > MAX_TURNS) return 'too_many_messages';
    for (const msg of messages) {
      const content = msg && typeof msg === 'object' ? msg.content : null;
      if (typeof content === 'string' && content.length > MAX_MESSAGE_CHARS) return 'message_too_long';
    }
  }
  if (body?.sunnyContext != null) {
    let size;
    try {
      size = JSON.stringify(body.sunnyContext).length;
    } catch {
      return 'invalid_context';
    }
    if (size > MAX_CONTEXT_CHARS) return 'context_too_large';
  }
  return null;
}

function prune(stamps, now, windowMs) {
  while (stamps.length && now - stamps[0] >= windowMs) stamps.shift();
}

/**
 * Sliding-window limiter. check(key, now) records the attempt and returns
 * { ok: true } or { ok: false, retryAfterSec }.
 */
export function createRateLimiter(limits = RATE_LIMITS) {
  const byClient = new Map();
  const instance = [];

  return {
    check(key, now = Date.now()) {
      prune(instance, now, MINUTE_MS);
      if (instance.length >= limits.perInstancePerMinute) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((instance[0] + MINUTE_MS - now) / 1000)) };
      }

      let stamps = byClient.get(key);
      if (!stamps) {
        if (byClient.size >= MAX_TRACKED_CLIENTS) {
          // Drop the oldest-inserted client rather than grow without bound.
          byClient.delete(byClient.keys().next().value);
        }
        stamps = [];
        byClient.set(key, stamps);
      }
      prune(stamps, now, HOUR_MS);

      const lastMinute = stamps.filter((t) => now - t < MINUTE_MS);
      if (lastMinute.length >= limits.perClientPerMinute) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((lastMinute[0] + MINUTE_MS - now) / 1000)) };
      }
      if (stamps.length >= limits.perClientPerHour) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((stamps[0] + HOUR_MS - now) / 1000)) };
      }

      stamps.push(now);
      instance.push(now);
      return { ok: true };
    },
  };
}
