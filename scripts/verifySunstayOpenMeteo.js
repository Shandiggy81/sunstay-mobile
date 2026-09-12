/**
 * Sanity checks for Open-Meteo → calculateSunstayScore pairing.
 * Run: node scripts/verifySunstayOpenMeteo.js
 */
import {
    getCurrentHourlyIndex,
    wallClockHourKey,
    fetchOpenMeteoWeather,
} from '../src/utils/weatherService.js';
import {
    deriveVenueExposure,
    deriveVenueFacing,
    buildSunstayScoreInput,
    scoreVenueFromWeather,
} from '../src/utils/scoreFromOpenMeteo.js';
import { calculateSunstayScore } from '../src/utils/calculateSunstayScore.js';

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
} catch (err) {
    failed += 1;
    console.log(`  ✗ live fetch failed: ${err.message}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
