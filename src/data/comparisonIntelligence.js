/**
 * Comparison Intelligence Engine
 * ─────────────────────────────────────────────────
 * Evaluates multiple venues to recommend the best choice
 * based on current and forecast weather conditions.
 */

import { getWindWarning } from './windIntelligence';

/**
 * Generates a comparison report for 2-3 venues.
 */
export const compareVenues = (venues, weather) => {
    if (!venues || venues.length < 2) return null;

    const reports = venues.map(venue => {
        const wind = getWindWarning(weather?.wind?.speed, venue);
        const uvi = weather?.uvi ?? 0;
        const condition = weather?.weather?.[0]?.main?.toLowerCase() || '';

        // Mocking forecast trends for demo
        const isSunnyNow = condition.includes('sun') || condition.includes('clear');
        const willBeCloudy = venue.id === 'dv-01'; // Mock: Wonderland Bar gets cloudy at 4pm
        const staysSunny = !willBeCloudy && isSunnyNow;

        let score = 0;
        if (wind.level === 'green') score += 40;
        else if (wind.level === 'yellow') score += 20;

        if (isSunnyNow) score += 30;
        if (staysSunny) score += 30;
        if (venue.tags?.includes('Shaded') && uvi > 6) score += 20;

        return {
            venueId: venue.id,
            score,
            windLabel: wind.level === 'green' ? 'Calm' : 'Breezy',
            windIcon: wind.level === 'green' ? '🍃' : '💨',
            sunTrend: staysSunny ? "Stays sunny all afternoon" : "Cloudy at 4pm",
            sunTrendIcon: staysSunny ? "☀️" : "☁️",
        };
    });

    // Determine the "Best Choice"
    const sorted = [...reports].sort((a, b) => b.score - a.score);
    const best = sorted[0];

    return {
        reports,
        bestVenueId: best.venueId,
        recommendation: `Best choice: ${venues.find(v => v.id === best.venueId).venueName} (${best.windLabel.toLowerCase()} + ${best.sunTrend.toLowerCase()})`
    };
};
