/**
 * Partner preview for stays. A hotel compares two of its room types on a date,
 * with its shared pool kept apart from both; a short-stay host checks one home
 * and its outdoor areas. Pure: the sun numbers come from the balcony engine
 * unchanged, on the modelled sides of the building (venues.roomTypes), and the
 * manager's answers only say which side a room type is on and what it has.
 * Nothing here is confirmed: answers stay on this device, labelled Preview only.
 *
 * @module utils/partnerStay
 */
import { calculateBalconySunDay, DEFAULT_TIME_ZONE, parseFacing, venueLocalDate } from './balconySunEngine.js';
import { formatSunDuration } from './formatSunDuration.js';
import { clockLabel } from './partnerToday.js';
import { propertyTypeCategory } from './propertyTypes.js';
import { roomSunOptions } from './stayRanking.js';
import { ROOM_TYPE_KIND, stayRoomTypesDisplay } from './stayRoomTypes.js';
import { normaliseTag } from './venueOfferings.js';
import { venueKind } from './venueKind.js';
import { venueTimeParts } from './venueTime.js';

export const PARTNER_STAY_KEY = 'ss-partner-stay';
export const ROOM_LETTERS = Object.freeze(['A', 'B']);
export const ROOM_NAME_MAX = 40;
export const OUTDOOR_CHOICES = Object.freeze([
    { id: 'balcony', label: 'Balcony' },
    { id: 'juliet', label: 'Juliet balcony' },
    { id: 'window_only', label: 'Window only' },
]);
export const POOL_CHOICES = Object.freeze([
    { id: 'rooftop', label: 'Rooftop pool' },
    { id: 'ground', label: 'Ground or podium pool' },
    { id: 'indoor', label: 'Indoor pool' },
    { id: 'none', label: 'No pool' },
]);
export const GARDEN_CHOICES = Object.freeze([
    { id: 'private', label: 'Only these guests', tag: 'Private garden' },
    { id: 'shared', label: 'Shared with other residents', tag: 'Shared garden' },
    { id: 'none', label: 'No garden for guests', tag: null },
]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A bar or restaurant in the stay's own listing is what makes specials and events fit.
const FOOD_AND_DRINK = /\b(?:(?:lobby|rooftop|cocktail|wine|hotel|lounge|pool)\s+)?(?:bars?|restaurants?|bistro|brasserie|caf[eé]s?|dining)\b/i;
const SAME_SUN_MINUTES = 15;

const tz = venue => venue?.timeZone ?? venue?.timezone ?? DEFAULT_TIME_ZONE;
const tagSet = venue => new Set((Array.isArray(venue?.tags) ? venue.tags : []).map(normaliseTag));

/** The phrase in the stay's own listing that says it serves food or drink ("lobby bar"), or null. */
export function stayFoodAndDrink(venue) {
    const sources = [venue?.typeLabel, ...(Array.isArray(venue?.tags) ? venue.tags : []), venue?.venue_description, venue?.opening_hours];
    for (const source of sources) {
        const match = typeof source === 'string' ? FOOD_AND_DRINK.exec(source) : null;
        if (match) return match[0].toLowerCase();
    }
    return null;
}

/**
 * Which first screen a partner gets, from the existing classification:
 * venueKind (stays, pubs, bars, cafés…) and propertyTypeCategory (Hotel,
 * Serviced apartment, Short stay, Residential). Venues that aren't stays keep
 * today's service screen with specials and events; a stay keeps them only when
 * its listing names a bar or restaurant.
 */
export function partnerProfile(venue) {
    const category = propertyTypeCategory(venue?.typeCategory);
    const kind = venueKind(venue);
    if (category === 'Short stay' || category === 'Residential') {
        return { key: 'short-stay', lead: 'home', heading: 'Your home', specials: false, events: false, offer: null };
    }
    if (kind === 'stay') {
        const offer = stayFoodAndDrink(venue);
        return { key: category === 'Serviced apartment' ? 'serviced-apartment' : 'hotel', lead: 'rooms', heading: 'Room sun',
            specials: Boolean(offer), events: Boolean(offer), offer };
    }
    return { key: kind, lead: 'service', heading: 'Today', specials: true, events: true, offer: null };
}

/** YYYY-MM-DD plus whole days, on the calendar. */
function addDays(date, days) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The dates a manager can pick: today at the venue to a year ahead. */
export function stayDateRange(now, timeZone = DEFAULT_TIME_ZONE) {
    const today = venueLocalDate(now, timeZone);
    return { today, max: addDays(today, 365) };
}

/** A stored or typed date inside the range, else today. */
export function clampStayDate(value, range) {
    return typeof value === 'string' && DATE.test(value) && value >= range.today && value <= range.max ? value : range.today;
}

/** "Sat 21 Nov" for a venue-local calendar date. */
export function stayDateLabel(date) {
    if (typeof date !== 'string' || !DATE.test(date)) return '';
    const [year, month, day] = date.split('-').map(Number);
    return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]} ${day} ${MONTHS[month - 1]}`;
}

/** "9:50am–1:33pm, 5:15–7:35pm": windows that touch are one window. */
export function sunWindowsText(windows, timeZone = DEFAULT_TIME_ZONE) {
    const merged = [];
    for (const window of windows ?? []) {
        const start = new Date(window.start).getTime(), end = new Date(window.end).getTime();
        if (!(end > start)) continue;
        const last = merged.at(-1);
        if (last && start - last[1] <= 60_000) last[1] = Math.max(last[1], end);
        else merged.push([start, end]);
    }
    const at = ms => { const p = venueTimeParts(ms, timeZone); return clockLabel(p.hour * 60 + p.minute); };
    return merged.map(([start, end]) => {
        const from = at(start), to = at(end);
        // "5:15–7:35pm" when both ends share am or pm.
        return from.slice(-2) === to.slice(-2) && /\d[ap]m$/.test(from) ? `${from.slice(0, -2)}–${to}` : `${from}–${to}`;
    }).join(', ');
}

/** The building's modelled sides, named as the guest card names them ("East side · Level 5"). */
export function staySides(venue) {
    const rooms = Array.isArray(venue?.roomTypes) ? venue.roomTypes : [];
    if (!rooms.length) return [];
    const display = stayRoomTypesDisplay({ ...venue, roomTypes: rooms });
    return rooms.map((room, index) => ({ id: display.entries[index].id, title: display.entries[index].title,
        label: display.entries[index].displayName, level: display.entries[index].level, room }))
        .filter(side => side.room && typeof side.room === 'object' && parseFacing(side.room.orientation) !== null);
}

/** Direct sun on one side on one date, or null when its geometry can't be read. */
export function sideSun(venue, side, date) {
    try {
        const day = calculateBalconySunDay({ ...roomSunOptions(venue, side.room), date });
        return { totalMinutes: day.totalMinutes, durationText: formatSunDuration(day.totalMinutes),
            windowsText: day.totalMinutes > 0 ? sunWindowsText(day.windows, tz(venue)) : 'No direct sun',
            morning: day.morningCoffee.available, sunset: day.sunsetDrinks.available };
    } catch { return null; }
}

/** Two room types to start from: the sunniest and the shadiest side on that date, both unnamed. */
export function defaultRoomTypes(venue, date) {
    const ranked = staySides(venue).map(side => ({ side, minutes: sideSun(venue, side, date)?.totalMinutes ?? -1 }))
        .sort((a, b) => b.minutes - a.minutes);
    const picks = ranked.length > 1 ? [ranked[0], ranked.at(-1)] : ranked;
    return ROOM_LETTERS.map((letter, index) => ({ name: '', sideId: picks[index]?.side.id ?? null, outdoor: null }));
}

// Kept as typed (a trailing space is the next word on its way); trimmed wherever it's used.
const roomName = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').replace(/^ /, '').slice(0, ROOM_NAME_MAX) : '');
const nameOf = room => (typeof room?.name === 'string' ? room.name.trim() : '');

function sanitiseRoom(raw) {
    const outdoor = OUTDOOR_CHOICES.some(choice => choice.id === raw?.outdoor) ? raw.outdoor : null;
    return { name: roomName(raw?.name), sideId: typeof raw?.sideId === 'string' ? raw.sideId : null, outdoor };
}

/** One venue's stay answers, cleaned. Missing parts come back as null, never invented. */
export function sanitiseStayDraft(raw) {
    const rooms = Array.isArray(raw?.rooms) && raw.rooms.length === ROOM_LETTERS.length ? raw.rooms.map(sanitiseRoom) : null;
    return {
        date: typeof raw?.date === 'string' && DATE.test(raw.date) ? raw.date : null,
        rooms,
        pool: POOL_CHOICES.some(choice => choice.id === raw?.pool) ? raw.pool : null,
        garden: GARDEN_CHOICES.some(choice => choice.id === raw?.garden) ? raw.garden : null,
    };
}

/** The stored map ({ [venueId]: draft }), cleaned; anything unreadable is dropped. */
export function restoreStayDrafts(stored) {
    let parsed;
    try { parsed = typeof stored === 'string' ? JSON.parse(stored) : stored; } catch { return {}; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, draft]) => draft && typeof draft === 'object')
        .map(([venueId, draft]) => [venueId, sanitiseStayDraft(draft)]));
}

/** The map with one venue's draft merged with `patch`; other venues are untouched. */
export function updateStayDraft(map, venueId, patch) {
    return { ...map, [venueId]: sanitiseStayDraft({ ...map?.[venueId], ...patch }) };
}

/** The room types to show: the saved pair when it still fits the building's sides, else the starting pair. */
export function roomTypesFor(venue, draft, date) {
    const sides = new Set(staySides(venue).map(side => side.id));
    const saved = draft?.rooms;
    return saved && saved.every(room => room.sideId == null || sides.has(room.sideId)) ? saved : defaultRoomTypes(venue, date);
}

/**
 * Two room types side by side on one date. Each row says what's modelled and
 * lists what isn't known yet; `verdict` compares only rooms with a side.
 */
export function compareRoomTypes({ venue, rooms, date }) {
    const sides = staySides(venue);
    const rows = rooms.map((room, index) => {
        const letter = ROOM_LETTERS[index];
        const named = Boolean(nameOf(room));
        const name = named ? nameOf(room) : `Room type ${letter}`;
        const side = sides.find(entry => entry.id === room.sideId) ?? null;
        const outdoor = OUTDOOR_CHOICES.find(choice => choice.id === room.outdoor) ?? null;
        const unknowns = [];
        if (!named) unknowns.push('Room name not set');
        if (!side) unknowns.push('Side of the building not set');
        if (!outdoor) unknowns.push('Balcony or window not recorded');
        if (side && outdoor && outdoor.id !== 'window_only' && !side.room.overhang) unknowns.push('Balcony roof not modelled');
        if (side) unknowns.push(side.level ? `Sun modelled at ${side.level} only` : 'Floor not recorded');
        const sun = side ? sideSun(venue, side, date) : null;
        if (side && !sun) unknowns.push('Sun on this side can’t be modelled');
        return {
            key: letter, name, named, sideId: side?.id ?? null, sideLabel: side?.label ?? null,
            outdoor: outdoor?.id ?? null, outdoorLabel: outdoor?.label ?? 'Not recorded',
            sunLabel: outdoor && outdoor.id !== 'window_only' ? 'Balcony sun' : 'Window sun',
            sun, unknowns,
        };
    });
    const [a, b] = rows;
    let verdict = null;
    if (a?.sun && b?.sun) {
        const gap = a.sun.totalMinutes - b.sun.totalMinutes;
        verdict = Math.abs(gap) < SAME_SUN_MINUTES ? `About the same sun on ${stayDateLabel(date)}`
            : `${gap > 0 ? a.name : b.name} gets ${formatSunDuration(Math.abs(gap))} more sun on ${stayDateLabel(date)}`;
    }
    return { date, dateLabel: stayDateLabel(date), rows, verdict };
}

/**
 * The shared pool, never mixed into a room type's sun. Recorded facts first;
 * the manager's answer fills the gap. A rooftop pool gets open-sky sun, with
 * the towers around it called out as not modelled; any other pool's sun is
 * unknown until its position is recorded.
 */
export function sharedPoolView({ venue, answer = null, date }) {
    const recorded = venue?.hasPool === true || ['pool', 'outdoor pool', 'rooftop pool'].some(tag => tagSet(venue).has(tag));
    const choice = POOL_CHOICES.find(entry => entry.id === answer) ?? null;
    if (!choice) {
        return recorded
            ? { status: 'recorded', title: 'Shared pool', text: 'Your listing has a pool. Where is it?', unknowns: ['Pool position not recorded'] }
            : { status: 'unknown', title: 'Shared pool', text: 'Not recorded. Guests aren’t told about a pool.', unknowns: ['Whether there’s a pool'] };
    }
    if (choice.id === 'none') return { status: 'none', title: 'No pool', text: 'Guests aren’t told about a pool.', unknowns: [] };
    if (choice.id === 'indoor') return { status: 'indoor', title: 'Indoor pool', text: 'Indoors, so there’s no sun to model.', unknowns: [] };
    if (choice.id === 'ground') {
        return { status: 'position', title: 'Ground or podium pool', text: 'Sun not modelled: the pool’s position isn’t recorded.',
            unknowns: ['Pool position not recorded', 'Shade from the building and its neighbours'] };
    }
    try {
        const day = calculateBalconySunDay({ lat: Number(venue.lat), lng: Number(venue.lng), facing: null, date, timeZone: tz(venue) });
        return { status: 'open-sky', title: 'Rooftop pool',
            text: `Up to ${formatSunDuration(day.totalMinutes)} of sun on ${stayDateLabel(date)} under open sky`,
            unknowns: ['Nearby towers not modelled', 'Where the pool sits on the roof'] };
    } catch {
        return { status: 'position', title: 'Rooftop pool', text: 'Sun not modelled: the venue’s location is missing.', unknowns: ['Venue location'] };
    }
}

/**
 * A short-stay home's outdoor areas. A balcony belongs to the home (it sits on
 * the home's modelled side, so its sun is calculated); a pool or terrace is
 * shared, as stays treat them elsewhere (partnerOutdoorSpace); a garden or
 * courtyard could be either, so the host says, and until then it's unknown.
 */
export function homeOutdoorView({ venue, garden = null, date }) {
    const tags = tagSet(venue);
    const rooms = Array.isArray(venue?.roomTypes) ? venue.roomTypes : [];
    const sides = staySides(venue);
    const balconyRoom = rooms.find(room => room?.hasBalcony === true);
    const side = sides.find(entry => entry.room === balconyRoom) ?? sides[0] ?? null;
    const hasBalcony = venue?.hasBalcony === true || Boolean(balconyRoom) || tags.has('balcony') || tags.has('private balcony');
    const privateArea = hasBalcony ? {
        title: 'Private balcony',
        sideLabel: side?.label ?? null,
        sun: side ? sideSun(venue, side, date) : null,
        unknowns: [...(side ? [side.level ? `Sun modelled at ${side.level} only` : 'Floor not recorded'] : ['Which side the balcony faces']),
            'Balcony depth and roof not recorded'],
    } : null;
    const shared = [];
    if (venue?.hasPool === true || tags.has('pool')) shared.push({ title: 'Shared pool', text: 'Sun not modelled: its position isn’t recorded.' });
    if (venue?.hasTerrace === true || tags.has('terrace')) shared.push({ title: 'Shared terrace', text: 'Sun not modelled: its position isn’t recorded.' });
    const gardenTag = ['garden', 'courtyard'].find(tag => tags.has(tag)) ?? null;
    const choice = GARDEN_CHOICES.find(entry => entry.id === garden) ?? null;
    let ask = null;
    if (gardenTag) {
        const noun = gardenTag === 'garden' ? 'garden' : 'courtyard';
        ask = { noun, question: `Who can use the ${noun}?`, answer: choice?.id ?? null };
        if (choice?.id === 'shared') shared.push({ title: `Shared ${noun}`, text: 'Sun not modelled: its position isn’t recorded.' });
        if (choice?.id === 'private') shared.push({ title: `Private ${noun}`, private: true, text: 'Sun not modelled: its position isn’t recorded.' });
    }
    const unknowns = [...(privateArea?.unknowns ?? [])];
    if (ask && !choice) unknowns.unshift(`Whether the ${ask.noun} is private or shared`);
    if (shared.length) unknowns.push(`Where the ${shared.map(area => area.title.replace(/^(Shared|Private) /, '')).join(' and ')} ${shared.length > 1 ? 'are' : 'is'}`);
    return { private: privateArea, shared, ask, unknowns, sideLabel: side?.label ?? null };
}

/**
 * The guest card with this preview's stay answers on it. Named room types
 * become the hotel's own room types (still modelled, so the card says so);
 * the host's garden answer replaces the bare "Garden" tag. Guests still see the
 * current listing.
 */
export function stayGuestVenue(venue, { rooms = null, garden = null } = {}) {
    let next = venue;
    const sides = staySides(venue);
    if (rooms?.length && rooms.every(room => nameOf(room) && sides.some(side => side.id === room.sideId))) {
        next = { ...next, roomTypes: rooms.map((room, index) => {
            const side = sides.find(entry => entry.id === room.sideId);
            const { name: _sideName, id: _sideId, ...geometry } = side.room;
            return { ...geometry, id: `${venue.id}-preview-room-${ROOM_LETTERS[index].toLowerCase()}`, kind: ROOM_TYPE_KIND,
                name: nameOf(room), source: 'partner-preview', ...(room.outdoor ? { outdoorSpace: room.outdoor } : {}) };
        }) };
    }
    const choice = GARDEN_CHOICES.find(entry => entry.id === garden) ?? null;
    if (choice && Array.isArray(next.tags)) {
        const tags = next.tags.filter(tag => !['garden', 'courtyard'].includes(normaliseTag(tag)));
        next = { ...next, tags: choice.tag ? [...tags, choice.tag] : tags };
    }
    return next;
}

/** The before-you-host list for a stay, in order; `target` names the part of the preview a row opens. */
export function partnerStayTasks({ profile, venue, date, rooms = [], pool = null, garden = null, guestChecked = false }) {
    const tasks = [];
    // Room types need the building's sides to sit on; without them there's nothing to place yet.
    if (profile.lead === 'rooms' && staySides(venue).length) {
        const named = rooms.every(room => nameOf(room));
        const done = named && rooms.every(room => room.sideId && room.outdoor);
        tasks.push({ key: 'rooms', icon: 'hotel-views', target: 'rooms', done,
            title: done ? 'Room types compared' : named ? 'Finish your room types' : 'Name the two room types',
            detail: done ? 'Side and balcony or window set for both' : 'Pick their side of the building and what they have' });
    }
    if (profile.lead === 'rooms') {
        tasks.push({ key: 'pool', icon: 'umbrella', target: 'pool', done: Boolean(pool),
            title: pool ? 'Pool answered' : 'Tell us about a pool', detail: 'Shown apart from your rooms' });
    } else {
        const view = homeOutdoorView({ venue, garden, date });
        if (view.ask) tasks.push({ key: 'garden', icon: 'botanical', target: 'garden', done: Boolean(garden),
            title: garden ? `${view.ask.noun[0].toUpperCase()}${view.ask.noun.slice(1)} answered` : view.ask.question, detail: 'Private or shared changes what guests expect' });
    }
    tasks.push({ key: 'guest', icon: 'sparkles', target: 'guest', done: guestChecked,
        title: guestChecked ? 'Guest card checked' : 'Check your guest card', detail: 'See it the way guests do' });
    return tasks;
}
