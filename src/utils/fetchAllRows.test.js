import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows } from './fetchAllRows.js';

const table = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
const pager = (rows, calls = []) => async (from, to) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
};

test('reads past the 1,000-row cap in pages', async () => {
    const calls = [];
    const { data, error } = await fetchAllRows(pager(table(1110), calls));
    assert.equal(error, null);
    assert.equal(data.length, 1110);
    assert.deepEqual(calls, [[0, 999], [1000, 1999]]);
});

test('one request when everything fits, and an extra empty page on an exact multiple', async () => {
    const small = [];
    assert.equal((await fetchAllRows(pager(table(67), small))).data.length, 67);
    assert.deepEqual(small, [[0, 999]]);
    const exact = [];
    assert.equal((await fetchAllRows(pager(table(1000), exact))).data.length, 1000);
    assert.deepEqual(exact, [[0, 999], [1000, 1999]]);
});

test('an error on any page is returned like a single failed call', async () => {
    let n = 0;
    const result = await fetchAllRows(async (from, to) => (n++ ? { data: null, error: 'boom' } : { data: table(1000), error: null }));
    assert.deepEqual(result, { data: null, error: 'boom' });
});

test('custom page size and a page limit', async () => {
    assert.equal((await fetchAllRows(pager(table(25)), { pageSize: 10 })).data.length, 25);
    assert.equal((await fetchAllRows(pager(table(100)), { pageSize: 10, maxPages: 3 })).data.length, 30);
});
