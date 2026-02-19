/**
 * Rain Intelligence Engine
 * ─────────────────────────────────────────────────
 * Provides precipitation timing, duration estimates,
 * and dry window recommendations.
 */

/**
 * Calculates when rain will arrive based on forecast data.
 * @param {Object} weather - Current weather/forecast object
 * @returns {Object} { minutes: Number, label: String, active: Boolean }
 */
export const getRainTiming = (weather) => {
    // If it's already raining
    const condition = weather?.weather?.[0]?.main?.toLowerCase() || '';
    if (condition.includes('rain') || condition.includes('drizzle')) {
        return { minutes: 0, label: 'Raining now', active: true };
    }

    // Look for precipitation forecast
    // In a real app, this would check hourly forecast slots
    // For demo, we use a 'rain_arrival' field in minutes from now
    const arrival = weather?.rain_arrival;

    if (arrival === undefined || arrival === null) {
        return { minutes: -1, label: 'No rain expected', active: false };
    }

    if (arrival <= 0) return { minutes: 0, label: 'Raining now', active: true };

    return {
        minutes: arrival,
        label: `Rain in ${arrival}m`,
        active: false
    };
};

/**
 * Determines if a venue is "rain-safe" based on its tags.
 */
export const isRainSafe = (venue) => {
    const safeTags = ['Indoor', 'Covered', 'Shaded', 'Veranda', 'Roof']; // 'Shaded' often implies some cover in our demo
    return venue?.tags?.some(tag => safeTags.includes(tag));
};

/**
 * Provides a "Smart Suggestion" for rain scenarios.
 */
export const getRainSuggestion = (venue, weather) => {
    const timing = getRainTiming(weather);
    const safe = isRainSafe(venue);

    if (timing.active) {
        if (safe) return "Venue has covered area - rain won't affect your booking! ✅";
        return "Rain active - mostly outdoor seating. Grab a raincoat! ☔";
    }

    if (timing.minutes > 0 && timing.minutes <= 60) {
        if (safe) return "Storm approaching, but you're covered here! 🛡️";
        return `Rain arriving in ${timing.minutes}m - outdoor area will be affected. 🌦️`;
    }

    return null;
};

/**
 * Finds the next 3-hour dry window.
 * For demo purposes, we'll mock this from the weather metadata.
 */
export const getRainWindowFinder = (weather) => {
    const nextDry = weather?.next_dry_window; // e.g., "7pm - 10pm"
    if (!nextDry) return "Clear skies ahead";
    return `Next dry window: ${nextDry}`;
};

/**
 * Checks if rain is clearing soon.
 */
export const getRainClearingTime = (weather) => {
    return weather?.rain_clearing_time || null; // e.g. "3:00 PM"
};
