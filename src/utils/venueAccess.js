import { finiteOrNull } from './finiteOrNull.js';
import { normaliseTag } from './venueOfferings.js';

/**
 * "Getting in and around": the venue's declared access facts in plain English.
 *
 * Reads the nullable access_* columns (supabase/migrations/
 * 20261028000000_venue_access_facts.sql). NULL means not known, so a fact is
 * shown only when it was stated; nothing is inferred. A venue with no access
 * columns but a "Wheelchair Accessible" tag gets that one line, labelled as a
 * listing tag rather than a checked fact.
 *
 * `icon` is a clay icon name (src/assets/clay).
 *
 * @returns {{
 *   facts: Array<{ key: string, icon: 'ramp'|'stairs'|'lift'|'toilet'|'wheelchair', text: string, tone: 'good'|'heads-up' }>,
 *   source: 'venue'|'sunstay_visit'|'tag'|null,
 *   verifiedAt: string|null,
 * }}
 */
export function venueAccessFacts(venue) {
    const facts = [];
    const add = (key, icon, text, tone) => facts.push({ key, icon, text, tone });
    const text = value => (typeof value === 'string' && value.trim() ? value.trim() : null);
    const bool = value => (value === true || value === false ? value : null);

    const stepFree = bool(venue?.access_step_free_entry);
    const steps = finiteOrNull(venue?.access_entry_steps);
    if (stepFree === true || steps === 0) add('entry', 'ramp', 'Step-free entry', 'good');
    else if (steps != null && steps > 0) add('entry', 'stairs', `${steps} ${steps === 1 ? 'step' : 'steps'} at the entry`, 'heads-up');
    else if (stepFree === false) add('entry', 'stairs', 'Steps at the entry', 'heads-up');

    const lift = bool(venue?.access_lift);
    const liftFloors = text(venue?.access_lift_floors);
    if (lift === true) add('lift', 'lift', liftFloors ? `Lift to ${liftFloors}` : 'Lift to every guest area', 'good');
    else if (lift === false) add('lift', 'lift', liftFloors ? `Lift to ${liftFloors} only` : 'No lift', 'heads-up');
    else if (liftFloors) add('lift', 'lift', `Lift to ${liftFloors}`, 'good');

    const stairsOnly = text(venue?.access_stairs_only_areas);
    if (stairsOnly) add('stairs-only', 'stairs', `Stairs only to: ${stairsOnly}`, 'heads-up');

    const accessibleToilet = bool(venue?.access_accessible_toilet);
    const accessibleFloor = text(venue?.access_accessible_toilet_floor);
    if (accessibleToilet === true) add('accessible-toilet', 'wheelchair', accessibleFloor ? `Accessible toilet (${accessibleFloor})` : 'Accessible toilet', 'good');
    else if (accessibleToilet === false) add('accessible-toilet', 'wheelchair', 'No accessible toilet', 'heads-up');

    const level = ['same floor', 'upstairs', 'downstairs'].includes(venue?.access_toilet_level) ? venue.access_toilet_level : null;
    const metres = finiteOrNull(venue?.access_toilet_distance_m);
    const distance = metres != null && metres >= 0 ? `about ${Math.max(5, Math.round(metres / 5) * 5)} m` : null;
    const where = level === 'same floor' ? 'on the same floor' : level;
    if (where || distance) {
        add('nearest-toilet', 'toilet', `Nearest toilet ${[where, distance && `${distance} from the bar`].filter(Boolean).join(', ')}`,
            level && level !== 'same floor' ? 'heads-up' : 'good');
    }

    const declared = facts.length > 0;
    const source = ['venue', 'sunstay_visit'].includes(venue?.access_source) ? venue.access_source : null;
    if (!declared) {
        const tags = Array.isArray(venue?.tags) ? venue.tags.map(normaliseTag) : [];
        if (tags.some(tag => tag === 'wheelchair accessible' || tag === 'step free')) {
            return { facts: [{ key: 'tag', icon: 'wheelchair', text: 'Listed as wheelchair accessible', tone: 'good' }], source: 'tag', verifiedAt: null };
        }
        return { facts: [], source: null, verifiedAt: null };
    }
    const verified = typeof venue?.access_verified_at === 'string' && Number.isFinite(Date.parse(venue.access_verified_at))
        ? venue.access_verified_at : null;
    return { facts, source, verifiedAt: verified };
}

/** "Confirmed by the venue, Oct 2026", "Checked by SunStay, Oct 2026", or a plain fallback. */
export function accessSourceLine({ source, verifiedAt }, { timeZone = 'Australia/Melbourne' } = {}) {
    if (source === 'tag') return 'From the venue listing, not yet confirmed';
    const who = source === 'venue' ? 'Confirmed by the venue' : source === 'sunstay_visit' ? 'Checked by SunStay' : 'Venue access details';
    if (!verifiedAt) return who;
    const when = new Intl.DateTimeFormat('en-AU', { timeZone, month: 'short', year: 'numeric' }).format(new Date(verifiedAt));
    return `${who}, ${when}`;
}
