import test from 'node:test';
import assert from 'node:assert/strict';
import { homePreviewLabel, showHomeSunny } from './homeChrome.js';
const now = new Date('2026-10-19T00:00:00Z'); // 11am Melbourne

test('home time button follows existing presets and arbitrary preview minutes', () => {
    const label = minutes => homePreviewLabel({ minutes, now, weather: null });
    assert.equal(label(null), 'Now');
    assert.equal(label(660), 'Now');
    assert.equal(label(720), 'Lunch');
    assert.equal(label(900), 'Arvo');
    assert.equal(label(870), '2:30pm');
    assert.equal(homePreviewLabel({ minutes: 1125, now, weather: { source: 'open-meteo', sys: { sunset: new Date('2026-10-19T08:44:00Z').getTime() / 1000 } } }), 'Golden hour');
    assert.equal(homePreviewLabel({ minutes: 870, now: new Date('2026-10-03T23:45:00Z') }), '2:30pm');
});
test('Sunny appears only on unobscured home', () => {
    assert.equal(showHomeSunny({}), true);
    assert.equal(showHomeSunny({ sheetExpanded: true, isMobile: false }), true);
    for (const flag of ['chatOpen', 'venueOpen', 'sheetExpanded', 'filtersOpen']) assert.equal(showHomeSunny({ [flag]: true }), false);
});
