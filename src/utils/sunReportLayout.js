import { SUN_MOMENTS } from './sunMoments.js';
import { venueHour, venueTimeParts } from './venueTime.js';
import { FACADE_TRUST_LINE, STAY_SUN_MODES } from './stayRoomTypes.js';
import { BEST_FOR_MIN_SHARE } from './bestForMoment.js';

/**
 * Layout data for the decluttered sun report: the best side for each moment
 * first, one row per side of the building, and each side's year and seasons
 * folded under its row. Pure functions over buildStaySunReport's output.
 */

const MONTH_NAMES = Object.freeze({
    Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June',
    Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
});
const SHORT_MONTHS = Object.keys(MONTH_NAMES);
/** Sunset drinks are the last 90 minutes before sunset (balconySunEngine). */
const SUNSET_DRINKS_HOURS = 1.5;

function clock(hours) {
    // Round to the minute first, so 7.9999 never prints as 7:60.
    const total = Math.round(hours * 60);
    const h24 = Math.floor(total / 60) % 24;
    const minutes = total % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { text: minutes ? `${h12}:${String(minutes).padStart(2, '0')}` : String(h12), meridiem: h24 < 12 ? 'am' : 'pm' };
}

/** Local decimal hours → "6 to 10am", "12 to 2:30pm", "11am to 1pm". */
export function hourRangeText(from, to) {
    const a = clock(from);
    const b = clock(to);
    return a.meridiem === b.meridiem
        ? `${a.text} to ${b.text}${b.meridiem}`
        : `${a.text}${a.meridiem} to ${b.text}${b.meridiem}`;
}

/**
 * A moment's local time window, e.g. "6 to 10am". Sunset drinks run the last
 * 90 minutes before today's sunset ("6:28 to 7:58pm"), or "Before sunset"
 * when the report has no sunset. Null for an unknown moment.
 */
export function momentWindowText(key, { sunset = null, timeZone } = {}) {
    const moment = SUN_MOMENTS.find(item => item.key === key);
    if (!moment) return null;
    if (!moment.sunset) return hourRangeText(moment.from, moment.to);
    if (!(sunset instanceof Date) || Number.isNaN(sunset.getTime())) return 'Before sunset';
    const end = venueHour(sunset, timeZone);
    return hourRangeText(end - SUNSET_DRINKS_HOURS, end);
}

/** A moment's length in minutes: its fixed hours, or the 90 minutes before sunset. Null for an unknown moment. */
function momentMinutes(key) {
    const moment = SUN_MOMENTS.find(item => item.key === key);
    if (!moment) return null;
    return Math.round((moment.sunset ? SUNSET_DRINKS_HOURS : moment.to - moment.from) * 60);
}

/**
 * How well a side's direct sun covers a moment, by the same rule as the café
 * card's "Best for" (utils/bestForMoment): 'sun' when it covers at least half
 * of the moment, 'some' for less, 'shade' for none, 'unknown' when it wasn't
 * calculated. A side with 19 minutes of sun between 6 and 10am is 'some',
 * not a morning-coffee side.
 */
export function momentFit(key, minutes) {
    const length = momentMinutes(key);
    if (!length || typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return 'unknown';
    if (minutes === 0) return 'shade';
    return minutes / length >= BEST_FOR_MIN_SHARE ? 'sun' : 'some';
}

/** Local decimal hour to the second, so hourRangeText rounds to the nearest minute like the venue card. */
function localHour(instant, timeZone) {
    const p = venueTimeParts(instant, timeZone);
    return p.hour + p.minute / 60 + p.second / 3600;
}

/**
 * When the sun is on a side: "Sun 7:41 to 10am", or "Sun 7:10 to 7:40am and
 * 9:20 to 10am" when buildings break it up. Null without a valid window.
 */
export function sunWindowsText(windows, timeZone) {
    const ranges = (Array.isArray(windows) ? windows : [])
        .filter(window => window?.start instanceof Date && window?.end instanceof Date && window.end > window.start)
        .map(window => hourRangeText(localHour(window.start, timeZone), localHour(window.end, timeZone)));
    if (!ranges.length) return null;
    return `Sun ${ranges.length === 1 ? ranges[0] : `${ranges.slice(0, -1).join(', ')} and ${ranges.at(-1)}`}`;
}

/**
 * The level every side shares ("Level 2"), or null when sides differ or one
 * has none. The report then says it once instead of on every side's name.
 */
export function sharedSideLevel(rooms) {
    const list = Array.isArray(rooms) ? rooms : [];
    const levels = list.map(room => room?.display?.level ?? null);
    return levels.length && levels[0] && levels.every(level => level === levels[0]) ? levels[0] : null;
}

/** Full side name → its name without the shared level ("North-west side · Level 2" → "North-west side"). */
function shortNames(rooms) {
    if (!sharedSideLevel(rooms)) return new Map();
    return new Map(rooms.filter(room => room?.name && room.display?.title).map(room => [room.name, room.display.title]));
}

/**
 * "Best side today": every moment with its window and the side with the most
 * direct sun then, from the report's summary. `side` is null when no side
 * gets direct sun at that time today, and drops a level every side shares.
 * `fit` is momentFit for that side, and `sun` says when its sun comes, ending
 * in "only" when it covers less than half of the moment ("Sun 9:41 to 10am
 * only"), so a few minutes of sun is never shown as a sunny pick.
 */
export function bestSideRows(report) {
    const summary = Array.isArray(report?.summary) ? report.summary : [];
    const short = shortNames(report?.rooms);
    return summary.map(({ key, title, icon, roomName, minutes, windows }) => {
        const fit = roomName == null ? 'shade' : momentFit(key, minutes);
        const sun = roomName == null ? null : sunWindowsText(windows, report.timeZone);
        return {
            key, title, icon,
            window: momentWindowText(key, { sunset: report.sunset, timeZone: report.timeZone }),
            side: roomName == null ? null : short.get(roomName) ?? roomName,
            fit,
            sun: sun && fit === 'some' ? `${sun} only` : sun,
        };
    });
}

/**
 * One row per side, in the report's order (sunniest today first). `share` is
 * today's sun as a fraction of the sunniest side's, for the comparison bar;
 * null for a side whose sun couldn't be calculated.
 */
export function sideRows(rooms) {
    const list = Array.isArray(rooms) ? rooms : [];
    const short = shortNames(list);
    const minutesOf = room => (!room?.error && Number.isFinite(room?.totalMinutes) ? room.totalMinutes : null);
    const max = Math.max(0, ...list.map(room => minutesOf(room) ?? 0));
    return list.map(room => {
        const minutes = minutesOf(room);
        return {
            id: room?.id ?? null,
            name: short.get(room?.name) ?? room?.name ?? '',
            durationText: room?.durationText ?? 'Unavailable',
            totalMinutes: minutes,
            share: minutes == null ? null : max > 0 ? minutes / max : 0,
            error: room?.error ?? null,
        };
    });
}

/** The side open when the report opens: the first (sunniest) side that was calculated, else the first side. */
export function defaultOpenSideId(rooms) {
    const list = Array.isArray(rooms) ? rooms : [];
    const first = list.find(room => !room?.error && Number.isFinite(room?.totalMinutes)) ?? list[0];
    return first?.id ?? null;
}

/** "Sunniest in May, June and July"; null when no month gets direct sun. */
export function sunniestMonthsText(months) {
    const names = (Array.isArray(months) ? months : []).map(month => MONTH_NAMES[month] ?? month).filter(Boolean);
    if (!names.length) return null;
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    return `Sunniest in ${list}`;
}

/** "2026-01-15" → "15 Jan"; null for anything else. */
function dayMonth(date) {
    const [, month, day] = String(date ?? '').split('-').map(Number);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${day} ${SHORT_MONTHS[month - 1]}` : null;
}

/**
 * Summer and winter as one table: a column per season ("Summer · 15 Jan") and
 * a row per moment, each cell momentFit's 'sun' (at least half the moment),
 * 'some', 'shade' or 'unknown' (not calculated).
 */
export function seasonTable(seasons) {
    const list = Array.isArray(seasons) ? seasons : [];
    const columns = list.map(({ key, label, date }) => {
        const day = dayMonth(date);
        return { key, label: day ? `${label} · ${day}` : label };
    });
    const rows = SUN_MOMENTS.map(({ key, title, icon }) => ({
        key, title, icon,
        cells: list.map(season => {
            const moment = season?.moments?.find(item => item.key === key);
            return moment?.available === true ? momentFit(key, moment.minutes)
                : moment?.available === false ? 'shade' : 'unknown';
        }),
    }));
    return { columns, rows };
}

/**
 * The evidence line every side shares ("Modelled · not yet confirmed by the
 * hotel"), shown once under the hotel's name. Null when the sides differ or
 * one has none, so each side keeps its own line.
 */
export function sharedEvidence(rooms) {
    const labels = (Array.isArray(rooms) ? rooms : []).map(room => room?.display?.chip ?? room?.display?.evidenceLabel ?? null);
    if (!labels.length || labels.some(label => !label)) return null;
    return labels.every(label => label === labels[0]) ? labels[0] : null;
}

/**
 * Section wording for the report's mode: a room-type report lists room types
 * ("City View King"), so it never says "side of the building".
 */
export function reportWords(mode) {
    return mode === STAY_SUN_MODES.ROOM_TYPES
        ? { best: 'Best room today', list: 'Each room type', unit: 'room type' }
        : { best: 'Best side today', list: 'Each side of the building', unit: 'side' };
}

/**
 * The subtitle under the sides list: "Direct sun today, measured at level 2.
 * Tap a side for its year and seasons." The level appears only when every
 * side shares it (their names then leave it out).
 */
export function sidesSubtitle(report) {
    const { unit } = reportWords(report?.display?.mode);
    const level = sharedSideLevel(report?.rooms);
    const today = level ? `Direct sun today, measured at ${level.replace(/^Level\b/, 'level')}.` : 'Direct sun today.';
    return `${today} Tap a ${unit} for its year and seasons.`;
}

const MODELLED_PREFIX = 'Modelled · ';

/**
 * The header's one trust line. Every side of a facade report still modelled:
 * "Modelled from building footprint and neighbours · not yet confirmed by the
 * hotel". Every side sharing other evidence: that evidence ("Confirmed by the
 * hotel"). Sides that differ: the report's trust line alone (null in a mixed
 * room-type report), and each side shows its own evidence.
 */
export function reportTrustText(report) {
    const trustLine = report?.display?.trustLine ?? null;
    const shared = sharedEvidence(report?.rooms);
    if (!shared) return trustLine;
    if (shared.startsWith(MODELLED_PREFIX) && trustLine === FACADE_TRUST_LINE) {
        return `${trustLine} · ${shared.slice(MODELLED_PREFIX.length)}`;
    }
    return shared;
}
