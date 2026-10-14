import test from 'node:test';
import assert from 'node:assert/strict';
import SunCalc from 'suncalc';
import { clearSkyGhi, effectiveCloudCover, scoringCloudCover, skyClearness, solarAltitudeDeg } from '../../supabase/functions/enrich-microclimate/sky.ts';

const LAT = -37.8136, LNG = 144.9631;

test('Edge Function sun altitude matches suncalc within half a degree', () => {
    for (const iso of ['2026-10-14T20:30:00Z', '2026-12-21T02:00:00Z', '2026-06-21T23:00:00Z', '2026-03-01T06:45:00Z']) {
        const d = new Date(iso);
        const ref = SunCalc.getPosition(d, LAT, LNG).altitude * 180 / Math.PI;
        assert.ok(Math.abs(solarAltitudeDeg(d, LAT, LNG) - ref) < 0.5, `${iso}: ${solarAltitudeDeg(d, LAT, LNG)} vs ${ref}`);
    }
});

test('reported overcast with full sunlight scores as nearly clear', () => {
    const now = new Date('2026-10-14T21:30:00Z');   // 8:30am AEDT
    const alt = solarAltitudeDeg(new Date(now.getTime() - 450000), LAT, LNG);
    const sunlight = clearSkyGhi(alt) * 0.92;
    assert.ok(scoringCloudCover(100, sunlight, LAT, LNG, now) <= 12);
    assert.ok(scoringCloudCover(100, clearSkyGhi(alt) * 0.2, LAT, LNG, now) >= 95);
});

test('without sunlight data, or with the sun too low, the reported cloud is kept', () => {
    assert.equal(scoringCloudCover(80, null, LAT, LNG, new Date('2026-10-15T01:00:00Z')), 80);
    assert.equal(scoringCloudCover(80, 10, LAT, LNG, new Date('2026-10-15T12:00:00Z')), 80);   // night
    assert.equal(skyClearness(100, 2), null);
    assert.equal(effectiveCloudCover(100, 0.55), 60);
});
