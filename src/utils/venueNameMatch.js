/**
 * Venues the guest named in a message ("Wonderland bar", "the railway hotel"),
 * from every venue in the app, not just those in view. Sunny gets these first,
 * so it never says a named venue "isn't on the map" while it is.
 */
const GENERIC_TAIL = /\s+(bar|hotel|pub|cafe|café|restaurant|tavern|lounge|rooftop|bar and grill|bar and kitchen)$/;
// A trimmed name this common would match ordinary words ("the corner", "the local").
const TOO_COMMON = new Set(['corner', 'local', 'garden', 'terrace', 'kitchen', 'rooftop', 'market', 'station', 'social', 'common', 'public', 'beach', 'house', 'park', 'club', 'deck']);

export function normaliseName(text) {
    return String(text ?? '')
        .toLowerCase()
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/&/g, ' and ')
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/^the\s+/, '')
        .trim()
        .replace(/\s+/g, ' ');
}

const hasPhrase = (haystack, phrase) => phrase.length > 0 && ` ${haystack} `.includes(` ${phrase} `);

/** @returns {object[]} up to `max` venues, full-name matches first. */
export function venuesNamedInText(text, venues, max = 3) {
    const said = normaliseName(text);
    if (said.length < 4 || !Array.isArray(venues)) return [];
    const full = [];
    const core = [];
    for (const venue of venues) {
        const name = normaliseName(venue?.venueName ?? venue?.name);
        if (name.length < 4) continue;
        if (hasPhrase(said, name)) { full.push({ venue, len: name.length }); continue; }
        const trimmed = name.replace(GENERIC_TAIL, '');
        if (trimmed !== name && trimmed.length >= 5 && !TOO_COMMON.has(trimmed) && hasPhrase(said, trimmed)) {
            core.push({ venue, len: trimmed.length });
        }
    }
    const byLength = (a, b) => b.len - a.len;
    return [...full.sort(byLength), ...core.sort(byLength)].slice(0, max).map(entry => entry.venue);
}

/** Named venues go first in Sunny's focus list, without duplicates. */
export function withNamedVenues(focus, named) {
    const base = focus && typeof focus === 'object' ? focus : { label: null, venues: [], asked: [], amenityMatches: null };
    const list = Array.isArray(named) ? named : [];
    if (!list.length) return base;
    const ids = new Set(list.map(v => String(v?.id)));
    return { ...base, venues: [...list, ...(Array.isArray(base.venues) ? base.venues : []).filter(v => !ids.has(String(v?.id)))] };
}
