import test from 'node:test';
import assert from 'node:assert/strict';
import { listRowSunLine } from './listRowSunLine.js';

test('café day total takes precedence over the open-sky sun chip', () => {
    assert.equal(listRowSunLine({ rowSunLine: '8h 11m sun today', sunText: 'Sunny until 1pm', windText: 'Calm' }), '8h 11m sun today · Calm');
    assert.equal(listRowSunLine({ rowSunLine: 'No direct sun today', windText: 'Light wind' }), 'No direct sun today · Light wind');
});
test('other rows join existing words without the old Now prefix', () => {
    assert.equal(listRowSunLine({ sunText: 'Now: Sunny until 1pm', windText: 'Light wind' }), 'Sunny until 1pm · Light wind');
    assert.equal(listRowSunLine({ rowSunLine: ' ', sunText: ' Sun has set ', windText: ' Now: Calm ' }), 'Sun has set · Calm');
});
test('building-shaded and sun-moment rows never show the open-sky sun text', () => {
    // A café row whose shaded day is still loading shows the wind alone, not "Sunny until 1pm".
    assert.equal(listRowSunLine({ rowSunLine: null, sunText: 'Sunny until 1pm', windText: 'Calm', openSkyHidden: true }), 'Calm');
    assert.equal(listRowSunLine({ rowSunLine: '8h 11m sun today', sunText: 'Sunny until 1pm', windText: 'Calm', openSkyHidden: true }), '8h 11m sun today · Calm');
    assert.equal(listRowSunLine({ sunText: 'Sunny until 1pm', windText: 'Light wind', openSkyHidden: true }), 'Light wind');
    assert.equal(listRowSunLine({ sunText: 'Sunny until 1pm', openSkyHidden: true }), null);
});
test('missing parts do not produce dangling separators or invented claims', () => {
    assert.equal(listRowSunLine({ sunText: 'Sun times unavailable' }), 'Sun times unavailable');
    assert.equal(listRowSunLine({ windText: 'Breezy' }), 'Breezy');
    assert.equal(listRowSunLine(), null);
    assert.equal(listRowSunLine({ rowSunLine: null, sunText: 'Now: ', windText: '' }), null);
    assert.equal(listRowSunLine({ sunText: 0, windText: {} }), null);
});
