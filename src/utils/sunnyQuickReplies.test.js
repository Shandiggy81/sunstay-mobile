import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuickReplies, chipAskWords, chipForText, DOG_TAG, SUNNY_CHIPS_SHOWN } from './sunnyQuickReplies.js';

// Shape returned by weatherService.fetchOpenMeteoWeatherLive.
const clear = { main: { temp: 16 }, uvi: 1, cloudCoverPct: 0, weather: [{ main: 'Clear', description: 'clear sky' }], windKmh: 14, precipitation: 0, source: 'open-meteo' };
const rain = { ...clear, weather: [{ main: 'Rain', description: 'light rain' }], precipitation: 1.2 };
const highUv = { ...clear, uvi: 10 };
const gale = { ...clear, windKmh: 45 };
const WEATHERS = { clear, rain, highUv, gale, none: null };

const texts = (chips) => chips.map((chip) => chip.text);
const intentFor = (text, weather = clear, hour = 19) => chipForText(text, buildQuickReplies(weather, hour))?.intent ?? null;

describe('buildQuickReplies', () => {
    it("leads with the time chip, then the weather's picks", () => {
        // 7:06pm on 24 Nov 2026, 16° and clear: the four the board shows.
        const chips = buildQuickReplies(clear, 19);
        assert.deepEqual(texts(chips.slice(0, SUNNY_CHIPS_SHOWN)), ['Sunset spots', 'Sunny outdoor spots', 'Rooftop bars', 'Covered and cosy']);
        assert.equal(chips.length, 12);
        assert.equal(SUNNY_CHIPS_SHOWN, 4);
    });

    it('puts the rain, UV and wind chips first in that weather', () => {
        assert.deepEqual(texts(buildQuickReplies(rain, 16).slice(0, 2)), ['After-work drinks', 'Rainy day picks']);
        assert.equal(buildQuickReplies(highUv, 12)[1].text, 'Covered and cosy');
        assert.equal(buildQuickReplies(gale, 9)[1].text, 'Out of the wind');
    });

    it('has no time chip late at night', () => {
        const chips = buildQuickReplies(clear, 23);
        assert.equal(chips.length, 11);
        assert.equal(chips[0].text, 'Sunny outdoor spots');
    });

    it('keeps the dog chip on the shared dog tag', () => {
        assert.equal(buildQuickReplies(clear, 19).find((chip) => chip.intent === 'dog').tag, DOG_TAG);
    });
});

describe('chipForText', () => {
    it("matches every chip's own words, whatever the hour and weather", () => {
        for (const weather of Object.values(WEATHERS)) {
            for (let hour = 0; hour < 24; hour += 1) {
                const chips = buildQuickReplies(weather, hour);
                for (const chip of chips) {
                    const match = chipForText(chip.text, chips);
                    assert.ok(match, `"${chip.text}" at ${hour}h matched nothing`);
                    // Two indoor chips share an answer; either is the same reply rows.
                    assert.equal(match.tag, chip.tag, `"${chip.text}" at ${hour}h`);
                    assert.equal(match.action, chip.action, `"${chip.text}" at ${hour}h`);
                }
            }
        }
    });

    it('answers the chips that are not shown when they are typed', () => {
        assert.equal(intentFor('dog friendly'), 'dog');
        assert.equal(intentFor('Any dog-friendly spots?'), 'dog');
        assert.equal(intentFor('can I bring my dog'), 'dog');
        assert.equal(intentFor('wheelchair access'), 'accessible');
        assert.equal(intentFor('step-free entry please'), 'accessible');
        assert.equal(intentFor('somewhere for a big group'), 'business');
        assert.equal(intentFor('family friendly'), 'family');
        assert.equal(intentFor('kids'), 'family');
        assert.equal(intentFor('smoking area'), 'smoking');
        assert.equal(intentFor('Surprise me!'), 'surprise');
        assert.equal(intentFor('you pick'), 'surprise');
        assert.equal(intentFor('somewhere out of the wind'), 'wind');
    });

    it('reads the usual ways of asking for a shown chip', () => {
        assert.equal(intentFor('hey Sunny, any rooftop bars?'), 'rooftop');
        assert.equal(intentFor('which rooftop is best'), 'rooftop');
        assert.equal(intentFor('rooftop with a view'), 'rooftop');
        assert.equal(intentFor("where's the sun right now?"), 'sunny');
        assert.equal(intentFor('somewhere to sit outside'), 'sunny');
        assert.equal(intentFor('sunset drinks'), 'sunset');
        assert.equal(intentFor('golden hour'), 'sunset');
        assert.equal(intentFor('cosy'), 'cloudy');
    });

    it('lets two chips with the same answer share an ask', () => {
        // Both indoor chips filter to Indoor Warmth; today's order picks the reply.
        assert.equal(intentFor('somewhere cosy inside'), 'cloudy');
        assert.equal(intentFor('somewhere cosy inside', rain, 23), 'indoor');
    });

    it('answers a time chip only in its part of the day', () => {
        assert.equal(intentFor('sunset spots', clear, 19), 'sunset');
        assert.equal(intentFor('sunset spots', clear, 14), null);
        assert.equal(intentFor('flat white in the sun', clear, 8), 'morning');
        assert.equal(intentFor('lunch in the sun', clear, 12), 'lunch');
        assert.equal(intentFor('after work drinks', clear, 16), 'after-work');
        assert.equal(intentFor('beer garden', clear, 16), 'after-work');
        assert.equal(intentFor('beer garden', clear, 12), null);
    });

    it('leaves anything more than a chip to chat-sunny', () => {
        for (const ask of [
            'Is the Emerson Rooftop dog friendly?', // a venue
            'rooftop bars in Fitzroy', // a suburb
            'dog friendly near me', // a place
            'rooftop bars tonight', // a time
            'is it raining?', // the weather, not a venue
            'how windy is it',
            "what's the weather like",
            'sunny rooftops', // two chips
            'dog friendly cafe',
            'room for 8 people',
            'not rooftops',
            'somewhere warm', // no chip's own word
            'rooftp bars', // a typo
            'hello',
            'thanks!',
            '',
        ]) {
            assert.equal(intentFor(ask), null, ask);
        }
        assert.equal(chipForText('dog friendly', null), null);
    });

    it('folds case, apostrophes and plurals', () => {
        assert.deepEqual(chipAskWords('G’day Sunny! Any DOGS allowed?'), ['dog', 'allowed']);
        assert.deepEqual(chipAskWords('puppies & families'), ['puppy', 'family']);
    });
});
