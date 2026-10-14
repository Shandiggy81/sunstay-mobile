import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { directSunScore, SUN_FULL_ALTITUDE_DEG } from './directSunScore.js';
import { scoreVenueFromWeather, sunScoreFromWeather } from './scoreFromOpenMeteo.js';

describe('directSunScore', () => {
    it('is full for a high sun, clear sky and open seating', () => {
        assert.equal(directSunScore({ sunAltitudeDeg: 40, cloudCoverPct: 0, exposure: 'OPEN' }), 100);
    });

    it('is zero at night or when a surveyed obstacle shades the seats', () => {
        assert.equal(directSunScore({ sunAltitudeDeg: -5, cloudCoverPct: 0 }), 0);
        assert.equal(directSunScore({ sunAltitudeDeg: 0, cloudCoverPct: 0 }), 0);
        assert.equal(directSunScore({ sunAltitudeDeg: 40, cloudCoverPct: 0, shaded: true }), 0);
    });

    it('applies cloud cover the way the edge job does', () => {
        assert.equal(directSunScore({ sunAltitudeDeg: 40, cloudCoverPct: 30 }), 70);
        assert.equal(directSunScore({ sunAltitudeDeg: 40, cloudCoverPct: 100 }), 0);
        // Unknown cloud is 50%, the edge job's default.
        assert.equal(directSunScore({ sunAltitudeDeg: 40, cloudCoverPct: null }), 50);
    });

    it('ramps up from the horizon to full sun', () => {
        assert.equal(directSunScore({ sunAltitudeDeg: SUN_FULL_ALTITUDE_DEG / 2, cloudCoverPct: 0 }), 50);
        assert.equal(directSunScore({ sunAltitudeDeg: SUN_FULL_ALTITUDE_DEG, cloudCoverPct: 0 }), 100);
    });

    it('scales by seating exposure', () => {
        const at = { sunAltitudeDeg: 40, cloudCoverPct: 0 };
        assert.equal(directSunScore({ ...at, exposure: 'PARTIAL' }), 60);
        assert.equal(directSunScore({ ...at, exposure: 'COVERED' }), 25);
        assert.equal(directSunScore({ ...at, exposure: 'INDOOR' }), 0);
        assert.equal(directSunScore({ ...at, exposure: 'something-new' }), 100);
    });

    it('is null when the sun height is unknown', () => {
        assert.equal(directSunScore({ sunAltitudeDeg: null, cloudCoverPct: 0 }), null);
        assert.equal(directSunScore(), null);
    });
});

describe('sunScoreFromWeather', () => {
    const venue = { id: 'v1', lat: -37.8136, lng: 144.9631, tags: [] };
    // Sunny 8°C morning: the case the comfort index scored "Too Cold".
    const coldSunny = {
        main: { temp: 8, feels_like: 6 },
        windKmh: 6,
        precipProbability: 0,
        cloudCoverPct: 0,
        uvi: 3,
    };
    const morningSun = { altitude: 30, azimuth: 70 };

    it('reports direct sun, not comfort, on a cold clear morning', () => {
        const sun = sunScoreFromWeather(coldSunny, venue, { sun: morningSun });
        assert.equal(sun.score, 100);
        assert.equal(sun.label, 'Full sun');

        // The comfort index still says cold; that number is not a sun score.
        const comfort = scoreVenueFromWeather(coldSunny, venue, { sun: morningSun });
        assert.ok(comfort.score < 40, `comfort ${comfort.score}`);
    });

    it('follows forecast cloud cover', () => {
        const overcast = { ...coldSunny, cloudCoverPct: 90 };
        const sun = sunScoreFromWeather(overcast, venue, { sun: morningSun });
        assert.equal(sun.score, 10);
        assert.equal(sun.label, 'Mostly shaded');
    });

    it('is zero after sunset', () => {
        const sun = sunScoreFromWeather(coldSunny, venue, { sun: { altitude: -8, azimuth: 260 } });
        assert.equal(sun.score, 0);
        assert.equal(sun.label, 'In shade');
    });

    it('uses surveyed obstacles to shade the seats', () => {
        const walled = { ...venue, obstacle_height: 20, obstacle_distance: 5 };
        assert.equal(sunScoreFromWeather(coldSunny, walled, { sun: morningSun }).score, 0);
    });

    it('uses the venue exposure', () => {
        const indoor = { ...venue, tags: ['Indoor'] };
        assert.equal(sunScoreFromWeather(coldSunny, indoor, { sun: morningSun }).score, 0);
    });

    it('computes sun height from the venue and time when not given', () => {
        // 10:00 AEDT on 15 Oct: the sun is well up in Melbourne.
        const now = new Date('2026-10-14T23:00:00Z');
        const sun = sunScoreFromWeather(coldSunny, venue, { now });
        assert.equal(sun.score, 100);
        const night = sunScoreFromWeather(coldSunny, venue, { now: new Date('2026-10-14T12:00:00Z') });
        assert.equal(night.score, 0);
    });

    it('is unavailable without weather', () => {
        const sun = sunScoreFromWeather(null, venue);
        assert.equal(sun.score, null);
        assert.equal(sun.unavailable, true);
    });
});
