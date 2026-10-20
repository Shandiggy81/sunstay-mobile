/**
 * What Sunny says in the mascot tooltip.
 *
 * Reads the same normalised weather as the header (via headerWeatherSummary),
 * so the temperature Sunny quotes is always the one the header shows. When live
 * weather is unavailable Sunny says so instead of inventing a reading.
 */
import { headerWeatherSummary, rainChancePercent } from './headerWeatherSummary.js';
import { presentWind } from './presentWind.js';

function finite(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * @param {object|null} weather OpenWeather-shaped weather from WeatherContext.
 * @param {{ proTip?: string|null }} [options]
 * @returns {{ text: string, basis: 'tip'|'loading'|'unavailable'|'live' }}
 */
export function sunnyAdvice(weather, { proTip = null } = {}) {
    const tip = typeof proTip === 'string' ? proTip.trim() : '';
    if (tip) return { text: `Pro tip: ${tip}`, basis: 'tip' };

    if (!weather) return { text: 'Checking the weather for you…', basis: 'loading' };

    if (weather.source === 'demo' || weather.unavailable) {
        return {
            text: "Live weather's unavailable right now. Venue sun times still work.",
            basis: 'unavailable',
        };
    }

    const windView = presentWind(weather);
    const summary = headerWeatherSummary(weather, { windView });
    const temp = finite(weather.main?.temp);
    if (temp == null) {
        return { text: "I can't read the temperature right now. Check the header for conditions.", basis: 'unavailable' };
    }

    // Same string as the header ("24°"), so the two can never disagree.
    const shown = summary.temperature;
    const condition = String(weather.weather?.[0]?.main || '').toLowerCase();
    const cloud = finite(weather.clouds?.all);
    const wind = windView.speedKmh;
    const rain = rainChancePercent(weather);
    const rounded = Math.round(temp);

    let text;
    if (condition.includes('thunder')) {
        text = `${shown} with storms about. Best to stay undercover.`;
    } else if (condition.includes('rain') || condition.includes('drizzle') || rain >= 60) {
        text = `${shown} and wet. A cosy spot with heaters suits today.`;
    } else if (wind != null && wind >= 30) {
        text = `${shown} but windy. Look for wind-sheltered spots.`;
    } else if (rounded >= 32) {
        text = `${shown} and hot. Find some shade and stay hydrated.`;
    } else if (rounded < 12) {
        text = `A chilly ${shown}. Sunny, sheltered spots will feel warmest.`;
    } else if (condition.includes('clear') || (cloud != null && cloud < 25)) {
        text = `${shown} and sunny. Great for an outdoor table.`;
    } else if (condition.includes('cloud') || (cloud != null && cloud >= 60)) {
        text = `${shown} and cloudy. Check sun windows for the breaks.`;
    } else {
        text = `It's ${shown} right now.`;
    }
    return { text, basis: 'live' };
}
