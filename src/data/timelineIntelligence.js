/**
 * Timeline Intelligence Engine
 * ─────────────────────────────────────────────────
 * Evaluates hourly weather data to identify "Comfort Zones"
 * and recommends the best booking windows.
 */

import { getWindWarning } from './windIntelligence';

/**
 * Calculates a comfort score (0-100) for a specific hour at a venue.
 */
export const calculateHourComfort = (hourData, venue) => {
    const temp = hourData.temp || 20;
    const windSpeed = hourData.wind_speed || 0;
    const uvi = hourData.uvi || 0;
    const weatherMain = hourData.weather?.[0]?.main?.toLowerCase() || '';

    let score = 70; // Baseline

    // Temperature scoring (21-26 is optimal)
    if (temp >= 21 && temp <= 26) score += 20;
    else if (temp < 18 || temp > 30) score -= 20;

    // Wind scoring
    const wind = getWindWarning(windSpeed, venue);
    if (wind.level === 'green') score += 10;
    else if (wind.level === 'red') score -= 30;

    // UV scoring
    if (uvi > 8 && !venue?.tags?.includes('Shaded')) score -= 15;

    // Rain/Clouds
    if (weatherMain.includes('rain')) score -= 50;
    if (weatherMain.includes('cloud')) score -= 5;

    return Math.max(0, Math.min(100, score));
};

/**
 * Identifies the best 3-hour window in the timeline.
 */
export const findBestWindow = (hourlyData, venue) => {
    if (!hourlyData || hourlyData.length < 3) return null;

    let bestScore = -1;
    let bestStartIndex = 0;

    for (let i = 0; i <= hourlyData.length - 3; i++) {
        const windowScore = (
            calculateHourComfort(hourlyData[i], venue) +
            calculateHourComfort(hourlyData[i + 1], venue) +
            calculateHourComfort(hourlyData[i + 2], venue)
        ) / 3;

        if (windowScore > bestScore) {
            bestScore = windowScore;
            bestStartIndex = i;
        }
    }

    const start = new Date(hourlyData[bestStartIndex].dt * 1000).getHours();
    const end = new Date(hourlyData[bestStartIndex + 2].dt * 1000).getHours() + 1;

    return {
        start: `${start}:00`,
        end: `${end === 24 ? 0 : end}:00`,
        label: `${start % 12 || 12}${start >= 12 ? 'pm' : 'am'} - ${end % 12 || 12}${end >= 12 ? 'pm' : 'am'}`,
        score: Math.round(bestScore)
    };
};
