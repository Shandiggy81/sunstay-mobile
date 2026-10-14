import { finiteOrNull } from './finiteOrNull.js';

const SOURCES = new Set(['highway', 'main road', 'tram line', 'flight path', 'nightlife', 'none']);
const unknown = () => ({ label: 'Unknown', db: null, source: null, note: null, peak: false });
export function noiseLabel(db) {
    if (!Number.isFinite(db)) return 'Unknown';
    return db < 50 ? 'Quiet' : db < 60 ? 'Conversational' : db < 70 ? 'Busy' : 'Loud';
}

/** A profile-based estimate, never a measurement. Weekend offsets are added in dB. */
export function estimateNoise(venue, instant) {
    const profile = venue?.noiseProfile;
    const baseline = finiteOrNull(profile?.baselineDb);
    if (!profile || !SOURCES.has(profile.source) || baseline === null || baseline < 0) return unknown();
    const date = new Date(instant);
    if (!Number.isFinite(date.getTime())) return unknown();
    try {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
            timeZone: venue.timeZone ?? venue.timezone ?? 'Australia/Melbourne',
            hour: '2-digit', hourCycle: 'h23', weekday: 'short',
        }).formatToParts(date).map(p => [p.type, p.value]));
        const hour = Number(parts.hour);
        const peak = Array.isArray(profile.peakHours) && profile.peakHours.some(range => {
            if (!Array.isArray(range) || range.length !== 2) return false;
            const [from, to] = range.map(finiteOrNull);
            if (from === null || to === null || from < 0 || from > 24 || to < 0 || to > 24) return false;
            return from < to ? hour >= from && hour < to : from > to && (hour >= from || hour < to);
        });
        const peakDb = finiteOrNull(profile.peakDb);
        const weekend = parts.weekday === 'Sat' || parts.weekday === 'Sun';
        const weekendFactor = finiteOrNull(profile.weekendFactor);
        // Decibels are logarithmic: a legacy intensity factor becomes an additive
        // 10*log10(factor) offset (0.8 ≈ -1 dB), never a multiplier of the dB value.
        const configuredOffset = finiteOrNull(profile.weekendOffsetDb)
            ?? (weekendFactor !== null && weekendFactor > 0 ? 10 * Math.log10(weekendFactor) : 0);
        const offset = weekend ? Math.max(-15, Math.min(15, configuredOffset)) : 0;
        const db = (peak && peakDb !== null && peakDb >= 0 ? peakDb : baseline) + offset;
        if (!Number.isFinite(db)) return unknown();
        return { db: Math.round(db * 10) / 10, label: noiseLabel(db), peak,
            source: profile.source, note: typeof profile.note === 'string' ? profile.note : null };
    } catch { return unknown(); }
}
