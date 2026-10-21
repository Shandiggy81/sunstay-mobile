import { finiteOrNull } from './finiteOrNull.js';
import { DEFAULT_TIME_ZONE, formatGuestTime } from './balconySunEngine.js';
import { parseVenueDateTime, venueTimeParts } from './venueTime.js';
import { isStayVenue } from './propertyTypes.js';
import { partnerOutdoorSpace } from './partnerVenueControls.js';

const HOUR = 3_600_000;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

function clockMinutes(value, closing = false) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const hour = Number(match[1]), minute = Number(match[2]);
    if (minute > 59 || hour > 23 && !(closing && hour === 24 && minute === 0)) return null;
    return hour * 60 + minute;
}

function openingPeriod(record) {
    if (!record || typeof record !== 'object' || record.closed === true ||
        record.closed != null && typeof record.closed !== 'boolean') return null;
    const open = clockMinutes(record.open), close = clockMinutes(record.close, true);
    // Equal endpoints are ambiguous, not evidence of 24-hour opening.
    return open !== null && close !== null && open !== close ? { open, close } : null;
}

function isOpen(instant, hours, timeZone) {
    const local = venueTimeParts(instant, timeZone);
    const day = new Date(`${local.date}T12:00:00Z`).getUTCDay();
    const minute = local.hour * 60 + local.minute;
    const today = openingPeriod(hours[DAYS[day]]);
    if (today && (today.open < today.close
        ? minute >= today.open && minute < today.close
        : minute >= today.open)) return true;
    const yesterday = openingPeriod(hours[DAYS[(day + 6) % 7]]);
    return !!yesterday && yesterday.open > yesterday.close && minute < yesterday.close;
}

function outdoorContext(venue) {
    const stay = isStayVenue(venue), space = partnerOutdoorSpace(venue);
    return { stay, outdoor: !!space, place: stay && space?.label === 'balcony' ? 'balconies' : `the ${space?.label ?? 'outdoor area'}`,
        beerGarden: !stay && space?.label === 'beer garden', icon: space?.icon };
}

function isDaylight(forecast, index, instant, timeZone) {
    if (forecast.hourly.is_day?.[index] !== 1) return false;
    const date = venueTimeParts(instant, timeZone).date;
    const day = forecast.daily?.time?.indexOf(date) ?? -1;
    if (day < 0) return true; // Explicit hourly daylight still supplies a valid basis.
    const sunrise = parseVenueDateTime(forecast.daily?.sunrise?.[day], timeZone);
    const sunset = parseVenueDateTime(forecast.daily?.sunset?.[day], timeZone);
    return sunrise && sunset ? instant >= sunrise && instant < sunset : true;
}

/**
 * Up to two operational forecast tips in the next 12 hours, using venue-local
 * opening hours and provider daylight flags. `forecast` accepts the raw or
 * normalised Open-Meteo hourly arrays. `hours` must be an explicit weekly map
 * ({ mon: { open: '12:00', close: '22:00', closed: false }, ... }); prose,
 * absent days and ambiguous equal endpoints do not establish opening hours.
 * Pass `now` explicitly (Date or epoch ms); this helper reads no clocks/storage
 * and does not fetch, mutate inputs or infer astronomical sun exposure.
 * @returns {Array<{key: string, icon: string, time: string, timeLabel: string, text: string}>}
 */
export function partnerWeatherTips({ venue, forecast, hours = venue?.hours, now, timeZone = venue?.timeZone ?? venue?.timezone ?? DEFAULT_TIME_ZONE } = {}) {
    const from = now == null ? NaN : new Date(now).getTime();
    if (!Number.isFinite(from) || !venue || !forecast || forecast.source === 'demo' || forecast.unavailable ||
        !Array.isArray(forecast.hourly?.time) || !hours || typeof hours !== 'object' || Array.isArray(hours)) return [];
    const context = outdoorContext(venue), candidates = [];
    try {
        for (let index = 0; index < forecast.hourly.time.length; index++) {
            const sample = parseVenueDateTime(forecast.hourly.time[index], timeZone);
            if (!sample || sample.getTime() + HOUR <= from || sample.getTime() >= from + 12 * HOUR) continue;
            const instant = new Date(Math.max(sample.getTime(), from));
            if (!isOpen(instant, hours, timeZone)) continue;
            const temp = finiteOrNull(forecast.hourly.temperature_2m?.[index]);
            const rain = finiteOrNull(forecast.hourly.precipitation_probability?.[index]);
            const gust = finiteOrNull(forecast.hourly.wind_gusts_10m?.[index] ?? forecast.hourly.windgusts_10m?.[index]);
            const uv = finiteOrNull(forecast.hourly.uv_index?.[index]);
            const code = finiteOrNull(forecast.hourly.weather_code?.[index] ?? forecast.hourly.weathercode?.[index]);
            const daylight = isDaylight(forecast, index, instant, timeZone);
            let tip;
            if (gust !== null && gust >= 35) {
                tip = { key: 'wind', icon: 'wind-sheltered', text: context.stay
                    ? 'Gusty conditions forecast during guest arrivals. Check any exposed outdoor areas.'
                    : 'Gusty conditions forecast during service. Check exposed outdoor furniture and shade.' };
            } else if (rain !== null && rain >= 50 && rain <= 100 || RAIN_CODES.has(code)) {
                tip = { key: 'rain', icon: 'umbrella', text: context.stay
                    ? 'Rain is forecast during guest arrivals. Share wet-weather access information.'
                    : 'Rain is forecast during service. Plan for wet arrivals and check any outdoor seating.' };
            } else if (daylight && context.outdoor && uv !== null && uv >= 8) {
                tip = { key: 'uv', icon: 'umbrella', text: `High UV is forecast. Check shade for ${context.stay ? 'guests using ' : ''}${context.place}.` };
            } else if (daylight && context.outdoor && temp !== null && temp >= 18 && temp <= 28 &&
                rain !== null && rain >= 0 && rain < 20 && gust !== null && gust >= 0 && gust < 25 && code !== null && code >= 0 && code <= 3) {
                tip = { key: 'comfortable', icon: context.icon ?? 'sun',
                    text: `A mild, dry window is forecast for ${context.stay ? 'guests using ' : ''}${context.place}.` };
            }
            if (tip) candidates.push({ ...tip, time: instant.toISOString(), timeLabel: formatGuestTime(instant, timeZone, timeZone) });
        }
    } catch { return []; } // Invalid timezone or malformed date data cannot justify advice.
    return candidates.sort((a, b) => a.time.localeCompare(b.time))
        .filter((tip, index, tips) => tips.findIndex(other => other.key === tip.key) === index).slice(0, 2);
}
