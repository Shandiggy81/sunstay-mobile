import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sunnyGreeting, sunnyWeatherLine } from './sunnyGreeting.js';

// Shape returned by weatherService.fetchOpenMeteoWeatherLive; 7pm on 24 Nov 2026.
const evening = {
    main: { temp: 16.2 },
    uvi: 1,
    clouds: { all: 0 },
    cloudCoverPct: 0,
    weather: [{ main: 'Clear', description: 'clear sky' }],
    windKmh: 14,
    precipitation: 0,
    source: 'open-meteo',
};
const rain = { ...evening, main: { temp: 12 }, cloudCoverPct: 95, clouds: { all: 95 }, weather: [{ main: 'Rain', description: 'moderate rain' }], windKmh: 24 };
const highUv = { ...evening, main: { temp: 31 }, uvi: 9.4 };
const gale = { ...evening, windKmh: 42 };

describe('sunnyWeatherLine', () => {
    it('says the city weather once, in words', () => {
        assert.equal(sunnyWeatherLine(evening), 'Melbourne now: 16°, mostly clear, light breeze');
        assert.equal(sunnyWeatherLine({ ...evening, cloudCoverPct: 45, windKmh: 3 }), 'Melbourne now: 16°, some cloud, calm');
        assert.equal(sunnyWeatherLine(gale), 'Melbourne now: 16°, mostly clear, very windy');
    });

    it('says raining instead of the cloud', () => {
        assert.equal(sunnyWeatherLine(rain), 'Melbourne now: 12°, raining, breezy');
    });

    it('leaves out what it does not know', () => {
        assert.equal(sunnyWeatherLine({ ...evening, main: {}, windKmh: null }), 'Melbourne now: mostly clear');
    });

    it('shows no line for demo, failed or missing weather', () => {
        assert.equal(sunnyWeatherLine({ ...evening, source: 'demo' }), null);
        assert.equal(sunnyWeatherLine({ unavailable: true }), null);
        assert.equal(sunnyWeatherLine(null), null);
    });
});

describe('sunnyGreeting', () => {
    it('is the board greeting on an ordinary day or night', () => {
        assert.equal(sunnyGreeting(evening), "G'day! I'm Sunny. What kind of spot are you after?");
        assert.equal(sunnyGreeting({ ...evening, main: { temp: 29 } }), "G'day! I'm Sunny. What kind of spot are you after?");
        assert.equal(sunnyGreeting({ ...evening, cloudCoverPct: 90 }), "G'day! I'm Sunny. What kind of spot are you after?");
    });

    it('keeps the advice for rain, high UV and strong wind', () => {
        assert.equal(sunnyGreeting(rain), "G'day! I'm Sunny. With rain about, I'd pick somewhere cosy and covered. What are you after?");
        assert.equal(sunnyGreeting(highUv), "G'day! I'm Sunny. UV is at 9 right now, so I'd pick shade or cover. What are you after?");
        assert.equal(sunnyGreeting(gale), "G'day! I'm Sunny. It's windy out there, so I'd pick somewhere sheltered. What are you after?");
    });

    it('says when live weather is missing', () => {
        assert.match(sunnyGreeting(null), /Live weather isn't available right now/);
        assert.match(sunnyGreeting({ ...evening, source: 'demo' }), /Live weather isn't available right now/);
    });

    it('never repeats the temperature the line shows, and has no emoji', () => {
        for (const weather of [evening, rain, highUv, gale, null]) {
            const greeting = sunnyGreeting(weather);
            assert.doesNotMatch(greeting, /\d+°/);
            assert.doesNotMatch(greeting, /\p{Extended_Pictographic}/u);
        }
    });
});
