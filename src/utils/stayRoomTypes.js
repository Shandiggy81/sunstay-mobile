/**
 * Display contract for a stay's sun entries (docs/design/room-type-sun-proposal.md §5).
 *
 * Today every `venues.roomTypes` entry is a modelled facade side at one floor
 * ("North-facing rooms · Level 19"), not a room the guest can book. Until a stay
 * has real hotel room types, it is shown as "Sun by side of the building" with no
 * room picker and no room wording. Pure: no sun maths here, the sun numbers come
 * from buildHotelSunReport and the balcony engine unchanged.
 */
import { parseFacing } from './balconySunEngine.js';
import { buildHotelSunReport } from './hotelSunReport.js';
import { directionName } from './roomProfiles.js';

export const STAY_SUN_MODES = Object.freeze({ FACADE_SIDES: 'facade_sides', ROOM_TYPES: 'room_types' });
/** Marks an entry as the hotel's own bookable room type. No production data has it yet. */
export const ROOM_TYPE_KIND = 'room_type';
export const EVIDENCE = Object.freeze({ MODELLED: 'modelled', HOTEL_CONFIRMED: 'hotel_confirmed', ON_SITE_CHECKED: 'on_site_checked' });

export const FACADE_SIDES_HEADLINE = 'Sun by side of the building';
export const FACADE_TRUST_LINE = 'Modelled from building footprint and neighbours';
export const MODELLED_ROOM_TRUST_LINE = 'Modelled · Hotel-confirmed (next) · On-site checked (not yet)';

const OUTDOOR_SPACES = new Set(['balcony', 'juliet', 'terrace']);
const ESTIMATED_SOURCES = new Set(['estimated', 'estimated-buildings']);

const text = value => typeof value === 'string' ? value.trim() : '';
const hasLevel = level => level != null && String(level).trim() !== '';

/** Only an entry explicitly marked as a hotel room type, with a name and not from the facade model, counts. */
export function isHotelRoomType(entry) {
  return entry?.kind === ROOM_TYPE_KIND && Boolean(text(entry.name)) && !ESTIMATED_SOURCES.has(entry.source);
}

/** 'room_types' only when every entry is a hotel room type; anything else stays facade sides. */
export function stayRoomTypeMode(roomTypes) {
  const entries = Array.isArray(roomTypes) ? roomTypes : [];
  return entries.length > 0 && entries.every(isHotelRoomType) ? STAY_SUN_MODES.ROOM_TYPES : STAY_SUN_MODES.FACADE_SIDES;
}

function validDate(value) {
  if (value == null || value === '') return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time) : null;
}

// A fact counts at its level only while it is dated and not past expires_at.
function current(fact, now) {
  const confirmed = validDate(fact?.confirmedAt ?? fact?.confirmed_at);
  if (!confirmed || confirmed > now) return null;
  const expires = validDate(fact?.expiresAt ?? fact?.expires_at);
  return expires && expires <= now ? null : confirmed;
}

/** Evidence ladder for one room type (§5). Facade sides are always modelled. */
export function roomTypeEvidence(entry, { now = new Date() } = {}) {
  if (!isHotelRoomType(entry)) return { level: EVIDENCE.MODELLED, date: null };
  const onSite = current(entry.onSiteCheck, now);
  if (onSite) return { level: EVIDENCE.ON_SITE_CHECKED, date: onSite };
  const facts = entry.facts ?? {};
  const facade = facts.room_facade?.state === EVIDENCE.HOTEL_CONFIRMED ? current(facts.room_facade, now) : null;
  const floors = facts.floor_range?.state === EVIDENCE.HOTEL_CONFIRMED ? current(facts.floor_range, now) : null;
  // The older of the two confirmations is the one the guest should see.
  if (facade && floors) return { level: EVIDENCE.HOTEL_CONFIRMED, date: facade < floors ? facade : floors };
  return { level: EVIDENCE.MODELLED, date: null };
}

const formatDate = date => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' }).format(date);

function trust(evidence, mode, confirmer) {
  if (evidence.level === EVIDENCE.ON_SITE_CHECKED) return {
    trustLine: `On-site checked · ${formatDate(evidence.date)}`, evidenceLabel: 'On-site checked', chip: 'On-site checked' };
  if (evidence.level === EVIDENCE.HOTEL_CONFIRMED) return {
    trustLine: `Hotel-confirmed · ${formatDate(evidence.date)}`, evidenceLabel: 'Confirmed by the hotel', chip: 'Confirmed by the hotel' };
  return { trustLine: mode === STAY_SUN_MODES.ROOM_TYPES ? MODELLED_ROOM_TRUST_LINE : FACADE_TRUST_LINE,
    evidenceLabel: `Modelled · not yet confirmed by the ${confirmer}`, chip: null };
}

/** "North side" from the entry's bearing, or from a "North-facing …" name when the bearing is missing. */
function sideFor(entry) {
  const bearing = parseFacing(entry?.orientation);
  if (bearing !== null) return `${directionName(bearing)} side`;
  const named = /\b(north-?east|north-?west|south-?east|south-?west|north|south|east|west)(?:-facing)?\b/i.exec(text(entry?.name));
  if (!named) return null;
  const word = named[1].toLowerCase().replace(/^(north|south)-?(east|west)$/, '$1-$2');
  return `${word[0].toUpperCase()}${word.slice(1)} side`;
}

function facadeKey(entry) {
  if (entry?.facadeId != null) return `id:${entry.facadeId}`;
  const bearing = parseFacing(entry?.orientation);
  return bearing === null ? null : `dir:${directionName(bearing)}`;
}

function sunLabel(entry) {
  return OUTDOOR_SPACES.has(entry?.outdoorSpace ?? entry?.outdoor_space) ? 'Balcony sun' : 'Window sun';
}

function headlineFor(mode, entries) {
  if (mode === STAY_SUN_MODES.FACADE_SIDES) return FACADE_SIDES_HEADLINE;
  const labels = new Set(entries.map(sunLabel));
  return labels.size === 1 ? [...labels][0] : 'Balcony and window sun';
}

/**
 * The stay's display contract: mode, headline, trust line, one display entry per
 * roomTypes entry (same order, so callers can pair them by index) and whether a
 * room picker may be shown.
 */
export function stayRoomTypesDisplay(venue, { now = new Date() } = {}) {
  const roomTypes = Array.isArray(venue?.roomTypes) ? venue.roomTypes : [];
  const mode = stayRoomTypeMode(roomTypes);
  const facadeMode = mode === STAY_SUN_MODES.FACADE_SIDES;
  const confirmer = String(venue?.typeCategory ?? '').toLowerCase() === 'residential' ? 'owner' : 'hotel';
  const entries = roomTypes.map((entry, index) => {
    const evidence = roomTypeEvidence(entry, { now });
    const level = hasLevel(entry?.floorLevel) ? `Level ${String(entry.floorLevel).trim()}` : null;
    let title = facadeMode ? sideFor(entry) ?? `Building side ${index + 1}` : text(entry.name);
    // A facade side must never read as a bookable room, whatever its source name says.
    if (facadeMode && /\broom/i.test(title)) title = `Building side ${index + 1}`;
    return {
      id: entry?.id ?? `stay-side-${index + 1}`,
      index,
      kind: facadeMode ? 'facade_side' : ROOM_TYPE_KIND,
      title,
      displayName: facadeMode && level ? `${title} · ${level}` : title,
      level,
      sunLabel: facadeMode ? 'Sun on this side' : sunLabel(entry),
      evidence: evidence.level,
      evidenceDate: evidence.date,
      ...trust(evidence, mode, confirmer),
    };
  });
  const facades = new Set(roomTypes.map(facadeKey).filter(Boolean));
  return {
    mode,
    headline: headlineFor(mode, roomTypes),
    trustLine: facadeMode ? FACADE_TRUST_LINE : entries.every(e => e.evidence === EVIDENCE.MODELLED) ? MODELLED_ROOM_TRUST_LINE : null,
    entries,
    showRoomPicker: !facadeMode && roomTypes.length >= 2 && facades.size >= 2,
    bestLabel: facadeMode ? 'Sunniest side' : 'Best room',
    noun: facadeMode ? 'side' : 'room',
  };
}

/** The display entry for one roomTypes entry (matched by identity, then id). */
export function stayRoomDisplay(venue, room, options) {
  const display = stayRoomTypesDisplay(venue, options);
  const roomTypes = Array.isArray(venue?.roomTypes) ? venue.roomTypes : [];
  let index = roomTypes.indexOf(room);
  if (index < 0 && room?.id != null) index = roomTypes.findIndex(entry => entry?.id === room.id);
  if (index >= 0) return display.entries[index];
  // A room outside the venue's list (e.g. a ranking copy): describe it on its own.
  return stayRoomTypesDisplay({ ...venue, roomTypes: [room] }, options).entries[0];
}

/**
 * buildHotelSunReport with display names: the sun numbers are the report's own,
 * only `name` (and the summary's `roomName`) change to the display contract.
 */
export function buildStaySunReport(venue, reportOptions = {}) {
  const display = stayRoomTypesDisplay(venue, { now: reportOptions.now });
  const roomTypes = Array.isArray(venue?.roomTypes) ? venue.roomTypes : [];
  const named = roomTypes.map((room, index) => room && typeof room === 'object' && !Array.isArray(room)
    ? { ...room, id: display.entries[index].id, name: display.entries[index].displayName }
    // A non-object entry stays unavailable in the report, but gets a side name.
    : { id: display.entries[index].id, name: display.entries[index].displayName });
  const report = buildHotelSunReport({ ...venue, roomTypes: named }, reportOptions);
  const byId = new Map(display.entries.map(entry => [entry.id, entry]));
  return { ...report, display, rooms: report.rooms.map(room => ({ ...room, display: byId.get(room.id) ?? null })) };
}
