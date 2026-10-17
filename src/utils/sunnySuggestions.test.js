import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BRUCEY_LINE,
    MAX_SUGGESTIONS,
    forecastSummary,
    isDogIntent,
    resolveSuggestedVenues,
    suggestVenuesForTag,
    timeOfDayChip,
    topTags,
    venueHasTag,
    venueSunWindowToday,
} from './sunnySuggestions.js';
import { buildSunnyContext } from './sunnyTools.js';
import { deriveSunForecast } from './sunForecastState.js';
import { MAX_CONTEXT_CHARS, payloadLimitError } from '../../supabase/functions/chat-sunny/limits.js';
import { demoVenues } from '../data/demoVenues.js';

const OFFSET = 11 * 3600;
const NOW = new Date(Date.UTC(2026, 9, 14, 14 - 11, 30)); // 2:30pm Melbourne

function weather() {
    const time = [];
    const cloud = [];
    const rain = [];
    const temp = [];
    for (let h = 0; h < 24; h += 1) {
        time.push(`2026-10-14T${String(h).padStart(2, '0')}:00`);
        cloud.push(h >= 14 && h < 16 ? 90 : 5); // cloudy 2–4pm, sunny otherwise
        rain.push(h === 15 ? 30 : 0);
        temp.push(12 + h / 3);
    }
    return { utcOffsetSeconds: OFFSET, hourly: { time, cloud_cover: cloud, precipitation_probability: rain, temperature_2m: temp } };
}
const forecast = () => deriveSunForecast({ hourly: weather().hourly, utcOffsetSeconds: OFFSET, now: NOW, sunrise: 6.5, sunset: 19.5 });

const V = (id, tags, extra = {}) => ({ id, venueName: id, tags, ...extra });

describe('venue suggestions', () => {
    it('matches tags with aliases and ranks by score, max three', () => {
        const venues = [
            V('a', ['Pet Friendly']),
            V('b', ['dog-friendly']),
            V('c', ['Rooftop']),
            V('d', ['Pet Friendly', 'Beer Garden']),
            V('e', ['PET FRIENDLY']),
        ];
        const score = { a: 20, b: 90, d: 50, e: 70 };
        const picks = suggestVenuesForTag(venues, 'Pet Friendly', (v) => score[v.id]);
        assert.deepEqual(picks.map((v) => v.id), ['b', 'e', 'd']);
        assert.equal(picks.length, MAX_SUGGESTIONS);
        assert.equal(venueHasTag(V('x', ['dog-friendly']), 'Pet Friendly'), true);
        assert.equal(venueHasTag(V('x', ['Rooftop']), 'Pet Friendly'), false);
    });

    it('ranks every venue when there is no tag, keeping list order on ties', () => {
        const venues = [V('a', []), V('b', []), V('c', []), V('d', [])];
        assert.deepEqual(suggestVenuesForTag(venues, null, () => null).map((v) => v.id), ['a', 'b', 'c']);
        assert.deepEqual(suggestVenuesForTag(null, 'Rooftop'), []);
    });

    it('resolves panToVenue ids in order, skipping unknown and repeated ones', () => {
        const venues = [V('a', []), V('b', []), V('c', []), V('d', [])];
        assert.deepEqual(resolveSuggestedVenues(['b', 'zz', 'b', 'a', 'd', 'c'], venues).map((v) => v.id), ['b', 'a', 'd']);
        assert.deepEqual(resolveSuggestedVenues([1], [{ id: 1 }]).map((v) => v.id), [1]);
        assert.deepEqual(resolveSuggestedVenues(null, venues), []);
    });

    it('finds three dog-friendly demo venues', () => {
        assert.equal(suggestVenuesForTag(demoVenues, 'Pet Friendly').length, 3);
    });
});

describe('isDogIntent and Brucey', () => {
    it('spots dog-friendly questions', () => {
        for (const t of ['Where can I take my dog?', 'pet friendly pubs', 'somewhere for the pupper? no, the pup', 'dog-friendly beer garden', 'Brucey, help']) {
            assert.equal(isDogIntent(t), true, t);
        }
        for (const t of ['hotdog stand', 'a sunny rooftop', '', null]) assert.equal(isDogIntent(t), false, String(t));
        assert.equal(BRUCEY_LINE, "Brucey's sniffed these out 🐾");
    });
});

describe('timeOfDayChip', () => {
    it('changes with the time of day', () => {
        assert.equal(timeOfDayChip(8).intent, 'morning');
        assert.equal(timeOfDayChip(8).icon, 'coffee');
        assert.equal(timeOfDayChip(12).intent, 'lunch');
        assert.equal(timeOfDayChip(16).intent, 'after-work');
        assert.equal(timeOfDayChip(19).intent, 'sunset');
        assert.equal(timeOfDayChip(19).icon, 'sunset');
        assert.equal(timeOfDayChip(23), null);
        assert.equal(timeOfDayChip(3), null);
        assert.equal(timeOfDayChip('x'), null);
    });
});

describe('venueSunWindowToday', () => {
    const curve = Array.from({ length: 24 }, (_, h) => (h >= 10 && h < 18 ? 0.9 : 0));

    it('intersects the venue curve with forecast sun', () => {
        // Curve sunny 10am–6pm; forecast cloudy 2–4pm → 10am–2pm is the longest run.
        assert.equal(venueSunWindowToday(curve, forecast()), '10am–2pm');
    });

    it('falls back to either source alone', () => {
        assert.equal(venueSunWindowToday(curve, null), '10am–6pm');
        assert.equal(venueSunWindowToday(null, forecast()), '6:30am–2pm', 'clamped to sunrise');
        assert.equal(venueSunWindowToday(null, null), null);
        assert.equal(venueSunWindowToday(new Array(24).fill(0), forecast()), 'none');
    });
});

describe('forecastSummary', () => {
    it('summarises the rest of today compactly', () => {
        const s = forecastSummary(forecast(), weather(), { now: NOW });
        assert.equal(s.sunrise, '6:30am');
        assert.equal(s.sunset, '7:30pm');
        assert.equal(s.now, 'cloud');
        assert.equal(s.nextSun, '4pm');
        assert.equal(s.hours[0], '2pm cloud 17° 0%');
        assert.equal(s.hours[2], '4pm sun 17° 0%');
        assert.ok(s.hours.length <= 12);
        assert.equal(forecastSummary(null, null), null);
    });
});

describe('topTags', () => {
    it('skips live-condition tags and caps at three', () => {
        assert.deepEqual(topTags(V('a', ['Sunny', 'Beer Garden', 'Windy', 'Pet Friendly', 'Live Music', 'Vegan'])), ['Beer Garden', 'Pet Friendly', 'Live Music']);
        assert.deepEqual(topTags(null), []);
    });
});

describe('buildSunnyContext with forecast and sun windows', () => {
    it('adds forecastToday, per-venue sunWindow and tags', () => {
        const curve = Array.from({ length: 24 }, (_, h) => (h >= 10 && h < 18 ? 0.9 : 0));
        const ctx = buildSunnyContext({
            timeOfDay: 900,
            activeVenue: { id: 'dv-07', venueName: 'Welcome to Thornbury' },
            visibleById: { 'dv-07': { id: 'dv-07', name: 'Welcome to Thornbury', lat: -37.76, lng: 145, sun_hour_fraction: curve } },
            forecast: forecast(),
            weather: weather(),
            venues: demoVenues,
            now: NOW,
        });
        assert.equal(ctx.forecastToday.now, 'cloud');
        assert.equal(ctx.visibleVenues[0].sunWindow, '10am–2pm');
        // Key amenities lead, by their app labels; other tags follow without repeats.
        const tags = ctx.visibleVenues[0].tags;
        assert.deepEqual(tags.slice(0, 3), ['Wheelchair accessible', 'Pram friendly', 'Dog friendly']);
        assert.ok(tags.includes('Beer Garden'));
        assert.equal(tags.filter((t) => /pet|pram|wheelchair/i.test(t)).length, 2, 'no "Pet Friendly" next to "Dog friendly"');
        assert.equal(ctx.visibleVenues[0].type, 'Food Truck Park');
        assert.equal(ctx.visibleVenues[0].sun_hour_fraction, undefined, 'the 24-slot curve is not posted');
        assert.equal(ctx.activeVenue.sunWindow, '10am–2pm');
    });

    it('stays inside the chat-sunny size limit at its largest', () => {
        const curve = Array.from({ length: 24 }, (_, h) => (h % 2 ? 0.9 : 0.1));
        const rows = Array.from({ length: 80 }, (_, i) => ({
            id: `dv-${i}-${'x'.repeat(40)}`,
            name: `A Very Long Melbourne Rooftop Bar And Beer Garden Name ${i}`,
            lat: -37.8136123456 + i / 1000,
            lng: 144.9631123456 + i / 1000,
            effective_sun: 0.123456789,
            effective_wind: 0.987654321,
            sun_now: 0.987654321,
            wind_shelter_score: 0.5555555,
            comfort_hint: 'sunny_breezy',
            canyon_aspect_hw: 0.4444444,
            geometry_confidence: 0.3333333,
            sun_hour_fraction: curve,
        }));
        const venues = rows.map((r) => ({ id: r.id, tags: Array.from({ length: 10 }, (_, j) => `Some Long Amenity Tag Number ${j} ${'y'.repeat(30)}`) }));
        const sunnyContext = buildSunnyContext({
            timeOfDay: 1439,
            activeVenue: rows[0],
            visibleById: rows,
            forecast: { ...forecast(), nowHour: 0 },
            weather: weather(),
            venues,
            now: NOW,
        });
        const size = JSON.stringify(sunnyContext).length;
        assert.ok(size < MAX_CONTEXT_CHARS, `${size} chars`);
        assert.ok(sunnyContext.forecastToday.hours.length <= 12);
        assert.equal(payloadLimitError({ messages: [{ role: 'user', content: 'sunny beer at 4pm?' }], sunnyContext }), null);
    });
});

describe('buildSunnyContext with amenities asked', () => {
    it('passes what was asked and how many venues matched', () => {
        const venue = { id: 'p1', name: 'Pram Cafe', lat: -37.8, lng: 144.96, tags: ['Pram Friendly'], vibe: 'Cafe' };
        const ctx = buildSunnyContext({
            visibleById: {},
            venues: [venue],
            place: { label: 'Elwood', venues: [venue], asked: ['Pram friendly'], amenityMatches: 1 },
            now: NOW,
        });
        assert.equal(ctx.placeAsked, 'Elwood');
        assert.deepEqual(ctx.amenitiesAsked, ['Pram friendly']);
        assert.equal(ctx.amenityMatches, 1);
        assert.deepEqual(ctx.visibleVenues[0].tags, ['Pram friendly']);
        assert.equal(ctx.visibleVenues[0].type, 'Cafe');
        const none = buildSunnyContext({ visibleById: {}, place: { label: null, venues: [], asked: ['Dog friendly'], amenityMatches: 0 }, now: NOW });
        assert.equal(none.amenityMatches, 0);
        assert.equal(none.placeAsked, undefined);
    });
});
