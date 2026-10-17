/**
 * Pure helpers for Sunny's tool-calling contract.
 *
 * Edge Function `chat-sunny` returns this JSON shape:
 *
 *   { reply: string, toolCalls: [{ name: string, args: object }] }
 *
 * Gemini `{ candidates: [{ content: { parts: [{ text, functionCall }] } }] }`
 * payloads are also accepted so the frontend can consume a raw generateContent
 * body if the Edge Function is bypassed.
 *
 * @module utils/sunnyTools
 */

import { forecastSummary, topTags, venueSunWindowToday } from './sunnySuggestions.js';
import { SUN_MOMENTS } from './sunMoments.js';
import { keyAmenities } from './venueAmenities.js';
import { normaliseTag } from './venueOfferings.js';
import { venueTypeLabel } from './venueTypeLabel.js';

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
const MOMENT_TITLES = new Map(SUN_MOMENTS.map((m) => [m.key, m.title]));

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

    const completionsCalls = payload.choices?.[0]?.message?.tool_calls
        ?? payload.message?.tool_calls
        ?? payload.tool_calls;
    if (Array.isArray(completionsCalls)) {
        return completionsCalls.map((call) => ({
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
 * Normalize an Edge Function / Gemini payload into the frontend contract.
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
 * Besides the slider time and venues, it carries a compact forecast for the
 * rest of today (`forecastToday`) and, per venue, its sun window today
 * (`sunWindow`, e.g. "10am–2pm" or "none") and up to three amenity tags, so
 * Sunny can answer "sunny beer at 4pm?". Venues with sun in a moment today
 * (sunMomentFilters: building horizon plus a sky that isn't cloud or rain)
 * carry `sunMoments`, e.g. ["Morning coffee", "Sunset drinks"], and are
 * listed first so "sunset drinks in the sun?" finds them. Kept small:
 * chat-sunny rejects a context over MAX_CONTEXT_CHARS (limits.js).
 *
 * @param {{
 *   timeOfDay: number|null,
 *   activeVenue: object|null,
 *   visibleById: Record<string, object>|Array,
 *   forecast?: object|null,   deriveSunForecast() result
 *   weather?: object|null,    WeatherContext weather (hourly temperature / rain)
 *   venues?: object[],        full venue rows, for tags (bbox rows carry none)
 *   sunMomentsById?: Map<string, string[]>|null,  sunMomentsByVenue() result
 *   place?: { label: string|null, venues: object[], asked?: string[], amenityMatches?: number|null }|null,
 *       sunnyFocusVenues() for the latest message: those venues go first, so
 *       "sunny near 3141?" and "pram-friendly cafe in Elwood?" work wherever
 *       the map is
 *   now?: Date,
 * }} input
 */
export function buildSunnyContext({
    timeOfDay = null,
    activeVenue = null,
    visibleById = {},
    forecast = null,
    weather = null,
    venues = null,
    sunMomentsById = null,
    place = null,
    now = new Date(),
} = {}) {
    const momentsFor = (id) => (sunMomentsById instanceof Map ? sunMomentsById.get(String(id)) : null);
    const allRows = Array.isArray(visibleById) ? visibleById : Object.values(visibleById || {});
    const rowById = new Map(allRows.filter((r) => r?.id != null).map((r) => [String(r.id), r]));
    // Venues in a place the user named come first (with the map's sun data
    // when that venue has it), then venues with a sun moment, so the cap below
    // never drops them.
    const placeRows = (Array.isArray(place?.venues) ? place.venues : [])
        .filter((v) => v?.id != null)
        .map((v) => ({ ...v, ...(rowById.get(String(v.id)) ?? {}) }));
    const placeIds = new Set(placeRows.map((r) => String(r.id)));
    const rest = allRows.filter((r) => !(r?.id != null && placeIds.has(String(r.id))));
    const rows = [
        ...placeRows,
        ...rest.filter((r) => r?.id != null && momentsFor(r.id)?.length),
        ...rest.filter((r) => !(r?.id != null && momentsFor(r.id)?.length)),
    ];
    const fullById = new Map(
        (Array.isArray(venues) ? venues : []).filter((v) => v?.id != null).map((v) => [String(v.id), v]),
    );
    const enrich = (row, slim) => {
        const window = venueSunWindowToday(row.sun_hour_fraction, forecast);
        if (window) slim.sunWindow = window;
        const full = fullById.get(slim.id) ?? row;
        // Key amenities (wheelchair, pram, dog, hidden gem) always make the
        // list, so "pram-friendly cafe?" never misses a venue whose first
        // tags are "Outdoor seating, Large groups".
        const keyed = keyAmenities(full);
        const tags = keyed.map((a) => a.label);
        const seen = new Set(keyed.flatMap((a) => [normaliseTag(a.label), ...a.tags]));
        for (const tag of topTags(full, 4)) {
            const key = normaliseTag(tag);
            if (seen.has(key)) continue;
            seen.add(key);
            tags.push(tag);
        }
        if (tags.length) slim.tags = tags.slice(0, 6);
        const type = venueTypeLabel(full?.typeLabel ?? full?.vibe ?? row?.vibe);
        if (type) slim.type = type.slice(0, 32);
        const suburb = String(full?.suburb ?? row?.suburb ?? '').trim();
        if (suburb) slim.suburb = suburb;
        const moments = (momentsFor(slim.id) ?? []).map((key) => MOMENT_TITLES.get(key)).filter(Boolean);
        if (moments.length) slim.sunMoments = moments;
        return slim;
    };

    const visibleVenues = [];
    for (const row of rows) {
        const slim = slimVenue(row);
        if (slim) visibleVenues.push(enrich(row, slim));
        if (visibleVenues.length >= MAX_VISIBLE_VENUES) break;
    }

    const slimActive = activeVenue ? slimVenue(activeVenue) : null;
    if (slimActive) {
        const activeRow = rows.find((r) => r && String(r.id) === slimActive.id) ?? activeVenue;
        enrich({ ...activeVenue, ...activeRow }, slimActive);
    }

    const tod = asFiniteNumber(timeOfDay);
    const context = {
        timeOfDay: tod == null ? null : clampTodMinutes(tod),
        activeVenue: slimActive,
        visibleVenues,
    };
    if (place?.label && placeRows.length) context.placeAsked = String(place.label);
    if (Array.isArray(place?.asked) && place.asked.length) {
        context.amenitiesAsked = place.asked.map(String).slice(0, 5);
        if (Number.isFinite(place.amenityMatches)) context.amenityMatches = place.amenityMatches;
    }
    const today = forecastSummary(forecast, weather, { now });
    if (today) context.forecastToday = today;
    return context;
}

/**
 * Convert ChatWidget bubbles into role/content turns for chat-sunny.
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

/**
 * A chat line for postChatSunny errors the guest should see, or null to let
 * the widget fall back to its keyword replies (network down, Gemini outage).
 * chat-sunny returns 429 when a caller hits its rate limit and 413 when a
 * request is over its size limits.
 *
 * @param {string|null|undefined} error postChatSunny's `error`, e.g. 'http_429'
 */
export function friendlyChatError(error) {
    if (error === 'http_429') return 'Sunny needs a breather — try again in a minute ☀️';
    if (error === 'http_413') return "That one's a bit long for me — try a shorter question?";
    return null;
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
