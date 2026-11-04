import { SUN_MOMENTS } from './sunMoments.js';
import { venueHour } from './venueTime.js';
import { FACADE_TRUST_LINE } from './stayRoomTypes.js';

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

/**
 * "Best side today": every moment with its window and the side with the most
 * direct sun then, from the report's summary. `side` is null when no side
 * gets direct sun at that time today.
 */
export function bestSideRows(report) {
    const summary = Array.isArray(report?.summary) ? report.summary : [];
    return summary.map(({ key, title, icon, roomName }) => ({
        key, title, icon,
        window: momentWindowText(key, { sunset: report.sunset, timeZone: report.timeZone }),
        side: roomName ?? null,
    }));
}

/**
 * One row per side, in the report's order (sunniest today first). `share` is
 * today's sun as a fraction of the sunniest side's, for the comparison bar;
 * null for a side whose sun couldn't be calculated.
 */
export function sideRows(rooms) {
    const list = Array.isArray(rooms) ? rooms : [];
    const minutesOf = room => (!room?.error && Number.isFinite(room?.totalMinutes) ? room.totalMinutes : null);
    const max = Math.max(0, ...list.map(room => minutesOf(room) ?? 0));
    return list.map(room => {
        const minutes = minutesOf(room);
        return {
            id: room?.id ?? null,
            name: room?.name ?? '',
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
 * a row per moment, each cell 'sun', 'shade' or 'unknown' (not calculated).
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
            const available = season?.moments?.find(item => item.key === key)?.available;
            return available === true ? 'sun' : available === false ? 'shade' : 'unknown';
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
