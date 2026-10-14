import test from 'node:test';
import assert from 'node:assert/strict';
import { outdoorChip, venueConditionChips, windChip, windWord } from './venueConditionChips.js';
const windWordFor = windWord;

test('wind words', () => {
    assert.equal(windWord(3), 'Calm');
    assert.equal(windWord(12), 'Light wind');
    assert.equal(windWord(25), 'Breezy');
    assert.equal(windWord(35), 'Windy');
    assert.equal(windWord(55), 'Very windy');
    assert.equal(windWord(null), null);
});

test('a rooftop feels more wind than a courtyard', () => {
    const weather = { wind: { speed: 20 / 3.6 } };
    const roof = windChip({ tags: ['Rooftop'] }, weather);
    const court = windChip({ vibe: 'Maze Garden courtyard', tags: [] }, weather);
    assert.equal(roof.icon, 'windsock');
    assert.equal(roof.text, windWordFor(roof.kmh));
    assert.ok(roof.kmh > court.kmh, `${roof.kmh} vs ${court.kmh}`);
    assert.equal(windChip({}, {}), null);
});

test('outdoor space comes only from venue data', () => {
    assert.deepEqual(outdoorChip({ tags: ['Rooftop', 'Views'] }), { key: 'outdoor', icon: 'rooftop-terrace', text: 'Rooftop' });
    assert.equal(outdoorChip({ tags: ['Beer Garden'] }).text, 'Beer garden');
    assert.equal(outdoorChip({ vibe: 'Waterfront Pub', tags: [] }).text, 'Waterfront');
    assert.equal(outdoorChip({ hasBalcony: true }).text, 'Balcony');
    assert.equal(outdoorChip({ roomTypes: [{}, {}, {}] }).text, 'Room sun');
    assert.equal(outdoorChip({ vibe: 'Library Cafe', tags: ['Vegan'] }), null);
});

test('chips come in sun, wind, outdoor order', () => {
    const forecast = { sunriseHour: 6.4, sunsetHour: 19.6, nowHour: 9, hasHourly: true, now: { kind: 'sun' }, sunUntil: 15 };
    const chips = venueConditionChips({ venue: { tags: ['Beer Garden'] }, forecast, weather: { wind: { speed: 3 } } });
    assert.deepEqual(chips.map((c) => c.key), ['sun', 'wind', 'outdoor']);
    assert.equal(chips[0].text, 'Sunny until 3pm');
    assert.equal(chips[0].tone, 'sun');
    assert.deepEqual(venueConditionChips({ venue: {}, forecast: null, weather: null }), []);
});
