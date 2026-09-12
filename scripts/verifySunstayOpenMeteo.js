/**
 * Sanity checks for Open-Meteo → calculateSunstayScore pairing.
 * Run: node scripts/verifySunstayOpenMeteo.js
 */
import {
    getCurrentHourlyIndex,
    wallClockHourKey,
    fetchOpenMeteoWeather,
    getComfortLevel,
    openMeteoLocalTimeToDate,
} from '../src/utils/weatherService.js';
import { computeBestWindow } from '../src/utils/getBestWindow.js';
import {
    deriveVenueExposure,
    deriveVenueFacing,
    buildSunstayScoreInput,
    scoreVenueFromWeather,
    weatherForScoreTime,
    isLiveScoreTimestamp,
} from '../src/utils/scoreFromOpenMeteo.js';
import { calculateSunstayScore } from '../src/utils/calculateSunstayScore.js';
import { melbourneDate } from '../src/utils/sunPosition.js';

const MELBOURNE = { lat: -37.8136, lon: 144.9631 };
const OFFSET = 36000;
let passed = 0;
let failed = 0;

function check(name, actual, predicate) {
    const ok = typeof predicate === 'function' ? predicate(actual) : Object.is(actual, predicate);
    if (ok) {
        passed += 1;
        console.log(`  ✓ ${name}`);
    } else {
        failed += 1;
        console.log(`  ✗ ${name} → ${JSON.stringify(actual)}`);
    }
}

const noonMelbourne = new Date(Date.UTC(2026, 8, 12, 2, 10, 0)); // 12:10 AEST
console.log('Hourly index');
check(
    'wallClockHourKey at 12:10 AEST',
    wallClockHourKey(noonMelbourne, OFFSET),
    '2026-09-12T12:00',
);
check(
    'getCurrentHourlyIndex matches 12:00 slot',
    getCurrentHourlyIndex(
        { time: ['2026-09-12T11:00', '2026-09-12T12:00', '2026-09-12T13:00'] },
        OFFSET,
        noonMelbourne,
    ),
    1,
);

console.log('Venue exposure / facing');
check('OPEN default', deriveVenueExposure({ tags: ['Sunny'] }), 'OPEN');
check('Shaded → PARTIAL', deriveVenueExposure({ tags: ['Sunny', 'Shaded'] }), 'PARTIAL');
check('Covered tag → COVERED', deriveVenueExposure({ tags: ['Covered'] }), 'COVERED');
check('Fireplace → COVERED', deriveVenueExposure({ tags: ['Fireplace'] }), 'COVERED');
check('Indoor Warmth → INDOOR', deriveVenueExposure({ tags: ['Indoor Warmth'] }), 'INDOOR');
check('rainCover 65 → COVERED', deriveVenueExposure({ shielding: { rainCover: 65 } }), 'COVERED');
check('explicit exposure wins', deriveVenueExposure({ exposure: 'partial', tags: ['Indoor'] }), 'PARTIAL');
check('balcony_facing NW', deriveVenueFacing({ balcony_facing: 'NW' }), 'NW');
check('inferred rooftop facing is north (0)', deriveVenueFacing({ tags: ['Rooftop'] }), 0);

const terraceSun = { azimuth: 0, altitude: 40 };
const openNorth = { tags: ['Sunny'], balcony_facing: 'N' };
const covered = { tags: ['Covered', 'Fireplace'] };

function weather(overrides = {}) {
    return {
        main: { temp: 21, feels_like: 20, humidity: 50 },
        wind: { speed: 8 / 3.6 },
        windKmh: 8,
        precipProbability: 5,
        uvi: 4,
        ...overrides,
    };
}

console.log('Score pairing');
const perfect = scoreVenueFromWeather(weather(), openNorth, { sun: terraceSun });
check('mild north terrace is high 80s Perfect Sun', perfect, (r) => r.score >= 85 && r.label === 'Perfect Sun');

const rainyOpen = scoreVenueFromWeather(weather({ precipProbability: 70 }), { tags: ['Sunny'] }, { sun: terraceSun });
check('70% rain OPEN crashes below 30', rainyOpen, (r) => r.score < 30 && r.label === 'Seek Shelter');

const rainyCovered = scoreVenueFromWeather(weather({ precipProbability: 70 }), covered, { sun: terraceSun });
check('70% rain COVERED stays mid/high', rainyCovered, (r) => r.score >= 60 && r.label === 'Cosy Covered');

const cold = scoreVenueFromWeather(weather({ main: { temp: 12 } }), openNorth, { sun: terraceSun });
check('12°C is Too Cold', cold, (r) => r.label === 'Too Cold' && r.score < 60);

const missingWeather = scoreVenueFromWeather(null, openNorth);
check('null weather falls back to 75', missingWeather, (r) => r.score === 75);

const input = buildSunstayScoreInput(weather({ precipProbability: 22 }), { tags: ['Shaded'], balcony_facing: 'N' }, { sun: terraceSun });
check('input maps temp', input.temperatureC, 21);
check('input maps wind kmh', input.windKmh, 8);
check('input maps rain', input.rainProbability, 22);
check('input maps UV', input.uvIndex, 4);
check('input maps exposure PARTIAL', input.exposure, 'PARTIAL');
check('input maps facing N', input.venueExposureFacing, 'N');
check('input maps sun azimuth', input.sunAzimuthDeg, 0);

const sameAsDirect = calculateSunstayScore(input);
check('adapter result matches calculateSunstayScore', sameAsDirect.score, scoreVenueFromWeather(weather({ precipProbability: 22 }), { tags: ['Shaded'], balcony_facing: 'N' }, { sun: terraceSun }).score);

console.log('Comfort header (sustained wind_speed_10m)');
const mildBreeze = getComfortLevel({ apparentTemp: 21, precipProbability: 5, windKmh: 6 });
check('6 km/h breeze is Comfortable, not Windy', mildBreeze.label, 'Comfortable');
const justUnder = getComfortLevel({ apparentTemp: 21, precipProbability: 5, windKmh: 19.9 });
check('19.9 km/h falls through (not Windy)', justUnder.label, 'Comfortable');
const atBaseline = getComfortLevel({ apparentTemp: 21, precipProbability: 5, windKmh: 20 });
check('20 km/h is Windy (WIND_SOFT_KMH)', atBaseline.label, 'Windy');
const gustTrap = getComfortLevel({ apparentTemp: 21, precipProbability: 5, windKmh: 8, windGusts: 16 });
check('gusts ignored when sustained is a breeze', gustTrap.label, 'Comfortable');
const wetWins = getComfortLevel({ apparentTemp: 21, precipProbability: 70, windKmh: 25 });
check('rain still wins over wind', wetWins.label, 'Wet');

console.log('Settled hour overlay');
const at2pm = new Date(Date.UTC(2026, 8, 12, 4, 0, 0)); // 14:00 AEST
const at8pm = new Date(Date.UTC(2026, 8, 12, 10, 0, 0)); // 20:00 AEST
const hourlyWx = weather({
    utcOffsetSeconds: OFFSET,
    hourly: {
        time: ['2026-09-12T14:00', '2026-09-12T20:00'],
        temperature_2m: [24, 12],
        apparent_temperature: [23, 11],
        wind_speed_10m: [5, 8],
        precipitation_probability: [5, 10],
        uv_index: [7, 0],
        cloud_cover: [10, 40],
        _tzOffsetSeconds: OFFSET,
        _currentIndex: 0,
    },
});
check('14:00 is the live slot', isLiveScoreTimestamp(hourlyWx, at2pm), true);
check('20:00 is not the live slot', isLiveScoreTimestamp(hourlyWx, at8pm), false);
check('live slot weather is the same object', weatherForScoreTime(hourlyWx, at2pm), hourlyWx);
const eveningWx = weatherForScoreTime(hourlyWx, at8pm);
check('8pm overlays 12°C', eveningWx.main.temp, 12);
check('8pm overlays UV 0', eveningWx.uvi, 0);
check('8pm does not mutate live weather', hourlyWx.main.temp, 21);

const afternoon = scoreVenueFromWeather(hourlyWx, openNorth, { at: at2pm, sun: terraceSun });
const afternoonLive = scoreVenueFromWeather(hourlyWx, openNorth, { sun: terraceSun });
check('current-hour at matches live score', afternoon.score, afternoonLive.score);
check('current-hour at matches live label', afternoon.label, afternoonLive.label);

const evening = scoreVenueFromWeather(hourlyWx, openNorth, { at: at8pm });
check('8pm score differs from 2pm', evening.score !== afternoon.score, true);
check('8pm is Too Cold from forecast temp', evening.label, 'Too Cold');

const fromSlider = melbourneDate(14 * 60, at2pm);
check(
    'melbourneDate(14:00) wall-clock is 14:00 AEST',
    wallClockHourKey(fromSlider, OFFSET),
    '2026-09-12T14:00',
);
const fromSlider8 = melbourneDate(20 * 60, at2pm);
check(
    'melbourneDate(20:00) wall-clock is 20:00 AEST',
    wallClockHourKey(fromSlider8, OFFSET),
    '2026-09-12T20:00',
);

const eveningNowWx = {
    ...hourlyWx,
    hourly: { ...hourlyWx.hourly, _currentIndex: 1 },
};
const previewAfternoon = buildSunstayScoreInput(eveningNowWx, openNorth, { at: at2pm });
check('preview 2pm (when now is 8pm) uses 24°C hourly', previewAfternoon.temperatureC, 24);
check('preview 2pm uses hourly UV 7', previewAfternoon.uvIndex, 7);
check('preview 2pm sun altitude is well above horizon', previewAfternoon.sunAltitudeDeg, (n) => n != null && n > 20);

console.log('getBestWindow / computeBestWindow');
const windowNow = new Date(Date.UTC(2026, 8, 12, 2, 10, 0)); // 12:10 AEST
function hourlyForecast({ temps, rains, startHour = 12, currentIndex = 0 }) {
    const time = temps.map((_, i) => {
        const h = startHour + i;
        const day = h >= 24 ? '2026-09-13' : '2026-09-12';
        return `${day}T${String(h % 24).padStart(2, '0')}:00`;
    });
    return weather({
        utcOffsetSeconds: OFFSET,
        hourly: {
            time,
            temperature_2m: temps,
            apparent_temperature: temps,
            wind_speed_10m: temps.map(() => 6),
            precipitation_probability: rains ?? temps.map(() => 5),
            uv_index: temps.map((_, i) => ((startHour + i) % 24) >= 7 && ((startHour + i) % 24) <= 17 ? 5 : 0),
            cloud_cover: temps.map(() => 10),
            _tzOffsetSeconds: OFFSET,
            _currentIndex: currentIndex,
        },
    });
}

const missing = computeBestWindow(weather(), { now: windowNow });
check('no hourly → UNKNOWN', missing.type, 'UNKNOWN');
check('no hourly startsInHours is null', missing.startsInHours, null);
check('no hourly start/end are null', missing.start == null && missing.end == null, true);

const laterPeakWx = hourlyForecast({
    temps: [12, 12, 12, 22, 22, 22, 12, 12],
});
const laterPeak = computeBestWindow(laterPeakWx, { hoursAhead: 8, now: windowNow });
check('later peak is FUTURE_WINDOW', laterPeak.type, 'FUTURE_WINDOW');
check('later peak starts in 3h (15:00)', laterPeak.startsInHours, 3);
check('later peak uses engine score 0–100', laterPeak.score, (n) => Number.isInteger(n) && n >= 0 && n <= 100);
check('later peak uses engine label', laterPeak.label, (s) => typeof s === 'string' && s.length > 0 && !s.includes('Great conditions'));
check('later peak start is 15:00 AEST', laterPeak.start && wallClockHourKey(laterPeak.start, OFFSET), '2026-09-12T15:00');
check(
    'later peak is a 2–3h block inside the warm hours',
    laterPeak.end && (laterPeak.end - laterPeak.start) / 3600000,
    (n) => n === 2 || n === 3,
);
check(
    'later peak ends by 18:00 AEST',
    laterPeak.end && wallClockHourKey(laterPeak.end, OFFSET),
    (iso) => iso === '2026-09-12T17:00' || iso === '2026-09-12T18:00',
);
const laterPeakHour = scoreVenueFromWeather(
    laterPeakWx,
    { tags: ['Sunny'], exposure: 'OPEN', lat: MELBOURNE.lat, lng: MELBOURNE.lon },
    { at: laterPeak.start },
);
check('peak score matches scoreVenueFromWeather at window start hour band', laterPeak.score, (n) => n === laterPeakHour.score || n >= laterPeakHour.score);

const currentPeakWx = hourlyForecast({
    temps: [22, 23, 22, 12, 12, 12, 12, 12],
});
const currentPeak = computeBestWindow(currentPeakWx, { hoursAhead: 8, now: windowNow });
check('current 3h max is CURRENT_PEAK', currentPeak.type, 'CURRENT_PEAK');
check('current peak startsInHours is 0', currentPeak.startsInHours, 0);
check('current peak start is 12:00', currentPeak.start && wallClockHourKey(currentPeak.start, OFFSET), '2026-09-12T12:00');
check('current peak end is 15:00', currentPeak.end && wallClockHourKey(currentPeak.end, OFFSET), '2026-09-12T15:00');

const twoHourWx = hourlyForecast({
    temps: [21, 21, 21, 21, 21, 21, 21, 21],
    rains: [0, 0, 80, 80, 80, 80, 80, 80],
});
const twoHour = computeBestWindow(twoHourWx, { hoursAhead: 8, now: windowNow });
check('dry pair beats rainy 3h → 2h window', twoHour.start && twoHour.end && (twoHour.end - twoHour.start) / 3600000, 2);
check('2h window starts now', twoHour.type, 'CURRENT_PEAK');

const parsed = openMeteoLocalTimeToDate('2026-09-12T15:00', OFFSET);
check('openMeteoLocalTimeToDate 15:00 AEST', parsed && wallClockHourKey(parsed, OFFSET), '2026-09-12T15:00');

check(
    'hoursAhead=0 cannot form a 2h block → UNKNOWN',
    computeBestWindow(hourlyForecast({ temps: [22, 23, 22] }), { hoursAhead: 0, now: windowNow }).type,
    'UNKNOWN',
);
const twoSlots = computeBestWindow(hourlyForecast({ temps: [22, 23] }), { hoursAhead: 1, now: windowNow });
check('exactly 2 slots is a 2h CURRENT_PEAK', twoSlots.type === 'CURRENT_PEAK' && (twoSlots.end - twoSlots.start) / 3600000 === 2, true);

const rainyHours = {
    ...hourlyForecast({
        temps: [21, 21, 21, 21],
        rains: [80, 80, 80, 80],
    }),
    precipProbability: 80,
};
const openRain = computeBestWindow(rainyHours, { hoursAhead: 3, now: windowNow, venue: { tags: ['Sunny'], exposure: 'OPEN', lat: MELBOURNE.lat, lng: MELBOURNE.lon } });
const coveredRain = computeBestWindow(rainyHours, { hoursAhead: 3, now: windowNow, venue: covered });
check('optional venue is scored (OPEN rain < COVERED rain)', openRain.score < coveredRain.score, true);
check('legacy GREAT/GOOD/FAIR/POOR types are gone', ['CURRENT_PEAK', 'FUTURE_WINDOW', 'UNKNOWN'].includes(laterPeak.type), true);

console.log('Live Open-Meteo fetch');
try {
    const live = await fetchOpenMeteoWeather(MELBOURNE.lat, MELBOURNE.lon);
    check('source is open-meteo', live.source, 'open-meteo');
    check('temp is finite', live.main.temp, Number.isFinite);
    check('precipProbability 0–100', live.precipProbability, (n) => Number.isFinite(n) && n >= 0 && n <= 100);
    check('cloudCoverPct 0–100', live.cloudCoverPct, (n) => Number.isFinite(n) && n >= 0 && n <= 100);
    check('windKmh is finite', live.windKmh, Number.isFinite);
    check('hourly _currentIndex is in range', live.hourly._currentIndex, (i) => Number.isFinite(i) && i >= 0 && i < live.hourly.time.length);
    check('utcOffsetSeconds is Melbourne-ish', live.utcOffsetSeconds, (s) => s === 36000 || s === 39600);

    const liveOpen = scoreVenueFromWeather(live, { tags: ['Sunny', 'Beer Garden'], lat: MELBOURNE.lat, lng: MELBOURNE.lon, balcony_facing: 'N' });
    const liveCovered = scoreVenueFromWeather(live, { tags: ['Covered', 'Fireplace'], lat: MELBOURNE.lat, lng: MELBOURNE.lon });
    check('live OPEN score is 0–100 int', liveOpen.score, (n) => Number.isInteger(n) && n >= 0 && n <= 100);
    check('live COVERED score is 0–100 int', liveCovered.score, (n) => Number.isInteger(n) && n >= 0 && n <= 100);
    check('live labels are non-empty', liveOpen.label, (s) => typeof s === 'string' && s.length > 0);
    if (live.precipProbability > 40) {
        check('live rain OPEN is below COVERED', liveOpen.score < liveCovered.score, true);
    }
    console.log(`  ℹ live ${live.main.temp}°C, rain ${live.precipProbability}%, wind ${live.windKmh} km/h, UV ${live.uvi}`);
    console.log(`  ℹ OPEN ${liveOpen.score} ${liveOpen.label} | COVERED ${liveCovered.score} ${liveCovered.label}`);

    const liveVenue = { tags: ['Sunny', 'Beer Garden'], lat: MELBOURNE.lat, lng: MELBOURNE.lon, balcony_facing: 'N' };
    const liveAtNow = scoreVenueFromWeather(live, liveVenue, { at: new Date() });
    check('at: now equals live score', liveAtNow.score, liveOpen.score);
    check('at: now equals live label', liveAtNow.label, liveOpen.label);
    const liveAt8pm = scoreVenueFromWeather(live, liveVenue, { at: melbourneDate(20 * 60) });
    check('live 8pm score is 0–100 int', liveAt8pm.score, (n) => Number.isInteger(n) && n >= 0 && n <= 100);
    console.log(`  ℹ settled 8pm OPEN ${liveAt8pm.score} ${liveAt8pm.label}`);

    const liveWindow = computeBestWindow(live, { hoursAhead: 8, venue: liveVenue });
    check('live window type is known or unknown', ['CURRENT_PEAK', 'FUTURE_WINDOW', 'UNKNOWN'].includes(liveWindow.type), true);
    if (liveWindow.type !== 'UNKNOWN') {
        check('live window has start/end Dates', liveWindow.start instanceof Date && liveWindow.end instanceof Date, true);
        check('live window is 2–3 hours', (liveWindow.end - liveWindow.start) / 3600000, (n) => n === 2 || n === 3);
        check('live window peak is 0–100', liveWindow.score, (n) => Number.isInteger(n) && n >= 0 && n <= 100);
        console.log(`  ℹ best window ${liveWindow.type} ${liveWindow.label} ${liveWindow.score} startsIn=${liveWindow.startsInHours}h`);
    }
} catch (err) {
    failed += 1;
    console.log(`  ✗ live fetch failed: ${err.message}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
