import { finiteOrNull } from './finiteOrNull.js';
import { parseVenueDateTime, venueTimeParts } from './venueTime.js';
import { formatHour } from './sunForecastState.js';
import { venueOfferings, normaliseTag } from './venueOfferings.js';
import { windWord } from './venueConditionChips.js';

const MELBOURNE = 'Australia/Melbourne';
const reading = value => typeof value === 'number' || typeof value === 'string' && value.trim()
    ? finiteOrNull(value) : null;
const WARMTH = [
    { key: 'fireplace', icon: 'fireplace', text: 'Fireplace inside' },
    { key: 'heaters', icon: 'heater', text: 'Has outdoor heaters' },
    { key: 'indoor warmth', icon: 'indoor-warmth', text: 'Warm indoor space' },
];

function warmthForVenue(venue) {
    const heating = normaliseTag(venue?.heating);
    // A negative heating description must not become venueOfferings' positive
    // fireplace substring match. Tags remain the venue's own explicit facts.
    const positiveHeating = /\b(?:no|not|without)\b/.test(heating) ? '' : heating;
    const tags = Array.isArray(venue?.tags) ? [...venue.tags] : [];
    if (['outdoor heaters', 'outdoor heating'].includes(positiveHeating)) tags.push('Heaters');
    if (['indoor warmth', 'heated indoor', 'indoor heating'].includes(positiveHeating)) tags.push('Indoor Warmth');
    const offerings = venueOfferings({ ...venue, heating: positiveHeating, tags });
    const keys = new Set(offerings.map(item => item.key));
    return WARMTH.filter(item => keys.has(item.key)).map(({ icon, text }) => ({ icon, text }));
}

/**
 * Tonight's remaining 5pm–11pm Melbourne forecast, independent of map preview.
 * `now` is the real clock supplied by the card, never the scrubber's time.
 * Before 5pm, all seven hourly samples (17:00 through 23:00) are required;
 * during the evening the current hour and later samples are required. The
 * 23:00 forecast is the window's endpoint; the section hides at 23:00 itself.
 *
 * Read raw companion series rather than normalizeHourlyForecast's display
 * fallbacks: missing apparent temperature, rain or wind cannot justify advice.
 * No requests, clock reads, input mutation or inferred heating/live status.
 * @returns {{ verdict: string, icon: string, detail: string,
 *   warmth: Array<{ icon: string, text: string }> }|null}
 */
export function tonightFeel({ venue, weather, now } = {}) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) ||
        !weather || weather.source === 'demo' || weather.unavailable || weather.error ||
        !Array.isArray(weather.hourly?.time)) return null;

    const local = venueTimeParts(now, MELBOURNE);
    if (local.hour >= 23) return null;
    const firstHour = Math.max(17, local.hour);
    const hourly = weather.hourly;
    if (!Array.isArray(hourly.apparent_temperature) || !Array.isArray(hourly.precipitation_probability) ||
        !Array.isArray(hourly.wind_speed_10m) && !Array.isArray(hourly.windspeed_10m)) return null;
    const windSeries = Array.isArray(hourly.wind_speed_10m) ? hourly.wind_speed_10m : hourly.windspeed_10m;
    const byHour = new Map();
    for (let index = 0; index < hourly.time.length; index++) {
        const instant = parseVenueDateTime(hourly.time[index], MELBOURNE);
        if (!instant) continue;
        const parts = venueTimeParts(instant, MELBOURNE);
        if (parts.date !== local.date || parts.hour < firstHour || parts.hour > 23 ||
            parts.minute !== 0 || parts.second !== 0) continue;
        const feels = reading(hourly.apparent_temperature[index]);
        const rain = reading(hourly.precipitation_probability[index]);
        const wind = reading(windSeries[index]);
        if (feels === null || rain === null || rain < 0 || rain > 100 || wind === null || wind < 0) continue;
        byHour.set(parts.hour, { hour: parts.hour, feels, rain, wind });
    }
    const evening = [];
    for (let hour = firstHour; hour <= 23; hour++) {
        if (!byHour.has(hour)) return null;
        evening.push(byHour.get(hour));
    }
    const coldest = evening.reduce((cold, row) => row.feels < cold.feels ? row : cold);
    const rain = Math.max(...evening.map(row => row.rain));
    const wind = Math.max(...evening.map(row => row.wind));

    let verdict, icon;
    if (rain >= 50 || wind >= 30 || coldest.feels < 12) {
        verdict = 'Best inside tonight';
        icon = rain >= 50 ? 'rain' : wind >= 30 ? 'windsock' : 'indoor-warmth';
    } else if (coldest.feels >= 18 && rain < 40) {
        verdict = 'Warm enough to sit outside';
        icon = 'night';
    } else {
        // Rain at 40–49% does not meet the warm/dry rule or the inside rule;
        // retain the cautious outdoor verdict and show the rain chance below.
        verdict = 'Jacket weather outside';
        icon = 'jacket';
    }
    const when = local.hour >= 17 && coldest.hour === local.hour ? 'now' : `by ${formatHour(coldest.hour)}`;
    // Thresholds use the raw forecast; the text rounds like the rest of the card ("14°").
    const detail = `Feels ${Math.round(coldest.feels)}° ${when} · ${windWord(wind).toLowerCase()}`
        + (rain >= 30 ? ` · ${Math.round(rain)}% chance of rain` : '');
    return { verdict, icon, detail, warmth: warmthForVenue(venue) };
}
