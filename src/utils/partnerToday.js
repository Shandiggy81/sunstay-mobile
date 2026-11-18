/**
 * Partner preview "Today": the venue's next service, the weather for it, and
 * what to do before it opens. Pure: `now` and the forecast are passed in.
 *
 * Hours come from the partner's own weekly map (`venue.hours`, set with
 * "Preview service hours") or, failing that, from the listing's opening-hours
 * text when every part of it reads plainly ("Mon–Fri 8am–5pm; closed Sun").
 * Anything else ("Daily from 4pm", "Seasonal operation") is not guessed at:
 * the manager is asked for their hours instead.
 */
import { DEFAULT_TIME_ZONE } from './balconySunEngine.js';
import { getBadgeState } from './dataBadgeState.js';
import { isMicroclimateEntryExpired, isMicroclimateEntryStale, timestampMs } from './microclimateProvenance.js';
import { finiteOrNull } from './finiteOrNull.js';
import { outdoorChips } from './partnerTools.js';
import { partnerWeatherTips } from './partnerWeatherTips.js';
import { parseVenueDateTime, venueTimeAt, venueTimeParts } from './venueTime.js';
import { venueHoursView } from './venueHours.js';
import { venueOfferings } from './venueOfferings.js';

export const PARTNER_DAY_KEYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const SUN_FIRST = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_WORDS = {
    mon: 'mon', monday: 'mon', tue: 'tue', tues: 'tue', tuesday: 'tue', wed: 'wed', wednesday: 'wed',
    thu: 'thu', thur: 'thu', thurs: 'thu', thursday: 'thu', fri: 'fri', friday: 'fri',
    sat: 'sat', saturday: 'sat', sun: 'sun', sunday: 'sun',
};
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const HOUR = 3_600_000;
const DAY_MINUTES = 1440;
/** How much of a long service the weather line speaks for. */
const WEATHER_WINDOW_HOURS = 6;

const pad = value => String(value).padStart(2, '0');

function parseDays(spec) {
    const words = spec.trim();
    if (words === 'daily' || words === 'every day') return [...PARTNER_DAY_KEYS];
    if (words === 'weekdays') return PARTNER_DAY_KEYS.slice(0, 5);
    if (words === 'weekends') return ['sat', 'sun'];
    const days = [];
    for (const piece of words.split(/\s*(?:,|&|\band\b)\s*/)) {
        const range = /^([a-z]+)-([a-z]+)$/.exec(piece);
        if (range) {
            const from = DAY_WORDS[range[1]], to = DAY_WORDS[range[2]];
            if (!from || !to) return null;
            for (let index = PARTNER_DAY_KEYS.indexOf(from), step = 0; step < 7; step++, index = (index + 1) % 7) {
                days.push(PARTNER_DAY_KEYS[index]);
                if (PARTNER_DAY_KEYS[index] === to) break;
            }
            continue;
        }
        if (!DAY_WORDS[piece]) return null;
        days.push(DAY_WORDS[piece]);
    }
    return days.length ? days : null;
}

function parseClock(token, closing) {
    if (token === 'midday' || token === 'noon') return '12:00';
    if (token === 'midnight') return closing ? '24:00' : '00:00';
    if (token === 'late') return closing ? 'late' : null;
    const match = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(token);
    if (!match) return null;
    const hour = Number(match[1]), minute = Number(match[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const hour24 = match[3] === 'am' ? hour % 12 : hour % 12 + 12;
    return `${pad(hour24)}:${pad(minute)}`;
}

/**
 * A listing's opening-hours text as a weekly map, or null unless every part
 * reads plainly. "late" closes become `{ close: '24:00', late: true }`, so the
 * weather for a late night is read up to midnight. Days the text doesn't
 * mention stay unknown (absent), not closed.
 */
export function parseListedHours(text) {
    if (typeof text !== 'string' || !text.trim()) return null;
    const clean = text.toLowerCase().replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-').replace(/\.\s*$/, '').trim();
    const out = {};
    for (const raw of clean.split(';')) {
        const part = raw.trim();
        if (!part) continue;
        const closed = /^closed (.+)$/.exec(part);
        if (closed) {
            const days = parseDays(closed[1]);
            if (!days) return null;
            for (const day of days) out[day] = { open: '', close: '', closed: true };
            continue;
        }
        const match = /^(.+?) (\S+)-(\S+)$/.exec(part);
        const days = match && parseDays(match[1]);
        const open = match && parseClock(match[2], false);
        const close = match && parseClock(match[3], true);
        if (!days || !open || !close || open === close) return null;
        for (const day of days) out[day] = close === 'late' ? { open, close: '24:00', closed: false, late: true } : { open, close, closed: false };
    }
    return Object.keys(out).length ? out : null;
}

function hasWeeklyMap(hours) {
    return Boolean(hours) && typeof hours === 'object' && !Array.isArray(hours)
        && PARTNER_DAY_KEYS.some(day => hours[day] && typeof hours[day] === 'object' && (hours[day].open || hours[day].closed === true));
}

/**
 * The hours to plan the next service from: the partner's own map first, then
 * the listing text. `source` says which, and whether the listing was checked.
 * @returns {{ hours: object, source: 'set'|'listing'|'listing-unconfirmed' } | null}
 */
export function partnerServiceHours(venue) {
    if (hasWeeklyMap(venue?.hours)) return { hours: venue.hours, source: 'set' };
    const text = [venue?.opening_hours, venue?.openingHours, venue?.hours].find(value => typeof value === 'string' && value.trim());
    const hours = parseListedHours(text);
    if (!hours) return null;
    return { hours, source: venueHoursView(venue).verified ? 'listing' : 'listing-unconfirmed' };
}

function clockMinutes(value, closing = false) {
    const match = typeof value === 'string' ? /^(\d{2}):(\d{2})$/.exec(value) : null;
    if (!match) return null;
    const hour = Number(match[1]), minute = Number(match[2]);
    if (minute > 59 || hour > 23 && !(closing && hour === 24 && minute === 0)) return null;
    return hour * 60 + minute;
}

/** One day's service in minutes from that day's midnight; an overnight close runs past 1440. */
function servicePeriod(record) {
    if (!record || typeof record !== 'object' || record.closed === true) return null;
    const open = clockMinutes(record.open), close = clockMinutes(record.close, true);
    if (open === null || close === null || open === close) return null;
    return { open, close: close < open ? close + DAY_MINUTES : close, late: record.late === true };
}

/** "5pm", "8:30am", "midnight". */
export function clockLabel(minutes) {
    const inDay = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    if (inDay === 0 && minutes > 0) return 'midnight';
    const hour = Math.floor(inDay / 60), minute = inDay % 60;
    return `${hour % 12 || 12}${minute ? `:${pad(minute)}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

function addDays(date, days) {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
const dayKey = date => SUN_FIRST[new Date(`${date}T12:00:00Z`).getUTCDay()];
const instantAt = (date, minutes, timeZone) => venueTimeAt(addDays(date, Math.floor(minutes / DAY_MINUTES)), (minutes % DAY_MINUTES) / 60, timeZone);

/**
 * The service on now, or the next one within a week.
 * @returns {{ status: 'open'|'today'|'tomorrow'|'later', start: Date, end: Date, late: boolean,
 *             label: string, span: string } | null}
 */
export function nextService({ hours, now, timeZone = DEFAULT_TIME_ZONE }) {
    const at = now == null ? NaN : new Date(now).getTime();
    if (!hours || typeof hours !== 'object' || !Number.isFinite(at)) return null;
    try {
        const local = venueTimeParts(at, timeZone);
        const nowMinutes = local.hour * 60 + local.minute;
        const build = (status, date, period, startMinutes) => {
            const close = period.late ? 'late' : clockLabel(period.close);
            const span = `${clockLabel(period.open)}–${close}`;
            const opens = clockLabel(period.open);
            const weekday = WEEKDAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()].slice(0, 3);
            const label = status === 'open' ? `Open now · until ${close}`
                : status === 'today' ? `Opens ${opens} ${period.open >= 17 * 60 ? 'tonight' : 'today'}`
                : status === 'tomorrow' ? `Opens ${opens} tomorrow` : `Opens ${weekday} ${opens}`;
            return { status, start: instantAt(date, startMinutes, timeZone), end: instantAt(date, period.close, timeZone), late: period.late, label, span };
        };
        const yesterday = addDays(local.date, -1);
        const overnight = servicePeriod(hours[dayKey(yesterday)]);
        if (overnight && overnight.close > DAY_MINUTES && nowMinutes < overnight.close - DAY_MINUTES) {
            return { ...build('open', yesterday, overnight, overnight.open), start: new Date(at) };
        }
        const today = servicePeriod(hours[dayKey(local.date)]);
        if (today && nowMinutes >= today.open && nowMinutes < today.close) return { ...build('open', local.date, today, today.open), start: new Date(at) };
        if (today && nowMinutes < today.open) return build('today', local.date, today, today.open);
        for (let ahead = 1; ahead <= 7; ahead++) {
            const date = addDays(local.date, ahead);
            const period = servicePeriod(hours[dayKey(date)]);
            if (period) return build(ahead === 1 ? 'tomorrow' : 'later', date, period, period.open);
        }
    } catch { return null; } // A time that doesn't exist in the venue's zone can't anchor a plan.
    return null;
}

/** Usable for advice: a real forecast with hourly times, not demo or failed data. */
export function usableForecast(forecast) {
    return Boolean(forecast) && forecast.source !== 'demo' && !forecast.unavailable && Array.isArray(forecast.hourly?.time);
}

/**
 * One line on the weather for the service, read from up to six forecast hours
 * from its start (or now, if it's already open).
 * @returns {{ kind: 'rain'|'sun'|'clear'|'cloud'|'beyond', icon: string, text: string, detail: string|null } | null}
 *   null when there is no usable forecast; `beyond` when the forecast stops before the service.
 */
export function serviceWeather({ forecast, start, end, now, timeZone = DEFAULT_TIME_ZONE }) {
    if (!usableForecast(forecast) || !start || !end) return null;
    const from = Math.max(new Date(start).getTime(), new Date(now ?? start).getTime());
    const to = Math.min(new Date(end).getTime(), from + WEATHER_WINDOW_HOURS * HOUR);
    const hourly = forecast.hourly;
    const samples = [];
    hourly.time.forEach((time, index) => {
        const instant = parseVenueDateTime(time, timeZone);
        if (instant && instant.getTime() + HOUR > from && instant.getTime() < to) samples.push({ index, instant });
    });
    if (!samples.length) return { kind: 'beyond', icon: 'sun-cloud', text: 'Too far ahead for the forecast yet.', detail: null };
    const read = ({ index }) => ({
        rain: finiteOrNull(hourly.precipitation_probability?.[index]),
        code: finiteOrNull(hourly.weather_code?.[index] ?? hourly.weathercode?.[index]),
        temp: finiteOrNull(hourly.temperature_2m?.[index]),
        day: hourly.is_day?.[index] === 1,
    });
    const hours = samples.map(sample => ({ ...sample, ...read(sample) }));
    const wet = hours.findIndex(hour => (hour.rain !== null && hour.rain >= 50) || RAIN_CODES.has(hour.code));
    const temps = hours.map(hour => hour.temp).filter(temp => temp !== null);
    const warmest = temps.length ? Math.round(Math.max(...temps)) : null;
    if (wet >= 0) {
        const chance = Math.max(...hours.slice(wet).map(hour => hour.rain ?? 0));
        const time = venueTimeParts(hours[wet].instant, timeZone);
        const temp = hours[wet].temp === null ? null : Math.round(hours[wet].temp);
        return {
            kind: 'rain', icon: 'rain',
            text: wet === 0 ? 'Rain likely during service' : `Rain likely from ${clockLabel(time.hour * 60 + time.minute)}`,
            detail: [chance > 0 ? `${chance}% chance` : null, temp !== null ? `${temp}°` : null].filter(Boolean).join(' · ') || null,
        };
    }
    const clear = hours.every(hour => hour.code !== null && hour.code <= 1);
    const degrees = warmest === null ? '' : `, ${warmest}°`;
    if (clear && hours[0].day) return { kind: 'sun', icon: 'sun', text: `Sunny${degrees}`, detail: 'Dry through service' };
    if (clear) return { kind: 'clear', icon: 'night', text: `Clear and dry${degrees}`, detail: null };
    return { kind: 'cloud', icon: 'cloud', text: `Cloudy and dry${degrees}`, detail: null };
}

/** "Monday 19 October" in the venue's time zone, built by hand so every browser agrees. */
export function venueDateLabel(now, timeZone = DEFAULT_TIME_ZONE) {
    try {
        const { date } = venueTimeParts(now, timeZone);
        const d = new Date(`${date}T12:00:00Z`);
        return `${WEEKDAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
    } catch { return null; }
}

/**
 * The Today card: date, next service, its weather and the first service tip.
 * `weather` is null when the forecast is missing; `service` is null when the
 * hours can't be read, and the card asks for them.
 */
export function partnerTodayView({ venue, forecast, now, timeZone = venue?.timeZone ?? venue?.timezone ?? DEFAULT_TIME_ZONE }) {
    const hours = partnerServiceHours(venue);
    const service = hours ? nextService({ hours: hours.hours, now, timeZone }) : null;
    const weather = service ? serviceWeather({ forecast, start: service.start, end: service.end, now, timeZone }) : null;
    const tip = service && usableForecast(forecast) ? partnerWeatherTips({ venue, forecast, hours: hours.hours, now, timeZone })[0] ?? null : null;
    return {
        dateLabel: venueDateLabel(now, timeZone),
        service: service ? { ...service, source: hours.source } : null,
        weather,
        forecastMissing: !usableForecast(forecast),
        tip: tip ? { icon: tip.icon, text: tip.text, timeLabel: tip.timeLabel } : null,
    };
}

const LEFT_OFF = 'left off your guest card until it refreshes';

/**
 * The service forecast and the venue's own SunStay reading (its venues_in_bbox
 * row), judged apart: an expired reading never ages the forecast, and a fresh
 * forecast never makes the reading look live. The guest card shows a reading
 * only while it's fresh (freshMicroclimateEntry), the same rule as the map pin.
 * @returns {{ forecast: object|null, reading: { status: 'fresh'|'expired'|'stale', updatedAt: number|null, text: string }|null }}
 */
export function partnerDataStatus({ forecastFetchedAt = null, reading = null, now, timeZone = DEFAULT_TIME_ZONE }) {
    const fetchedAt = timestampMs(forecastFetchedAt);
    const forecast = fetchedAt == null ? null : getBadgeState({ kind: 'forecast', updatedAt: fetchedAt, now });
    if (!reading) return { forecast, reading: null };
    const updatedAt = timestampMs(reading.weather_computed_at);
    const at = ms => { const p = venueTimeParts(ms, timeZone); return clockLabel(p.hour * 60 + p.minute); };
    if (isMicroclimateEntryExpired(reading, now)) {
        return { forecast, reading: { status: 'expired', updatedAt, text: `Venue reading expired at ${at(timestampMs(reading.expires_at))} · ${LEFT_OFF}` } };
    }
    if (isMicroclimateEntryStale(reading, now)) {
        const text = updatedAt == null ? `Venue reading has no update time · ${LEFT_OFF}` : `Venue reading from ${at(updatedAt)} is over an hour old · ${LEFT_OFF}`;
        return { forecast, reading: { status: 'stale', updatedAt, text } };
    }
    return { forecast, reading: { status: 'fresh', updatedAt, text: 'Venue reading · on your guest card' } };
}

/**
 * What to do before service, in order. `target` names the section a row opens.
 * @returns {Array<{ key: string, title: string, detail: string, icon: string, done: boolean, target: string }>}
 */
export function partnerTodayTasks({ venue, tools = null, heatingConflict = null, heatingAnswered = false, hoursKnown = true, guestChecked = false }) {
    const tasks = [];
    if (heatingConflict) {
        tasks.push({ key: 'heating', icon: 'heater', target: 'heating', done: heatingAnswered,
            title: heatingAnswered ? 'Heating info fixed' : 'Fix your heating info',
            detail: heatingAnswered ? 'Your guest card matches your answer' : 'Guests are told you have outdoor heaters' });
    }
    if (!hoursKnown) {
        tasks.push({ key: 'hours', icon: 'clock', target: 'hours', done: false,
            title: 'Add your service hours', detail: 'To see your next service and its weather' });
    }
    const deal = typeof tools?.happyHour?.deal === 'string' ? tools.happyHour.deal.trim() : '';
    tasks.push({ key: 'special', icon: 'pint', target: 'special', done: Boolean(deal),
        title: deal ? 'Special added' : 'Add a special', detail: deal ? `“${deal}”` : 'Shows on your guest card under Specials' });
    if (!venueOfferings(venue).length && !outdoorChips(tools?.outdoor).length) {
        tasks.push({ key: 'setup', icon: 'garden-table', target: 'outdoor', done: false,
            title: 'Add your outdoor setup', detail: 'Your guest card lists no features yet' });
    }
    tasks.push({ key: 'guest', icon: 'sparkles', target: 'guest', done: guestChecked,
        title: guestChecked ? 'Guest card checked' : 'Check your guest card', detail: 'See it the way guests do' });
    return tasks;
}
