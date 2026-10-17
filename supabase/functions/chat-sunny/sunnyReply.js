/**
 * Tidying Sunny's replies before they reach the chat, which shows plain text.
 *
 * Gemini 3.5 Flash-Lite often answers a venue question with tool calls and no
 * text, and sometimes writes a venue as a markdown link to its id
 * ("[Jardin Tan](clue-2024-101100-282)"), both seen live on 17 Oct.
 */

const MAX_PICKS = 3;
const LINK = /\[([^\]\n]{1,80})\]\(([^)\s]{1,80})\)/g;
const BARE_ID = /\s*\((?:clue-[\w-]+|dv-\d+)\)/g;

/** id → name for every venue in the context Sunny was sent. */
export function contextVenues(ctx) {
    const names = new Map();
    const list = [...(Array.isArray(ctx?.visibleVenues) ? ctx.visibleVenues : []), ctx?.activeVenue];
    for (const v of list) {
        if (v?.id == null || typeof v?.name !== 'string' || !v.name.trim()) continue;
        names.set(String(v.id), v.name.trim());
    }
    return names;
}

/**
 * Plain text with links turned back into names, bare "(id)"s and ** bold
 * removed. venueIds are the linked ids that are real venues in the context.
 */
export function tidyReply(text, names = new Map()) {
    const venueIds = [];
    const reply = String(text ?? '')
        .replace(LINK, (_, label, target) => {
            if (names.has(target) && !venueIds.includes(target)) venueIds.push(target);
            return label;
        })
        .replace(BARE_ID, '')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .trim();
    return { reply, venueIds };
}

/** Linked venues become cards too, up to three picks in all. */
export function withLinkedVenues(toolCalls, venueIds) {
    const calls = [...toolCalls];
    const picked = new Set(calls.filter((c) => c.name === 'panToVenue').map((c) => String(c.args?.venueId)));
    for (const id of venueIds) {
        if (picked.size >= MAX_PICKS || picked.has(id)) continue;
        picked.add(id);
        calls.push({ name: 'panToVenue', args: { venueId: id } });
    }
    return calls;
}

/** "4pm", "4:30pm", "12pm" from Melbourne minutes past midnight. */
export function clockLabel(minutes) {
    const m = Math.round(Number(minutes));
    if (!Number.isFinite(m) || m < 0 || m > 1439) return null;
    const h = Math.floor(m / 60);
    const min = m % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}${min ? `:${String(min).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

function joinNames(list) {
    if (list.length <= 1) return list.join('');
    return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** A reply for when Gemini sent only tool calls. */
export function replyForToolCalls(toolCalls, names = new Map()) {
    const calls = Array.isArray(toolCalls) ? toolCalls : [];
    const picks = [...new Set(calls
        .filter((c) => c?.name === 'panToVenue')
        .map((c) => names.get(String(c.args?.venueId)))
        .filter(Boolean))].slice(0, MAX_PICKS);
    const time = calls.find((c) => c?.name === 'setTimeOfDay');
    const at = time ? clockLabel(time.args?.todMinutes) : null;
    if (picks.length) return `${picks.length === 1 ? "Here's my pick" : 'Here are my picks'}${at ? ` for ${at}` : ''}: ${joinNames(picks)}.`;
    if (at) return `Here's the map at ${at}.`;
    if (calls.some((c) => c?.name === 'setFilters')) return "I've updated the filters on the map.";
    return calls.length ? 'On it — updating the map.' : '';
}
