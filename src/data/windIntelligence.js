/**
 * Wind & Apparent Temperature Intelligence Engine
 * ─────────────────────────────────────────────────
 * Provides venue-specific wind exposure analysis, apparent temperature
 * calculations (feels-like), comfort zone classification, hourly forecasts,
 * and booking intelligence.
 */

import { finiteOrNull } from '../utils/finiteOrNull.js';
import { calculateWindExposure, windFromDegrees } from '../utils/windExposure.js';
import { normalizeHourlyForecast } from '../utils/normalizeHourlyForecast.js';
import { getCurrentHourlyIndex, openMeteoLocalTimeToDate } from '../utils/weatherService.js';
import { venueHour } from '../utils/venueTime.js';

// ── Wind Exposure Profiles ────────────────────────────────────────
// Each venue gets a wind exposure profile based on its type, location,
// and surrounding environment. This is a static dataset enriched from
// venue metadata — in production this would come from a venue setup form.

const WIND_EXPOSURE_PROFILES = {
    // Exposure factor: 0 = fully sheltered, 1 = fully exposed
    rooftop: { exposure: 0.95, shelterFactor: 0.05, label: 'Rooftop — Fully Exposed' },
    floating: { exposure: 0.90, shelterFactor: 0.10, label: 'Waterfront — Very Exposed' },
    waterfront: { exposure: 0.80, shelterFactor: 0.20, label: 'Waterfront — High Exposure' },
    open_park: { exposure: 0.75, shelterFactor: 0.25, label: 'Open Park/Stadium — High Exposure' },
    beer_garden: { exposure: 0.55, shelterFactor: 0.45, label: 'Beer Garden — Moderate Exposure' },
    courtyard: { exposure: 0.35, shelterFactor: 0.65, label: 'Courtyard — Partially Sheltered' },
    streetside: { exposure: 0.50, shelterFactor: 0.50, label: 'Streetside — Moderate Exposure' },
    indoor: { exposure: 0.05, shelterFactor: 0.95, label: 'Indoor — Well Sheltered' },
    cafe: { exposure: 0.30, shelterFactor: 0.70, label: 'Cafe — Mostly Sheltered' },
    hotel: { exposure: 0.25, shelterFactor: 0.75, label: 'Hotel — Sheltered' },
};

// ── Venue-Specific Wind Advice ────────────────────────────────────
// Keyed by venue ID — provides locale-specific wind character notes.
const VENUE_WIND_NOTES = {
    'dv-02': 'This rooftop gets afternoon bay breezes from the south',
    'dv-03': 'Streetside seating exposed to St Kilda sea breeze',
    'dv-04': 'Port Melbourne brewery catches westerly harbour winds',
    'dv-06': 'Multi-level CBD location — upper floors windier',
    'dv-07': 'Open food truck park — exposed to northerly gusts',
    'dv-09': 'Rooftop courtyard funnels afternoon wind between buildings',
    'dv-11': 'CBD rooftop exposed to cross-building wind tunnels',
    'dv-13': 'Sheltered laneway terrace — protected from westerly winds',
    'dv-15': 'South Wharf waterfront gets consistent river breeze',
    'dv-17': 'Little Bourke St laneway creates natural wind shelter',
    'dv-18': 'Open stadium precinct — exposed on all sides',
    'dv-19': 'Docklands waterfront — high wind exposure from bay',
    'dv-21': 'Esplanade-facing — strong afternoon sea breeze from bay',
    'dv-22': 'Floating bar on Yarra — constant river surface breeze',
    'dv-23': 'Fitzroy garden courtyard — protected by surrounding walls',
};

/**
 * Detect the wind exposure profile type for a venue based on its
 * vibe, tags, and name.
 */
export function detectWindExposure(venue) {
    const vibe = String(venue?.vibe || '').toLowerCase();
    const tags = Array.isArray(venue?.tags) ? venue.tags.map(t => String(t).toLowerCase()) : [];
    const name = String(venue?.venueName || venue?.name || '').toLowerCase();

    // Priority order: most exposed first
    if (tags.includes('rooftop') || vibe.includes('rooftop')) return 'rooftop';
    if (vibe.includes('floating')) return 'floating';
    if (tags.includes('river') || vibe.includes('waterfront') || vibe.includes('wharf')) return 'waterfront';
    if (vibe.includes('stadium') || vibe.includes('pop-up') || vibe.includes('marquee')) return 'open_park';
    if (vibe.includes('food truck') || vibe.includes('park')) return 'open_park';
    if (tags.includes('beer garden') || vibe.includes('beer garden') || vibe.includes('garden')) return 'beer_garden';
    if (vibe.includes('courtyard') || vibe.includes('maze') || vibe.includes('hidden')) return 'courtyard';
    if (vibe.includes('streetside') || vibe.includes('street')) return 'streetside';
    if (vibe.includes('cafe') || vibe.includes('bookshop') || vibe.includes('co-work')) return 'cafe';
    if (vibe.includes('hotel') || vibe.includes('boutique hotel')) return 'hotel';
    if (vibe.includes('lounge') || vibe.includes('cocktail') || tags.includes('cozy')) return 'courtyard';
    if (vibe.includes('pub') || vibe.includes('tavern')) return 'beer_garden';
    if (vibe.includes('warehouse')) return 'beer_garden';

    return 'beer_garden'; // sensible default
}

/**
 * Get the full wind exposure profile for a venue.
 */
export function getWindProfile(venue) {
    const type = detectWindExposure(venue);
    const profile = WIND_EXPOSURE_PROFILES[type] || WIND_EXPOSURE_PROFILES.beer_garden;
    const note = venue?.id ? VENUE_WIND_NOTES[venue.id] || null : null;

    return {
        type,
        ...profile,
        venueNote: note,
    };
}

// ── The venue's wind factor ───────────────────────────────────────
// One answer to "how much of the open-air wind reaches this spot?", with
// where the answer came from, so the card can say how sure it is.

const windSector = direction => Math.round(direction / 45) % 8;

/**
 * Open-air wind multiplier from a microclimate row. enrich-microclimate stores
 * `wind_shelter_score = 1 − multiplier × 0.9` for the wind direction it scored,
 * so a fully exposed spot reads as at least 1.11; null when the score is unusable.
 */
export function measuredWindFactor(entry) {
    const shelter = finiteOrNull(entry?.wind_shelter_score);
    if (shelter === null || shelter < 0 || shelter > 1) return null;
    return Math.round(((1 - shelter) / 0.9) * 100) / 100;
}

const MEASURED_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * A microclimate row is only used for the wind factor while its weather is
 * recent: it was scored for the wind direction at `weather_computed_at`.
 */
export function freshMicroclimate(entry, now = new Date()) {
    const scoredAt = Date.parse(entry?.weather_computed_at ?? '');
    const at = now instanceof Date ? now.getTime() : Number(now);
    if (!Number.isFinite(scoredAt) || !Number.isFinite(at)) return null;
    return at - scoredAt >= 0 && at - scoredAt <= MEASURED_MAX_AGE_MS ? entry : null;
}

/**
 * The `options` every wind helper takes, from a venue's microclimate row and
 * the current wind direction. The list row, the card header and the Wind &
 * comfort panel all build them here, so they show the same wind.
 */
export function measuredWindOptions(entry, direction, now = new Date()) {
    return { microclimate: freshMicroclimate(entry, now), measuredDirection: direction ?? null };
}

/**
 * The wind factor for one wind direction, best source first:
 *   'profile'  the venue's own directional wind profile
 *   'measured' surrounding buildings (microclimate row), only for wind from
 *              the 45° sector that row was scored in (`measuredDirection`)
 *   'type'     an estimate from the kind of venue
 * `measuredDirection` is the wind direction (FROM degrees) when the row was scored.
 */
export function resolveVenueWindFactor(venue, { direction = null, microclimate = null, measuredDirection = null } = {}) {
    const typeProfile = getWindProfile(venue);
    const profiled = calculateWindExposure({ windMs: 0, direction, windProfile: venue?.windProfile, fallbackFactor: typeProfile.exposure });
    if (profiled.directional) {
        return { factor: profiled.factor, source: 'profile', note: profiled.note, tunnel: profiled.tunnel, type: typeProfile.type };
    }
    const measured = measuredWindFactor(microclimate);
    const from = windFromDegrees(direction), scored = windFromDegrees(measuredDirection);
    if (measured !== null && from !== null && scored !== null && windSector(from) === windSector(scored)) {
        return { factor: measured, source: 'measured', note: null, tunnel: false, type: typeProfile.type };
    }
    return { factor: typeProfile.exposure, source: 'type', note: null, tunnel: false, type: typeProfile.type };
}

/** `options` may carry `{ microclimate, measuredDirection }`; without them this is the venue-type estimate. */
export function getVenueWindExposure(windMs, venue, direction = null, gustMs = null, options = {}) {
    const resolved = resolveVenueWindFactor(venue, { direction, microclimate: options?.microclimate, measuredDirection: options?.measuredDirection });
    const exposure = calculateWindExposure({ windMs, direction, gustMs, windProfile: venue?.windProfile, fallbackFactor: resolved.factor });
    return { ...exposure, source: resolved.source };
}

// ── Apparent Temperature Calculation ──────────────────────────────

/**
 * Calculate apparent temperature (feels-like) using the Australian
 * Bureau of Meteorology formula:
 *
 *   AT = Ta + 0.33 * e - 0.70 * ws - 4.00
 *
 * Where:
 *   Ta = actual temperature (°C)
 *   e  = water vapour pressure (hPa) = humidity/100 * 6.105 * exp(17.27 * Ta / (237.7 + Ta))
 *   ws = wind speed at 10m (m/s)
 *
 * We then adjust for venue shelter or a directional wind profile. Optional
 * direction (FROM degrees), gustMs and venue arguments follow the legacy four.
 * Gusts affect warnings, not the sustained-wind apparent-temperature formula.
 */
export function calculateApparentTemp(tempC, windSpeedMs, humidity, shelterFactor = 0, direction = null, gustMs = null, venue = null, options = null) {
    // Non-finite inputs (a missing field, or a non-numeric string) must not
    // propagate through the arithmetic below as NaN.
    const temp = finiteOrNull(tempC);
    const wind = finiteOrNull(windSpeedMs);
    if (temp === null || wind === null) return null;
    tempC = temp;
    windSpeedMs = wind;

    const rh = finiteOrNull(humidity) ?? 50; // default 50% if unknown

    // Vapour pressure (hPa)
    const e = (rh / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));

    // Effective wind speed at venue (reduced by shelter). A measured wind
    // factor, when the caller supplies one for this direction, replaces the
    // venue-type shelter estimate.
    const measured = options?.microclimate
        ? resolveVenueWindFactor(venue, { direction, microclimate: options.microclimate, measuredDirection: options.measuredDirection })
        : null;
    const effectiveWind = calculateWindExposure({ windMs: windSpeedMs, direction, gustMs,
        windProfile: venue?.windProfile, fallbackFactor: measured?.source === 'measured' ? measured.factor : 1 - shelterFactor }).effectiveWindMs;

    // Apparent temperature
    const at = tempC + 0.33 * e - 0.70 * effectiveWind - 4.00;

    return Math.round(at * 10) / 10;
}

/**
 * Calculate the wind chill impact (how much cooler it feels due to wind).
 */
export function getWindChillImpact(tempC, windSpeedMs, shelterFactor = 0) {
    const feelsLike = calculateApparentTemp(tempC, windSpeedMs, 50, shelterFactor);
    if (feelsLike == null) return null;
    return Math.round((tempC - feelsLike) * 10) / 10;
}

// ── Comfort Zone Classification ───────────────────────────────────

/** Feels-like temperatures (°C) where one comfort zone ends and the next begins. */
export const COMFORT_ZONE_LIMITS = Object.freeze([10, 16, 22, 28, 34]);

/**
 * Classify apparent temperature into a comfort zone.
 * Returns { level, label, advice, color, bgColor, icon }.
 */
export function getComfortZone(apparentTemp) {
    // NaN fails every comparison below and would otherwise fall through to the
    // "Extreme Heat" branch, reporting dangerous heat on missing data.
    const at = finiteOrNull(apparentTemp);
    if (at === null) {
        return {
            level: 'unknown',
            label: 'Unknown',
            advice: 'Weather data unavailable',
            color: 'text-gray-500',
            bgColor: 'bg-gray-50',
            borderColor: 'border-gray-200',
            icon: '❓',
        };
    }
    apparentTemp = at;

    if (apparentTemp < 10) {
        return {
            level: 'cold',
            label: 'Feels cold',
            advice: 'Bring a warm jacket for outdoor tables',
            color: 'text-blue-700',
            bgColor: 'bg-blue-50',
            borderColor: 'border-blue-200',
            icon: '🥶',
        };
    }
    if (apparentTemp < 16) {
        return {
            level: 'cool',
            label: 'Feels cool',
            advice: 'A light jacket helps outside',
            color: 'text-blue-500',
            bgColor: 'bg-blue-50/60',
            borderColor: 'border-blue-200/60',
            icon: '🧥',
        };
    }
    if (apparentTemp < 22) {
        return {
            level: 'mild',
            label: 'Comfortable and mild',
            advice: 'Lovely for sitting outside',
            color: 'text-green-600',
            bgColor: 'bg-green-50',
            borderColor: 'border-green-200',
            icon: '😊',
        };
    }
    if (apparentTemp < 28) {
        return {
            level: 'warm',
            label: 'Comfortable and warm',
            advice: 'Ideal for sitting outside',
            color: 'text-emerald-600',
            bgColor: 'bg-emerald-50',
            borderColor: 'border-emerald-200',
            icon: '☀️',
        };
    }
    if (apparentTemp < 34) {
        return {
            level: 'hot',
            label: 'Feels hot',
            advice: 'Look for shade and a breeze, and keep a drink handy',
            color: 'text-orange-600',
            bgColor: 'bg-orange-50',
            borderColor: 'border-orange-200',
            icon: '🥵',
        };
    }
    return {
        level: 'extreme',
        label: 'Extreme heat',
        advice: 'Indoor tables are the safer choice',
        color: 'text-red-700',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: '🔥',
    };
}

// ── Wind Warning System ───────────────────────────────────────────

/**
 * Wind at the venue (regional wind × the venue's wind factor), in four levels
 * worded for someone choosing a table: Calm under 5 m/s, Breezy to 9, Windy to
 * 14, then Very windy.
 *
 * @returns {{ level, label, phrase, advice, color, bgColor, borderColor, icon, effectiveWind }}
 */
const WIND_LEVELS = [
    // Effective wind at the venue, m/s. `phrase` completes "Feels like 18° with …".
    { below: 5, level: 'green', label: 'Calm', phrase: 'calm air', advice: 'Easy outdoor weather. Napkins stay put.',
        color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', icon: '🍃' },
    { below: 9, level: 'yellow', label: 'Breezy', phrase: 'a steady breeze', advice: 'A steady breeze. A sheltered table will feel warmer.',
        color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', icon: '🌿' },
    { below: 14, level: 'orange', label: 'Windy', phrase: 'gusty wind', advice: 'Hold on to hats and menus. Sheltered or indoor tables are the better pick.',
        color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', icon: '💨' },
    { below: Infinity, level: 'red', label: 'Very windy', phrase: 'strong wind', advice: 'Too gusty to sit outside comfortably. Indoors is the call.',
        color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200', icon: '🌬️' },
];

export function getWindWarning(windSpeedMs, venue, direction = null, gustMs = null, options = {}) {
    const profile = getWindProfile(venue);
    const exposure = getVenueWindExposure(windSpeedMs, venue, direction, gustMs, options);
    // Gusts influence warnings only for an active directional profile; legacy venues keep their thresholds.
    const effectiveWind = exposure.directional ? Math.max(exposure.effectiveWindMs ?? 0, exposure.effectiveGustMs ?? 0) : exposure.effectiveWindMs ?? 0;
    const windKmh = Math.round((exposure.effectiveWindMs ?? 0) * 3.6);
    const details = venue?.windProfile ? { factor: exposure.factor, tunnel: exposure.tunnel,
        effectiveGust: exposure.effectiveGustMs === null ? null : Math.round(exposure.effectiveGustMs * 3.6) } : {};
    const { below: _below, ...view } = WIND_LEVELS.find(entry => effectiveWind < entry.below) ?? WIND_LEVELS[WIND_LEVELS.length - 1];
    return { ...view, effectiveWind: windKmh, ...details, exposureLabel: profile.label };
}

// ── Wind Trend Analysis ───────────────────────────────────────────

/**
 * Generate an hourly comfort forecast for a venue across the day.
 * Uses a realistic diurnal wind pattern for Melbourne: calm mornings,
 * building through afternoon, calming in the evening.
 *
 * @param {number} currentTemp - current temperature in °C
 * @param {number} currentWind - current wind speed in m/s
 * @param {number} humidity - current humidity %
 * @param {object} venue - venue object for exposure calculation
 * @returns {Array<{ hour, label, temp, wind, feelsLike, comfort, windWarning }>}
 */
export function generateHourlyForecast(currentTemp, currentWind, humidity, venue, direction = null, gustMs = null, options = {}) {
    const profile = getWindProfile(venue);
    const now = options.now ?? new Date();
    // Real forecast hours for every venue; the daily pattern below only fills gaps.
    const useForecast = Boolean(options.hourly);
    const measuredOptions = { microclimate: options.microclimate ?? null, measuredDirection: options.measuredDirection ?? direction };
    let timeZone = venue?.timeZone ?? venue?.timezone ?? 'Australia/Melbourne';
    let currentHour;
    try { currentHour = Math.floor(venueHour(now, timeZone)); }
    catch { timeZone = 'Australia/Melbourne'; currentHour = Math.floor(venueHour(now, timeZone)); }
    const index = getCurrentHourlyIndex(options.hourly, options.utcOffsetSeconds, now);
    const firstTime = openMeteoLocalTimeToDate(options.hourly?.time?.[index], options.utcOffsetSeconds) ?? now;
    const actualRows = useForecast ? normalizeHourlyForecast({ hourly: options.hourly, utc_offset_seconds: options.utcOffsetSeconds }, { now: firstTime, limit: 24 }) : [];
    const safeCurrentTemp = Number.isFinite(Number(currentTemp)) ? Number(currentTemp) : 20;
    const safeCurrentWind = Number.isFinite(Number(currentWind)) ? Number(currentWind) : 0;
    const safeHumidity = Number.isFinite(Number(humidity)) ? Number(humidity) : 50;

    // Melbourne diurnal wind multipliers (relative to current measurement)
    // Morning: 0.4x, midday: 0.8x, afternoon: 1.3x peak, evening: 0.6x
    const windMultipliers = {
        0: 0.3, 1: 0.25, 2: 0.2, 3: 0.2, 4: 0.25, 5: 0.3,
        6: 0.35, 7: 0.4, 8: 0.5, 9: 0.6, 10: 0.7, 11: 0.85,
        12: 0.95, 13: 1.05, 14: 1.15, 15: 1.25, 16: 1.3, 17: 1.2,
        18: 1.0, 19: 0.8, 20: 0.65, 21: 0.5, 22: 0.4, 23: 0.35,
    };

    // Temperature variation pattern (deviation from current)
    const tempOffsets = {
        0: -3, 1: -3.5, 2: -4, 3: -4.5, 4: -4, 5: -3.5,
        6: -3, 7: -2, 8: -1, 9: 0, 10: 1, 11: 2,
        12: 3, 13: 3.5, 14: 4, 15: 3.5, 16: 3, 17: 2,
        18: 1, 19: 0, 20: -1, 21: -1.5, 22: -2, 23: -2.5,
    };

    // Normalize wind multipliers relative to current hour
    const currentMultiplier = windMultipliers[currentHour] || 1;
    const baseWind = safeCurrentWind / currentMultiplier;

    // Normalize temp offsets relative to current hour
    const currentTempOffset = tempOffsets[currentHour] || 0;
    const baseTemp = safeCurrentTemp - currentTempOffset;

    const hours = [];
    for (let i = 0; i < 24; i++) {
        const time = new Date((useForecast ? firstTime : now).getTime() + i * 3600000);
        // Match timestamps rather than array indices: omitted rows must not shift future weather into "Now".
        const actual = actualRows.find(row => row.time.getTime() === time.getTime());
        const h = Math.floor(venueHour(time, timeZone));
        const hourWind = actual?.windKmh != null ? actual.windKmh / 3.6 : baseWind * (windMultipliers[h] || 1);
        const hourTemp = actual?.temp ?? baseTemp + (tempOffsets[h] || 0);
        const hourDirection = options.hourly ? actual?.windDirection ?? null : direction;
        const hourGust = options.hourly ? actual?.gusts == null ? null : actual.gusts / 3.6
            : finiteOrNull(gustMs) === null ? null : gustMs * (windMultipliers[h] || 1) / currentMultiplier;
        const feelsLike = calculateApparentTemp(hourTemp, hourWind, safeHumidity, profile.shelterFactor, hourDirection, hourGust, venue, measuredOptions);
        const comfort = getComfortZone(feelsLike);
        const windWarning = getWindWarning(hourWind, venue, hourDirection, hourGust, measuredOptions);

        // Format hour label
        const isPM = h >= 12;
        const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const label = i === 0 ? 'Now' : `${displayH}${isPM ? 'pm' : 'am'}`;

        hours.push({
            hour: h,
            label,
            temp: Math.round(hourTemp),
            wind: Math.round(hourWind * 3.6), // km/h
            windMs: Math.round(hourWind * 10) / 10,
            time, windDirection: hourDirection, gustMs: hourGust,
            windExposure: getVenueWindExposure(hourWind, venue, hourDirection, hourGust, measuredOptions),
            // 'forecast' rows come from the hourly forecast; 'estimate' rows from the typical daily pattern.
            source: actual ? 'forecast' : 'estimate',
            feelsLike: Math.round(feelsLike),
            comfort,
            windWarning,
            isCurrent: i === 0,
        });
    }

    return hours;
}

/**
 * Determine the wind trend (building, calming, steady).
 */
export function getWindTrend(hourlyForecast) {
    if (!hourlyForecast || hourlyForecast.length < 4) {
        return { direction: 'steady', label: 'Wind staying about the same', icon: '↔️' };
    }

    const now = hourlyForecast[0].windMs;
    const inTwoHours = hourlyForecast[2].windMs;
    const inFourHours = hourlyForecast[4]?.windMs || inTwoHours;

    const delta = inFourHours - now;
    const ratio = now > 0 ? delta / now : delta;

    if (ratio > 0.3 || delta > 3) {
        return { direction: 'building', label: 'Wind picking up over the next few hours', icon: '📈' };
    }
    if (ratio < -0.3 || delta < -3) {
        return { direction: 'calming', label: 'Wind easing over the next few hours', icon: '📉' };
    }
    return { direction: 'steady', label: 'Wind staying about the same', icon: '↔️' };
}

/**
 * Find the optimal booking window for outdoor comfort at a venue.
 * Returns the best contiguous block of "comfortable" hours.
 */
export function getOptimalBookingTime(hourlyForecast) {
    if (!hourlyForecast || hourlyForecast.length === 0) return null;

    // Score each hour: higher is better
    const scored = hourlyForecast.map((h) => {
        let score = 0;
        // Comfort level scoring
        if (h.comfort.level === 'warm') score += 5;
        else if (h.comfort.level === 'mild') score += 4;
        else if (h.comfort.level === 'cool') score += 2;
        else if (h.comfort.level === 'hot') score += 1;
        else score += 0;

        // Wind penalty
        if (h.windWarning.level === 'green') score += 3;
        else if (h.windWarning.level === 'yellow') score += 1;
        else if (h.windWarning.level === 'orange') score -= 1;
        else score -= 3;

        // Daytime bonus (people prefer daytime events)
        if (h.hour >= 9 && h.hour <= 21) score += 1;
        if (h.hour >= 10 && h.hour <= 16) score += 1;

        return { ...h, score };
    });

    // Find the best 3-hour window
    let bestStart = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < scored.length - 2; i++) {
        const windowScore = scored[i].score + scored[i + 1].score + scored[i + 2].score;
        if (windowScore > bestScore) {
            bestScore = windowScore;
            bestStart = i;
        }
    }

    const startHour = scored[bestStart];
    const endHour = scored[bestStart + 2];

    // Format time range
    const fmtHour = (h) => {
        if (h === 0 || h === 24) return '12am';
        if (h === 12) return '12pm';
        return h > 12 ? `${h - 12}pm` : `${h}am`;
    };

    const avgFeelsLike = Math.round(
        (startHour.feelsLike + scored[bestStart + 1].feelsLike + endHour.feelsLike) / 3
    );

    return {
        startHour: startHour.hour,
        endHour: (endHour.hour + 1) % 24,
        startLabel: fmtHour(startHour.hour),
        endLabel: fmtHour((endHour.hour + 1) % 24),
        avgFeelsLike,
        avgWindLevel: startHour.windWarning.level,
        reason: `Feels like ${avgFeelsLike}° with ${startHour.windWarning.phrase ?? 'light wind'}`,
    };
}

/**
 * Generate a wind impact explanation string.
 * Example: "15km/h westerly makes 24°C feel like 21°C"
 */
export function getWindImpactExplanation(tempC, windSpeedMs, apparentTemp, venue, direction = null, gustMs = null) {
    if (tempC == null || windSpeedMs == null || apparentTemp == null) return null;

    const effectiveKmh = Math.round((getVenueWindExposure(windSpeedMs, venue, direction, gustMs).effectiveWindMs ?? 0) * 3.6);
    const diff = Math.round(tempC - apparentTemp);

    if (Math.abs(diff) < 1) {
        return `${effectiveKmh}km/h wind has minimal effect on comfort`;
    }

    if (diff > 0) {
        return `${effectiveKmh}km/h wind makes ${Math.round(tempC)}°C feel like ${Math.round(apparentTemp)}°C`;
    }

    return `Calm conditions make ${Math.round(tempC)}°C feel like ${Math.round(apparentTemp)}°C`;
}

/**
 * Generate a push notification-style wind alert message.
 */
export function getWindAlertMessage(windWarning, venueName, dayLabel) {
    const day = dayLabel || 'today';
    const level = windWarning?.level || 'green';
    const safeVenueName = venueName || 'this venue';

    switch (level) {
        case 'red':
            return `⚠️ Wind alert for ${safeVenueName} ${day} — indoor backup strongly recommended`;
        case 'orange':
            return `💨 Windy conditions expected at ${safeVenueName} ${day} — secure outdoor setup`;
        case 'yellow':
            return `🌿 Moderate breeze at ${safeVenueName} ${day} — lightweight items may need securing`;
        default:
            return `🍃 Calm conditions at ${safeVenueName} ${day} — perfect for outdoor events`;
    }
}
