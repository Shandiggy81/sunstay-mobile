const MINUTE_MS = 60_000;

const SOURCE_DETAILS = Object.freeze({
    forecast: { label: 'Forecast', sublabel: 'Forecast data' },
    calculated: { label: 'Calculated', sublabel: 'Calculated from available inputs' },
    estimated: { label: 'Estimated', sublabel: 'Estimated from available inputs' },
    demo: { label: 'Demo', sublabel: 'Sample data for demonstration' },
});

// A calendar date or local wall-clock string does not identify an instant.
const ZONED_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/i;

function instantMilliseconds(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value === 'number') {
        const timestamp = new Date(value).getTime();
        return Number.isFinite(timestamp) ? timestamp : null;
    }
    if (typeof value !== 'string') return null;

    const match = ZONED_ISO.exec(value);
    if (!match) return null;

    const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
        || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText ?? 0) > 59) {
        return null;
    }
    if (zone.toUpperCase() !== 'Z') {
        const [offsetHour, offsetMinute] = zone.slice(1).split(':').map(Number);
        if (offsetHour > 23 || offsetMinute > 59) return null;
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function ageLimitMilliseconds(maxAgeMinutes) {
    if (typeof maxAgeMinutes !== 'number' || !Number.isFinite(maxAgeMinutes) || maxAgeMinutes < 0) {
        return null;
    }
    const milliseconds = maxAgeMinutes * MINUTE_MS;
    return Number.isFinite(milliseconds) ? milliseconds : null;
}

function ageSublabel(ageMs) {
    const minutes = Math.floor(ageMs / MINUTE_MS);
    return minutes === 0 ? 'Updated just now' : `Updated ${minutes} min ago`;
}

function unavailable(sublabel = 'Update time unavailable') {
    return { label: 'Unavailable', sublabel, tone: 'unavailable', isLive: false };
}

/**
 * Describe provenance and freshness without reading the clock or changing inputs.
 * `now` is required: Date objects, epoch milliseconds and timezone-qualified ISO
 * strings identify instants; date-only and unzoned strings are deliberately rejected.
 * A live reading remains fresh through the exact maxAgeMinutes boundary.
 */
export function getBadgeState({ kind, updatedAt, now, maxAgeMinutes = 15 } = {}) {
    const source = Object.hasOwn(SOURCE_DETAILS, kind) ? SOURCE_DETAILS[kind] : null;
    if (kind !== 'live' && !source) return unavailable('Data source unavailable');

    const timestamp = instantMilliseconds(updatedAt);
    const nowMs = instantMilliseconds(now);
    const ageMs = timestamp !== null && nowMs !== null ? nowMs - timestamp : null;

    if (source) {
        return {
            label: source.label,
            sublabel: ageMs !== null && ageMs >= 0 ? ageSublabel(ageMs) : source.sublabel,
            tone: kind,
            isLive: false,
        };
    }

    if (ageMs === null) return unavailable();
    if (ageMs < 0) return unavailable('Update time is in the future');

    const maxAgeMs = ageLimitMilliseconds(maxAgeMinutes);
    const isLive = maxAgeMs !== null && ageMs <= maxAgeMs;
    return {
        label: isLive ? 'Live' : 'Cached',
        sublabel: ageSublabel(ageMs),
        tone: isLive ? 'live' : 'cached',
        isLive,
    };
}

/**
 * Milliseconds until the next displayed age or freshness change, or null when
 * time cannot affect the badge. Future timestamps become eligible at that instant.
 * Callers can schedule a timeout and provide a fresh explicit `now` afterward.
 */
export function getBadgeRefreshDelay({ kind, updatedAt, now, maxAgeMinutes = 15 } = {}) {
    if (kind !== 'live' && !Object.hasOwn(SOURCE_DETAILS, kind)) return null;
    const timestamp = instantMilliseconds(updatedAt);
    const nowMs = instantMilliseconds(now);
    if (timestamp === null || nowMs === null) return null;

    const ageMs = nowMs - timestamp;
    if (ageMs < 0) return -ageMs;

    const nextAgeChange = MINUTE_MS - (ageMs % MINUTE_MS);
    const maxAgeMs = ageLimitMilliseconds(maxAgeMinutes);
    if (kind !== 'live' || maxAgeMs === null || ageMs > maxAgeMs) return nextAgeChange;

    // The upper freshness boundary is inclusive, so the first stale millisecond
    // is one after it, including a zero-minute freshness allowance.
    const nextFreshnessChange = Math.floor(maxAgeMs - ageMs) + 1;
    return Math.min(nextAgeChange, nextFreshnessChange);
}
