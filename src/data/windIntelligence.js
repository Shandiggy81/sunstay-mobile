/**
 * Wind & Apparent Temperature Intelligence Engine
 * ─────────────────────────────────────────────────
 * Provides venue-specific wind exposure analysis, apparent temperature
 * calculations (feels-like), comfort zone classification, hourly forecasts,
 * and booking intelligence.
 */

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
    const vibe = (venue.vibe || '').toLowerCase();
    const tags = (venue.tags || []).map(t => t.toLowerCase());
    const name = (venue.venueName || '').toLowerCase();

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
    const note = VENUE_WIND_NOTES[venue.id] || null;

    return {
        type,
        ...profile,
        venueNote: note,
    };
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
 * We then adjust for venue shelter factor.
 */
export function calculateApparentTemp(tempC, windSpeedMs, humidity, shelterFactor = 0) {
    if (tempC == null || windSpeedMs == null) return null;

    const rh = humidity ?? 50; // default 50% if unknown

    // Vapour pressure (hPa)
    const e = (rh / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));

    // Effective wind speed at venue (reduced by shelter)
    const effectiveWind = windSpeedMs * (1 - shelterFactor);

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

/**
 * Classify apparent temperature into a comfort zone.
 * Returns { level, label, advice, color, bgColor, icon }.
 */
export function getComfortZone(apparentTemp) {
    if (apparentTemp == null) {
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

    if (apparentTemp < 10) {
        return {
            level: 'cold',
            label: 'Feels Cold',
            advice: 'Bring warm jackets for outdoor seating',
            color: 'text-blue-700',
            bgColor: 'bg-blue-50',
            borderColor: 'border-blue-200',
            icon: '🥶',
        };
    }
    if (apparentTemp < 16) {
        return {
            level: 'cool',
            label: 'Feels Cool',
            advice: 'A light jacket recommended for outdoor areas',
            color: 'text-blue-500',
            bgColor: 'bg-blue-50/60',
            borderColor: 'border-blue-200/60',
            icon: '🧥',
        };
    }
    if (apparentTemp < 22) {
        return {
            level: 'mild',
            label: 'Comfortable — Mild',
            advice: 'Lovely outdoor conditions',
            color: 'text-green-600',
            bgColor: 'bg-green-50',
            borderColor: 'border-green-200',
            icon: '😊',
        };
    }
    if (apparentTemp < 28) {
        return {
            level: 'warm',
            label: 'Comfortable — Warm',
            advice: 'Perfect outdoor conditions',
            color: 'text-emerald-600',
            bgColor: 'bg-emerald-50',
            borderColor: 'border-emerald-200',
            icon: '☀️',
        };
    }
    if (apparentTemp < 34) {
        return {
            level: 'hot',
            label: 'Feels Hot',
            advice: 'Seek shade or breeze — stay hydrated',
            color: 'text-orange-600',
            bgColor: 'bg-orange-50',
            borderColor: 'border-orange-200',
            icon: '🥵',
        };
    }
    return {
        level: 'extreme',
        label: 'Extreme Heat',
        advice: 'Indoor seating strongly recommended',
        color: 'text-red-700',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: '🔥',
    };
}

// ── Wind Warning System ───────────────────────────────────────────

/**
 * Classify wind conditions at a venue into a danger level.
 * Uses actual wind speed * venue exposure factor.
 *
 * Wind categories (effective wind at venue in m/s):
 *   Green:  < 5 m/s  — Calm
 *   Yellow: 5-9 m/s  — Moderate
 *   Orange: 9-14 m/s — Windy
 *   Red:    14+ m/s  — High Wind
 *
 * @returns {{ level, label, advice, color, bgColor, borderColor, icon, effectiveWind }}
 */
export function getWindWarning(windSpeedMs, venue) {
    const profile = getWindProfile(venue);
    const effectiveWind = (windSpeedMs || 0) * profile.exposure;
    const windKmh = Math.round(effectiveWind * 3.6);

    if (effectiveWind < 5) {
        return {
            level: 'green',
            label: 'Calm Conditions',
            advice: 'Perfect for outdoor events',
            color: 'text-emerald-600',
            bgColor: 'bg-emerald-50',
            borderColor: 'border-emerald-200',
            icon: '🍃',
            effectiveWind: windKmh,
            exposureLabel: profile.label,
        };
    }
    if (effectiveWind < 9) {
        return {
            level: 'yellow',
            label: 'Moderate Breeze',
            advice: 'Secure lightweight decorations',
            color: 'text-amber-600',
            bgColor: 'bg-amber-50',
            borderColor: 'border-amber-200',
            icon: '🌿',
            effectiveWind: windKmh,
            exposureLabel: profile.label,
        };
    }
    if (effectiveWind < 14) {
        return {
            level: 'orange',
            label: 'Windy',
            advice: 'Recommend secure tent anchoring and marquee weights',
            color: 'text-orange-600',
            bgColor: 'bg-orange-50',
            borderColor: 'border-orange-200',
            icon: '💨',
            effectiveWind: windKmh,
            exposureLabel: profile.label,
        };
    }
    return {
        level: 'red',
        label: 'High Wind Warning',
        advice: 'Outdoor events not recommended — indoor backup advised',
        color: 'text-red-700',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: '🌬️',
        effectiveWind: windKmh,
        exposureLabel: profile.label,
    };
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
export function generateHourlyForecast(currentTemp, currentWind, humidity, venue) {
    const profile = getWindProfile(venue);
    const now = new Date();
    const currentHour = now.getHours();

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
    const baseWind = currentWind / currentMultiplier;

    // Normalize temp offsets relative to current hour
    const currentTempOffset = tempOffsets[currentHour] || 0;
    const baseTemp = currentTemp - currentTempOffset;

    const hours = [];
    for (let i = 0; i < 24; i++) {
        const h = (currentHour + i) % 24;
        const hourWind = baseWind * (windMultipliers[h] || 1);
        const hourTemp = baseTemp + (tempOffsets[h] || 0);
        const feelsLike = calculateApparentTemp(hourTemp, hourWind, humidity, profile.shelterFactor);
        const comfort = getComfortZone(feelsLike);
        const windWarning = getWindWarning(hourWind, venue);

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
        return { direction: 'steady', label: 'Wind conditions steady', icon: '↔️' };
    }

    const now = hourlyForecast[0].windMs;
    const inTwoHours = hourlyForecast[2].windMs;
    const inFourHours = hourlyForecast[4]?.windMs || inTwoHours;

    const delta = inFourHours - now;
    const ratio = now > 0 ? delta / now : delta;

    if (ratio > 0.3 || delta > 3) {
        return { direction: 'building', label: 'Wind building through afternoon', icon: '📈' };
    }
    if (ratio < -0.3 || delta < -3) {
        return { direction: 'calming', label: 'Winds calming down', icon: '📉' };
    }
    return { direction: 'steady', label: 'Wind conditions steady', icon: '↔️' };
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
        reason: `Feels like ${avgFeelsLike}°C with ${startHour.windWarning.label.toLowerCase()} conditions`,
    };
}

/**
 * Generate a wind impact explanation string.
 * Example: "15km/h westerly makes 24°C feel like 21°C"
 */
export function getWindImpactExplanation(tempC, windSpeedMs, apparentTemp, venue) {
    if (tempC == null || windSpeedMs == null || apparentTemp == null) return null;

    const profile = getWindProfile(venue);
    const effectiveKmh = Math.round(windSpeedMs * profile.exposure * 3.6);
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

    switch (windWarning.level) {
        case 'red':
            return `⚠️ Wind alert for ${venueName} ${day} — indoor backup strongly recommended`;
        case 'orange':
            return `💨 Windy conditions expected at ${venueName} ${day} — secure outdoor setup`;
        case 'yellow':
            return `🌿 Moderate breeze at ${venueName} ${day} — lightweight items may need securing`;
        default:
            return `🍃 Calm conditions at ${venueName} ${day} — perfect for outdoor events`;
    }
}
