import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchVenuesInBbox } from './venuesInBboxQuery.js';

// A fake Supabase client over `total` rows that records every call and, like
// PostgREST, returns at most 1,000 rows however wide the requested range.
function fakeClient(total, { failOnPage = null } = {}) {
    const calls = [];
    const rows = Array.from({ length: total }, (_, i) => ({ id: `v${i}` }));
    return {
        calls,
        rpc(name, args) {
            const call = { name, args, range: null, signal: null };
            calls.push(call);
            const builder = {
                range(from, to) { call.range = [from, to]; return builder; },
                abortSignal(signal) { call.signal = signal; return builder; },
                then(resolve, reject) {
                    const page = calls.length - 1;
                    if (page === failOnPage) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve, reject);
                    const [from, to] = call.range;
                    const end = Math.min(to + 1, from + 1000, total);
                    return Promise.resolve({ data: rows.slice(from, end), error: null }).then(resolve, reject);
                },
            };
            return builder;
        },
    };
}

const BBOX = { minLng: 144.9, minLat: -37.85, maxLng: 145.0, maxLat: -37.78 };

test('reads past the 1,000-row response cap in pages', async () => {
    const client = fakeClient(1500);
    const signal = new AbortController().signal;
    const { data, error } = await fetchVenuesInBbox(client, BBOX, { limit: 2000, signal });
    assert.equal(error, null);
    assert.equal(data.length, 1500);
    assert.equal(new Set(data.map((r) => r.id)).size, 1500, 'no row twice');
    assert.deepEqual(client.calls.map((c) => c.range), [[0, 999], [1000, 1999]]);
    for (const c of client.calls) {
        assert.equal(c.name, 'venues_in_bbox');
        assert.deepEqual(c.args, { min_lng: 144.9, min_lat: -37.85, max_lng: 145.0, max_lat: -37.78, p_limit: 2000 });
        assert.equal(c.signal, signal);
    }
});

test('one request when the view holds fewer than a page', async () => {
    const client = fakeClient(40);
    const { data } = await fetchVenuesInBbox(client, BBOX, { limit: 2000 });
    assert.equal(data.length, 40);
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].signal, null);
});

test('exactly one full page asks once more and stops on the empty page', async () => {
    const client = fakeClient(1000);
    const { data } = await fetchVenuesInBbox(client, BBOX, { limit: 2000 });
    assert.equal(data.length, 1000);
    assert.equal(client.calls.length, 2);
});

test('an error on a later page returns the error, not a partial list', async () => {
    const client = fakeClient(1500, { failOnPage: 1 });
    const { data, error } = await fetchVenuesInBbox(client, BBOX, { limit: 2000 });
    assert.equal(data, null);
    assert.deepEqual(error, { message: 'boom' });
});
