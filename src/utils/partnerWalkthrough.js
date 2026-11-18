/**
 * Partner preview listing check: a manager fixes a listing that disagrees with
 * itself and sees the guest card follow their answer.
 *
 * The first check is heating: a "Heaters" tag makes the guest card say
 * "Outdoor heaters" (venueOfferings), while the venue's `heating` record can
 * say "indoor only" (Mr Tulk, dv-20, in the demo data). The manager picks the
 * setup that is true; nothing is inferred for them.
 *
 * The answer stays on this device as a draft (PARTNER_DRAFT_KEY, by venue id)
 * until partner sign-in and a server write path exist. Pure, so it is tested in Node.
 *
 * Stored shape: { [venueId]: { heating: 'outdoor'|'indoor'|'unsure', updatedAt: ISO string|null } }
 */
import { normaliseTag, venueOfferings } from './venueOfferings.js';

export const PARTNER_DRAFT_KEY = 'ss-partner-walkthrough';

const HEATER_TAGS = new Set(['heaters', 'heated outdoor', 'outdoor heaters', 'outdoor heating']);
const NO_OUTDOOR_HEAT = new Set(['indoor only', 'no heating']);
const INDOOR_WARMTH = 'Indoor Warmth';

/** The three answers a manager can give. `guestSees` is the card line it leads to. */
export const HEATING_CHOICES = Object.freeze([
    { id: 'outdoor', label: 'Yes, we have outdoor heaters', guestSees: 'Guests see “Outdoor heaters”.' },
    { id: 'indoor', label: 'No, our heating is indoors only', guestSees: 'Guests see “Warm indoor space” instead.' },
    { id: 'unsure', label: 'Not sure yet', guestSees: 'Heaters stay off your card until you check.' },
]);
const CHOICE_IDS = new Set(HEATING_CHOICES.map(choice => choice.id));

const tagsOf = venue => (Array.isArray(venue?.tags) ? venue.tags.filter(tag => typeof tag === 'string') : []);
const isHeaterTag = tag => HEATER_TAGS.has(normaliseTag(tag));
const cleanText = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * The heating discrepancy, or null when the listing agrees with itself.
 * @returns {{ tag: string, record: string, summary: string, risk: string } | null}
 */
export function heatingConflict(venue) {
    const tag = tagsOf(venue).find(isHeaterTag);
    const record = typeof venue?.heating === 'string' ? venue.heating.trim() : '';
    if (!tag || !NO_OUTDOOR_HEAT.has(record.toLowerCase())) return null;
    const name = cleanText(venue?.venueName || venue?.name, 60) || 'your venue';
    return {
        tag,
        record,
        summary: `Your tags include “${tag}”, so guests are told ${name} has outdoor heaters. Your heating record says “${record}”.`,
        risk: 'A guest could come for a warm table outside and not find one.',
    };
}

/** Tags and heating record for the manager's answer; unchanged without a known answer. */
export function resolveHeating(venue, choice) {
    const tags = tagsOf(venue);
    const heating = typeof venue?.heating === 'string' ? venue.heating : null;
    if (!CHOICE_IDS.has(choice)) return { tags, heating };
    const withoutHeaters = tags.filter(tag => !isHeaterTag(tag));
    if (choice === 'outdoor') {
        return { tags: tags.some(isHeaterTag) ? tags : [...tags, 'Heaters'], heating: 'heated outdoor' };
    }
    if (choice === 'indoor') {
        const warm = withoutHeaters.some(tag => normaliseTag(tag) === 'indoor warmth');
        return { tags: warm ? withoutHeaters : [...withoutHeaters, INDOOR_WARMTH], heating: 'indoor only' };
    }
    // Not sure: unknown is never shown as yes, and the record is left as it is.
    return { tags: withoutHeaters, heating };
}

/** The venue as the guest card would show it with this answer (the same venue without one). */
export function venueWithHeating(venue, choice) {
    return CHOICE_IDS.has(choice) ? { ...venue, ...resolveHeating(venue, choice) } : venue;
}

/** Guest-card feature lines an answer adds or takes off, for the manager's note beside the preview. */
export function offeringChanges(before, after) {
    const had = new Set(venueOfferings(before).map(row => row.label));
    const has = new Set(venueOfferings(after).map(row => row.label));
    return { added: [...has].filter(label => !had.has(label)), removed: [...had].filter(label => !has.has(label)) };
}

/** Parse the stored map; anything unreadable is dropped, never thrown. */
export function restorePartnerDrafts(stored) {
    let parsed;
    try { parsed = JSON.parse(stored ?? '{}'); } catch { return {}; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [venueId, raw] of Object.entries(parsed)) {
        if (raw && typeof raw === 'object' && CHOICE_IDS.has(raw.heating)) {
            out[venueId] = { heating: raw.heating, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null };
        }
    }
    return out;
}

/** The heating answer saved for one venue, or null. */
export function partnerDraftFor(map, venueId) {
    return (venueId == null ? null : map?.[String(venueId)]?.heating) ?? null;
}

/** Save (or with null, clear) one venue's heating answer. */
export function updatePartnerDraft(map, venueId, heating, { now = new Date() } = {}) {
    if (venueId == null) return map ?? {};
    const copy = { ...(map ?? {}) };
    if (CHOICE_IDS.has(heating)) copy[String(venueId)] = { heating, updatedAt: now.toISOString() };
    else delete copy[String(venueId)];
    return copy;
}
