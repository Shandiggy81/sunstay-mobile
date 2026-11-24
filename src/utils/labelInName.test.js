import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { labelWords, nameContainsLabel } from './labelInName.js';

describe('labelWords', () => {
    it('keeps letters and numbers, lower-cased, and drops symbols, separators and emoji', () => {
        assert.deepEqual(labelWords('16°, Clear sky · 10 km/h'), ['16', 'clear', 'sky', '10', 'km', 'h']);
        assert.deepEqual(labelWords('☕ Morning 6:00am–10:00am'), ['morning', '6', '00am', '10', '00am']);
        assert.deepEqual(labelWords('1,087 venues'), ['1', '087', 'venues']);
    });

    it('drops accents so "Café" and "Cafe" are the same word', () => {
        assert.deepEqual(labelWords('Café Crème'), ['cafe', 'creme']);
    });

    it('returns no words for empty or missing text', () => {
        assert.deepEqual(labelWords(''), []);
        assert.deepEqual(labelWords(null), []);
        assert.deepEqual(labelWords('· ▾'), []);
    });
});

describe('nameContainsLabel', () => {
    it('passes when the visible words run unbroken inside the name', () => {
        assert.equal(nameContainsLabel('16°, Clear sky, Light breeze, 10 km/h', '16° Clear sky Light breeze 10 km/h'), true);
        assert.equal(nameContainsLabel('1,087 venues, 391 in full sun. Show venue list', '1,087 venues 391 in full sun'), true);
        assert.equal(nameContainsLabel('Today · Tue 24 Nov, choose stay date', 'Today · Tue 24 Nov ▾'), true);
    });

    it('fails when sibling text runs together without a space, as axe reads it', () => {
        assert.equal(nameContainsLabel('16°, Clear sky, Light breeze, 10 km/h', '16°Clear skyLight breeze10 km/h'), false);
    });

    it('fails when the name leaves out what the control shows', () => {
        assert.equal(nameContainsLabel('Show venue list', '1,087 venues 391 in full sun'), false);
        assert.equal(nameContainsLabel('Choose stay date', 'Today · Tue 24 Nov'), false);
    });

    it('fails when the name puts other words between the visible ones', () => {
        assert.equal(nameContainsLabel('Venue: Spleen. Bar. Sunny until 8pm. Wind 7 km/h. Light wind.', 'Spleen Bar Sunny until 8pm · Light wind'), false);
    });

    it('passes when nothing readable is visible', () => {
        assert.equal(nameContainsLabel('After dark', '🌙'), true);
        assert.equal(nameContainsLabel('Anything', ''), true);
    });
});
