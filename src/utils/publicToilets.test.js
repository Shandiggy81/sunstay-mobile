import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nearestAccessibleToilet, publicToiletHours, publicToiletLine, PUBLIC_TOILET_CREDIT } from './publicToilets.js';
import { parseCsv } from './csv.js';

const rows = [
    ['a', 'Far Park', -37.8100, 144.9700, 0, '24 hours'],
    ['b', 'Near Mall', -37.84650, 144.98994, 1 | 2, '9am-5pm'],
    ['c', 'Nearer Lane', -37.84630, 144.98994, 4, 'Daylight hours'],
];
const venue = { lat: -37.84614, lng: 144.98994 };

test('nearest accessible toilet within 500 m, with its facilities', () => {
    const t = nearestAccessibleToilet(venue, rows);
    assert.equal(t.id, 'c');
    assert.equal(t.name, 'Nearer Lane');
    assert.ok(t.metres > 15 && t.metres < 20, `${t.metres}`);
    assert.deepEqual([t.keyRequired, t.changingPlaces, t.babyChange, t.paid], [false, false, true, false]);
    assert.equal(t.url, 'https://toiletmap.gov.au/facility/c');
    assert.equal(nearestAccessibleToilet(venue, [rows[0]]), null, 'more than 500 m away');
    assert.equal(nearestAccessibleToilet({ lat: null, lng: 1 }, rows), null);
    assert.equal(nearestAccessibleToilet(venue, null), null);
});

test('line rounds for walking and names the key and Changing Places', () => {
    assert.equal(publicToiletLine(null), null);
    assert.equal(publicToiletLine({ metres: 17 }), 'Accessible public toilet about 20\u00a0m away');
    assert.equal(publicToiletLine({ metres: 4 }), 'Accessible public toilet about 10\u00a0m away');
    assert.equal(publicToiletLine({ metres: 128, keyRequired: true, changingPlaces: true }),
        'Accessible public toilet about 150\u00a0m away · MLAK key · Changing Places');
    assert.equal(publicToiletLine({ metres: 310, paid: true }), 'Accessible public toilet about 300\u00a0m away · paid');
    assert.match(PUBLIC_TOILET_CREDIT, /CC BY 3\.0 AU/);
});

test('the shipped data is well formed and inside greater Melbourne', () => {
    const data = JSON.parse(readFileSync(new URL('../data/publicAccessibleToilets.json', import.meta.url), 'utf8'));
    assert.ok(data.length > 1000, `${data.length} rows`);
    for (const [id, name, lat, lng, flags, hours] of data) {
        assert.equal(typeof id, 'string'); assert.ok(name);
        assert.ok(lat > -38.2 && lat < -37.5 && lng > 144.5 && lng < 145.5, `${id} out of bounds`);
        assert.ok(Number.isInteger(flags) && flags >= 0 && flags < 16); assert.equal(typeof hours, 'string');
    }
});

test('CSV parser handles quotes, commas, doubled quotes and CRLF', () => {
    const csv = 'a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line\nbreak",\n';
    assert.deepEqual(parseCsv(csv), [
        { a: '1', b: 'x, y', c: 'say "hi"' },
        { a: '2', b: 'line\nbreak', c: '' },
    ]);
});

test('hours read naturally', () => {
    assert.equal(publicToiletHours('Variable hours'), 'Hours vary');
    assert.equal(publicToiletHours('24 hours'), 'Open 24 hours');
    assert.equal(publicToiletHours('9am-5pm'), 'Hours: 9am-5pm');
    assert.equal(publicToiletHours(''), null);
    assert.equal(publicToiletHours(undefined), null);
});
