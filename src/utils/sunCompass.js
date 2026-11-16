/**
 * The stay card's sun compass: for each side of the building, whether the
 * modelled direct sun reaches it now, later today or not at all, plus where the
 * sun is in the sky. Same engine and inputs as the side cards, so the two agree.
 */
import SunCalc from 'suncalc';
import {
    calculateBalconySunDay, DEFAULT_TIME_ZONE, angularDifference, formatGuestTime, parseFacing, venueLocalDate,
} from './balconySunEngine.js';
import { formatSunDuration } from './formatSunDuration.js';

const RAD = Math.PI / 180;
const normalise = degrees => ((degrees % 360) + 360) % 360;
const round = value => Math.round(value * 100) / 100 + 0; // + 0 turns -0 into 0

/** A point on the dial: bearing clockwise from north, y pointing down as in SVG. */
export function compassPointAt(bearing, radius) {
    return { x: round(radius * Math.sin(bearing * RAD)), y: round(-radius * Math.cos(bearing * RAD)) };
}

/** An arc centred on `bearing`, `spread` degrees either side. */
export function compassArcPath(bearing, spread, radius) {
    const from = compassPointAt(bearing - spread, radius), to = compassPointAt(bearing + spread, radius);
    return `M ${from.x} ${from.y} A ${radius} ${radius} 0 0 1 ${to.x} ${to.y}`;
}

const STATE_ORDER = { now: 0, later: 1, some: 1, done: 2, none: 3 };

/**
 * @param {{ rooms: object[], venue: object, date?: string|null, now?: Date, titleFor?: (room: object) => string|null }} input
 *   `date` is a venue-local YYYY-MM-DD; when it is not today the compass has no "now".
 * @returns {null | { live: boolean, night: boolean, date: string, sun: {bearing:number, altitude:number}|null,
 *   spread: number, buildingRotation: number, sides: object[], ranked: object[] }}
 *   null when fewer than two sides can be modelled.
 */
export function sunCompassView({ rooms, venue, date = null, now = new Date(), titleFor = null } = {}) {
    const lat = Number(venue?.lat), lng = Number(venue?.lng);
    if (!Array.isArray(rooms) || venue?.lat == null || venue?.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const timeZone = venue?.timeZone ?? venue?.timezone ?? DEFAULT_TIME_ZONE;
    let today;
    try { today = venueLocalDate(now, timeZone); } catch { return null; }
    const day = date ?? today, live = day === today, at = new Date(now).getTime();

    const sides = [];
    rooms.forEach((room, index) => {
        const bearing = parseFacing(room?.orientation);
        if (bearing === null) return;
        let daily;
        try {
            daily = calculateBalconySunDay({ lat, lng, facing: room.orientation, obstructions: room.obstructions ?? [],
                overhang: room.overhang ?? null, date: day, timeZone });
        } catch { return; }
        const current = live ? daily.windows.find(window => at >= window.start.getTime() && at < window.end.getTime()) : null;
        const next = live ? daily.windows.find(window => window.start.getTime() > at) : null;
        const state = daily.totalMinutes <= 0 ? 'none' : !live ? 'some' : current ? 'now' : next ? 'later' : 'done';
        const status = state === 'none' ? 'No direct sun'
            : state === 'now' ? `In sun until ${formatGuestTime(current.end, timeZone)}`
                : state === 'later' ? `Sun from ${formatGuestTime(next.start, timeZone)}`
                    : state === 'done' ? 'Sun has left this side' : 'Gets direct sun';
        const direction = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'][Math.round(bearing / 45) % 8];
        sides.push({
            id: room?.id ?? `side-${index}`, title: titleFor?.(room) || `${direction} side`, bearing, state, status,
            totalMinutes: daily.totalMinutes, total: formatSunDuration(daily.totalMinutes),
        });
    });
    if (sides.length < 2) return null;

    let sun = null;
    if (live) {
        const position = SunCalc.getPosition(new Date(at), lat, lng);
        const altitude = position.altitude / RAD;
        if (altitude > 0) sun = { bearing: normalise(position.azimuth / RAD + 180), altitude };
    }
    // Arcs never overlap: half the tightest gap between two sides, less a breath.
    let tightest = 360;
    for (const a of sides) for (const b of sides) if (a !== b) tightest = Math.min(tightest, angularDifference(a.bearing, b.bearing));
    return {
        live, night: live && !sun, date: day, sun,
        spread: Math.max(6, Math.min(36, tightest / 2 - 6)),
        buildingRotation: round(sides[0].bearing % 90),
        sides,
        ranked: [...sides].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.totalMinutes - a.totalMinutes),
    };
}
