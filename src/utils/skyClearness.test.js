import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSkyGhi, clearnessRatio, codeForClearness, effectiveCloudCover, hourlySkyClearness, SUNNY_CLEARNESS } from './skyClearness.js';
import { deriveSunForecast } from './sunForecastState.js';

const LAT = -37.8136, LNG = 144.9631, AEDT = 11 * 3600;

test('clear-sky sunlight rises with the sun and is zero below the horizon', () => {
    assert.equal(clearSkyGhi(-3), 0);
    assert.ok(clearSkyGhi(10) > 100 && clearSkyGhi(10) < 150);
    assert.ok(clearSkyGhi(60) > 850 && clearSkyGhi(60) < 950);
});

test('clearness is null when the sun is too low to judge', () => {
    assert.equal(clearnessRatio(20, 2), null);
    assert.equal(clearnessRatio(null, 40), null);
    assert.ok(Math.abs(clearnessRatio(clearSkyGhi(40) / 2, 40) - 0.5) < 1e-9);
    assert.equal(clearnessRatio(5000, 40), 1);
});

test('only the cloud codes move with clearness', () => {
    assert.equal(codeForClearness(3, 0.9), 1);   // "overcast" in full sun: thin high cloud
    assert.equal(codeForClearness(0, 0.95), 0);
    assert.equal(codeForClearness(3, 0.6), 2);
    assert.equal(codeForClearness(1, 0.4), 2);
    assert.equal(codeForClearness(1, 0.2), 3);
    assert.equal(codeForClearness(63, 0.9), 63);  // rain stays rain
    assert.equal(codeForClearness(45, 0.9), 45);  // fog stays fog
    assert.equal(codeForClearness(3, null), 3);
});

test('effective cloud cover lines up with the sunny threshold', () => {
    assert.equal(effectiveCloudCover(100, 1), 0);
    assert.equal(effectiveCloudCover(100, SUNNY_CLEARNESS), 60);
    assert.equal(effectiveCloudCover(10, 0.05), 100);
    assert.equal(effectiveCloudCover(87, null), 87);
});

// A clear October morning in Melbourne that Open-Meteo calls overcast:
// 100% (high) cloud cover all day, but near clear-sky sunlight.
function overcastButSunny(factor) {
    const time = [], cloud_cover = [], shortwave_radiation = [];
    for (let h = 0; h < 24; h += 1) {
        const hh = String(h).padStart(2, '0');
        time.push(`2026-10-15T${hh}:00`);
        cloud_cover.push(100);
        // Value stamped hh:00 is the mean of the hour before, so use hh-0.5.
        const mid = Date.UTC(2026, 9, 15, h, 0) - AEDT * 1000 - 30 * 60 * 1000;
        const alt = sunAltitude(mid);
        shortwave_radiation.push(Math.round(clearSkyGhi(alt) * factor));
    }
    return { time, cloud_cover, shortwave_radiation };
}

import SunCalc from 'suncalc';
const sunAltitude = (ms) => SunCalc.getPosition(new Date(ms), LAT, LNG).altitude * 180 / Math.PI;

test('high cloud with full sunlight reads as sun, not cloud', () => {
    const hourly = overcastButSunny(0.92);
    hourly.sky_clearness = hourlySkyClearness(hourly, AEDT, LAT, LNG);
    assert.ok(hourly.sky_clearness[12] > 0.85, String(hourly.sky_clearness[12]));
    assert.equal(hourly.sky_clearness[2], null);   // night
    const f = deriveSunForecast({
        hourly, utcOffsetSeconds: AEDT,
        now: new Date(Date.UTC(2026, 9, 14, 20, 30)),   // 7:30am AEDT
        sunrise: 6.4, sunset: 19.6,
    });
    assert.equal(f.hours[12].kind, 'sun');
    assert.equal(f.now.kind, 'sun');
    assert.ok(f.sunMinutesLeft > 600, String(f.sunMinutesLeft));
});

test('thick cloud with little sunlight still reads as cloud', () => {
    const hourly = overcastButSunny(0.2);
    hourly.sky_clearness = hourlySkyClearness(hourly, AEDT, LAT, LNG);
    const f = deriveSunForecast({
        hourly, utcOffsetSeconds: AEDT,
        now: new Date(Date.UTC(2026, 9, 15, 1, 0)),   // noon AEDT
        sunrise: 6.4, sunset: 19.6,
    });
    assert.equal(f.hours[12].kind, 'cloud');
    assert.equal(f.now.kind, 'cloud');
});

test('without sunlight data the cloud-cover rule is unchanged', () => {
    const hourly = overcastButSunny(1);
    delete hourly.shortwave_radiation;
    const f = deriveSunForecast({ hourly, utcOffsetSeconds: AEDT, now: new Date(Date.UTC(2026, 9, 15, 1, 0)), sunrise: 6.4, sunset: 19.6 });
    assert.equal(f.hours[12].kind, 'cloud');
});
