/**
 * Partner tools: what a venue can add in the partner preview (OwnerDashboard)
 * beyond the live switches. That covers happy hour and specials, tonight's
 * events, access facts, and the outdoor setup.
 *
 * Like the live switches (useVenueFeatures), these stay on this device until
 * partner sign-in and a server write path exist. Everything read back from
 * storage goes through these sanitisers, so a bad or old entry can't break the
 * venue card. Pure, apart from `today`/`now` passed in, so it is tested in Node.
 *
 * Stored shape (localStorage PARTNER_TOOLS_KEY, keyed by venue id):
 *   { happyHour: { days: ['Mon'…], start: 'HH:MM', end: 'HH:MM', deal } | null,
 *     events: [{ id, title, kind, date: 'YYYY-MM-DD', start: 'HH:MM' }],
 *     access: { access_step_free_entry, access_entry_steps, access_lift, access_lift_floors,
 *               access_accessible_toilet, access_toilet_level, access_toilet_distance_m },
 *     outdoor: { seats, umbrellas, awning, retractableRoof, heaters, dogFriendly },
 *     updatedAt: ISO string }
 */
export const PARTNER_TOOLS_KEY = 'ss-partner-tools';
/** Fired on window after a write, so an open venue card updates straight away. */
export const PARTNER_TOOLS_EVENT = 'ss-partner-tools-change';

export const PARTNER_DAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
export const EVENT_KINDS = Object.freeze({
    'live-music': { label: 'Live music', icon: 'live-music' },
    trivia: { label: 'Trivia', icon: 'sparkles' },
    dj: { label: 'DJ', icon: 'party' },
    comedy: { label: 'Comedy', icon: 'party' },
    sport: { label: 'Sport on the screens', icon: 'people-watching' },
    other: { label: 'Event', icon: 'sparkles' },
});
export const MAX_EVENTS = 10;
export const EVENT_DAYS_AHEAD = 60;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const bool = value => (value === true || value === false ? value : null);
const intIn = (value, min, max) => (Number.isInteger(value) && value >= min && value <= max ? value : null);
const minutes = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const addDays = (isoDate, days) => {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

/** { days, start, end, deal } in the shape the card's HappyHourSection already reads, or null. */
export function sanitiseHappyHour(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const days = PARTNER_DAYS.filter(day => Array.isArray(raw.days) && raw.days.includes(day));
    const start = TIME.test(raw.start ?? '') ? raw.start : null;
    const end = TIME.test(raw.end ?? '') ? raw.end : null;
    const deal = text(raw.deal, 80);
    const hasTimes = days.length > 0 && start && end && minutes(end) > minutes(start);
    if (!hasTimes && !deal) return null;
    return hasTimes ? { days, start, end, deal: deal || null } : { days: [], start: null, end: null, deal };
}

/** One event, kept only from today up to EVENT_DAYS_AHEAD days out. */
export function sanitiseEvent(raw, today) {
    if (!raw || typeof raw !== 'object' || !DATE.test(today ?? '')) return null;
    const title = text(raw.title, 60);
    const kind = Object.hasOwn(EVENT_KINDS, raw.kind) ? raw.kind : 'other';
    const date = DATE.test(raw.date ?? '') ? raw.date : null;
    const start = TIME.test(raw.start ?? '') ? raw.start : null;
    if (!date || !start || date < today || date > addDays(today, EVENT_DAYS_AHEAD)) return null;
    const id = text(String(raw.id ?? ''), 40) || `${date}-${start}-${kind}`;
    return { id, title: title || EVENT_KINDS[kind].label, kind, date, start };
}

/** Access facts with the same limits as the venues table's checks (20261028000000_venue_access_facts.sql). */
export function sanitiseAccess(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const out = {
        access_step_free_entry: bool(raw.access_step_free_entry),
        access_entry_steps: intIn(raw.access_entry_steps, 0, 200),
        access_lift: bool(raw.access_lift),
        access_lift_floors: text(raw.access_lift_floors, 60) || null,
        access_accessible_toilet: bool(raw.access_accessible_toilet),
        access_toilet_level: ['same floor', 'upstairs', 'downstairs'].includes(raw.access_toilet_level) ? raw.access_toilet_level : null,
        access_toilet_distance_m: intIn(raw.access_toilet_distance_m, 0, 500),
    };
    return Object.values(out).some(value => value !== null) ? out : null;
}

export function sanitiseOutdoor(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const out = {
        seats: intIn(raw.seats, 0, 2000),
        umbrellas: bool(raw.umbrellas),
        awning: bool(raw.awning),
        retractableRoof: bool(raw.retractableRoof),
        heaters: bool(raw.heaters),
        dogFriendly: bool(raw.dogFriendly),
    };
    return Object.values(out).some(value => value !== null) ? out : null;
}

/** One venue's tools, cleaned. Null when nothing is set. */
export function sanitisePartnerTools(raw, today) {
    if (!raw || typeof raw !== 'object') return null;
    const events = (Array.isArray(raw.events) ? raw.events : [])
        .map(event => sanitiseEvent(event, today)).filter(Boolean)
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
        .filter((event, index, all) => all.findIndex(other => other.id === event.id) === index)
        .slice(0, MAX_EVENTS);
    const tools = {
        happyHour: sanitiseHappyHour(raw.happyHour),
        events,
        access: sanitiseAccess(raw.access),
        outdoor: sanitiseOutdoor(raw.outdoor),
    };
    if (!tools.happyHour && !events.length && !tools.access && !tools.outdoor) return null;
    return { ...tools, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null };
}

/** Parse the stored map; anything unreadable is dropped, never thrown. */
export function restorePartnerTools(stored, today) {
    let parsed;
    try { parsed = JSON.parse(stored ?? '{}'); } catch { return {}; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [venueId, raw] of Object.entries(parsed)) {
        const tools = sanitisePartnerTools(raw, today);
        if (tools) out[venueId] = tools;
    }
    return out;
}

/**
 * Apply one section's change for a venue. `section` is happyHour, events,
 * access or outdoor; `value` replaces that section (null clears it).
 */
export function updatePartnerTools(map, venueId, section, value, { today, now = new Date() } = {}) {
    if (venueId == null || !['happyHour', 'events', 'access', 'outdoor'].includes(section)) return map;
    const id = String(venueId);
    const next = sanitisePartnerTools({ ...(map?.[id] ?? {}), [section]: value, updatedAt: now.toISOString() }, today);
    const copy = { ...(map ?? {}) };
    if (next) copy[id] = next;
    else delete copy[id];
    return copy;
}

/** The venue with the partner's access facts laid over it, marked as a partner preview. */
export function withPartnerAccess(venue, tools) {
    if (!tools?.access) return venue;
    const facts = Object.fromEntries(Object.entries(tools.access).filter(([, value]) => value !== null));
    return { ...venue, ...facts, access_source: 'partner_preview', access_verified_at: tools.updatedAt ?? null };
}

const formatTime = hhmm => {
    const h = Number(hhmm.slice(0, 2));
    const m = hhmm.slice(3);
    const hour = h % 12 || 12;
    return `${hour}${m === '00' ? '' : `:${m}`}${h < 12 ? 'am' : 'pm'}`;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Tonight 7:30pm", "Tomorrow 9pm", "Fri 8pm" within the coming week, and
 * "Sat 21 Nov, 8pm" from a week out, so a weekday never points at the wrong week.
 * Built by hand rather than with Intl so every browser shows the same text.
 */
function eventWhen(event, today) {
    const time = formatTime(event.start);
    if (event.date === today) return `${minutes(event.start) >= 17 * 60 ? 'Tonight' : 'Today'} ${time}`;
    if (event.date === addDays(today, 1)) return `Tomorrow ${time}`;
    const d = new Date(`${event.date}T12:00:00Z`);
    const weekday = WEEKDAYS[d.getUTCDay()];
    if (event.date <= addDays(today, 6)) return `${weekday} ${time}`;
    return `${weekday} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${time}`;
}

/** Events to show on the card: today's from an hour ago, then upcoming ones, labelled by eventWhen. */
export function upcomingPartnerEvents(events, { today, nowMinutes, limit = 3 } = {}) {
    if (!Array.isArray(events) || !DATE.test(today ?? '')) return [];
    return events
        .filter(event => event.date > today || (event.date === today && minutes(event.start) >= (nowMinutes ?? 0) - 60))
        .slice(0, limit)
        .map(event => {
            return { ...event, when: eventWhen(event, today), icon: EVENT_KINDS[event.kind].icon, kindLabel: EVENT_KINDS[event.kind].label };
        });
}

/** Outdoor setup as short chips for the card. */
export function outdoorChips(outdoor) {
    if (!outdoor) return [];
    const chips = [];
    if (Number.isInteger(outdoor.seats) && outdoor.seats > 0) chips.push({ key: 'seats', icon: 'garden-table', label: `${outdoor.seats} outdoor seats` });
    if (outdoor.umbrellas) chips.push({ key: 'umbrellas', icon: 'umbrella', label: 'Umbrellas' });
    if (outdoor.awning) chips.push({ key: 'awning', icon: 'pergola', label: 'Awning' });
    if (outdoor.retractableRoof) chips.push({ key: 'roof', icon: 'sheltered-balcony', label: 'Retractable roof' });
    if (outdoor.heaters) chips.push({ key: 'heaters', icon: 'heater', label: 'Outdoor heaters' });
    if (outdoor.dogFriendly) chips.push({ key: 'dogs', icon: 'brucey', label: 'Dog friendly' });
    return chips;
}

/** Shown wherever partner-preview data appears for guests, so nobody mistakes it for confirmed info. */
export const PARTNER_PREVIEW_NOTE = 'From the partner preview on this device';

/** Today's date and the minute of the day in the venue's time zone (default Melbourne). */
export function partnerClock(now = new Date(), timeZone = 'Australia/Melbourne') {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = type => parts.find(part => part.type === type)?.value;
    return { today: `${get('year')}-${get('month')}-${get('day')}`, nowMinutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
