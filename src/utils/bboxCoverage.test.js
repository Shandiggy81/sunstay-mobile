import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BBOX_FETCH_FRESH_MS,
    bboxContains,
    isCompleteFetch,
    needsBboxFetch,
    recordBboxFetch,
} from './bboxCoverage.js';

const NOW = 1_800_000_000_000;
const CBD = { minLng: 144.94, minLat: -37.83, maxLng: 144.99, maxLat: -37.80 };
const INSIDE_CBD = { minLng: 144.95, minLat: -37.82, maxLng: 144.98, maxLat: -37.81 };
const fetched = (overrides = {}) => ({ bbox: CBD, fetchedAt: NOW - 60_000, complete: true, ...overrides });

describe('needsBboxFetch', () => {
    it('keeps the freshness window at 10 minutes, under the 20-minute enrich interval', () => {
        assert.equal(BBOX_FETCH_FRESH_MS, 10 * 60 * 1000);
    });

    it('skips a bbox inside a fresh, complete fetch', () => {
        assert.equal(needsBboxFetch(INSIDE_CBD, [fetched()], { now: NOW }), false);
    });

    it('skips the same bbox fetched again', () => {
        assert.equal(needsBboxFetch(CBD, [fetched()], { now: NOW }), false);
    });

    it('fetches a bbox that extends partly outside', () => {
        const wider = { ...INSIDE_CBD, maxLng: 145.01 };
        assert.equal(needsBboxFetch(wider, [fetched()], { now: NOW }), true);
    });

    it('fetches when the covering fetch was truncated', () => {
        assert.equal(needsBboxFetch(INSIDE_CBD, [fetched({ complete: false })], { now: NOW }), true);
    });

    it('fetches when the covering fetch is older than 10 minutes', () => {
        const stale = fetched({ fetchedAt: NOW - BBOX_FETCH_FRESH_MS - 1 });
        assert.equal(needsBboxFetch(INSIDE_CBD, [stale], { now: NOW }), true);
        const exactlyTen = fetched({ fetchedAt: NOW - BBOX_FETCH_FRESH_MS });
        assert.equal(needsBboxFetch(INSIDE_CBD, [exactlyTen], { now: NOW }), true);
    });

    it('fetches when nothing has been fetched yet', () => {
        assert.equal(needsBboxFetch(INSIDE_CBD, [], { now: NOW }), true);
        assert.equal(needsBboxFetch(INSIDE_CBD, undefined, { now: NOW }), true);
    });

    it('makes no request for an invalid bbox', () => {
        assert.equal(needsBboxFetch(null, [], { now: NOW }), false);
        assert.equal(needsBboxFetch({ ...CBD, minLng: NaN }, [], { now: NOW }), false);
        assert.equal(needsBboxFetch({ ...CBD, maxLng: CBD.minLng }, [], { now: NOW }), false);
        assert.equal(needsBboxFetch({ minLng: 1, minLat: 2 }, [], { now: NOW }), false);
    });

    it('is covered by any one of several fetches', () => {
        const elsewhere = fetched({ bbox: { minLng: 145.1, minLat: -37.9, maxLng: 145.2, maxLat: -37.85 } });
        assert.equal(needsBboxFetch(INSIDE_CBD, [elsewhere, fetched()], { now: NOW }), false);
    });
});

describe('isCompleteFetch', () => {
    it('is complete only below the row limit', () => {
        assert.equal(isCompleteFetch(1100, 2000), true);
        assert.equal(isCompleteFetch(0, 2000), true);
        assert.equal(isCompleteFetch(2000, 2000), false);
        assert.equal(isCompleteFetch(undefined, 2000), false);
    });
});

describe('bboxContains', () => {
    it('counts shared edges as inside', () => {
        assert.equal(bboxContains(CBD, CBD), true);
        assert.equal(bboxContains(INSIDE_CBD, CBD), false);
    });
});

describe('recordBboxFetch', () => {
    it('adds the newest entry first and drops stale ones', () => {
        const stale = fetched({ fetchedAt: NOW - BBOX_FETCH_FRESH_MS - 1 });
        const recent = fetched();
        const entry = { bbox: INSIDE_CBD, fetchedAt: NOW, complete: true };
        assert.deepEqual(recordBboxFetch([recent, stale], entry, { now: NOW }), [entry, recent]);
    });

    it('caps the history length', () => {
        let history = [];
        for (let i = 0; i < 50; i++) {
            history = recordBboxFetch(history, { bbox: CBD, fetchedAt: NOW, complete: true }, { now: NOW });
        }
        assert.equal(history.length, 20);
    });
});
