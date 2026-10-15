import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addressStreet, clueKind, dedupeClueRows, isLaneway, matchExisting, nameSimilarity, parseFloor, streetAxes,
} from './clueImport.js';

test('clueKind keeps food and drink industries only', () => {
    assert.equal(clueKind('Cafes and Restaurants'), 'cafe_restaurant');
    assert.equal(clueKind('Pubs, Taverns and Bars'), 'bar');
    assert.equal(clueKind('Takeaway Food Services'), 'takeaway');
    assert.equal(clueKind('Clothing Retailing'), null);
    assert.equal(clueKind(undefined), null);
});

test('addressStreet finds the street a venue sits on', () => {
    assert.equal(addressStreet('66 Bourke Street MELBOURNE VIC 3000'), 'Bourke Street');
    assert.equal(addressStreet('Ground 361 Little Bourke Street MELBOURNE VIC 3000'), 'Little Bourke Street');
    assert.equal(addressStreet('106-114 Berkeley Street CARLTON VIC 3053'), 'Berkeley Street');
    assert.equal(addressStreet('Basement 20-22 McKillop Street MELBOURNE VIC 3000'), 'Mckillop Street');
    assert.equal(addressStreet('2 Flinders Walk MELBOURNE VIC 3000'), 'Flinders Walk');
    assert.equal(addressStreet('Shop 4, 4 Riverside Quay SOUTHBANK VIC 3006'), 'Riverside Quay');
    assert.equal(addressStreet('125 Flinders Ln, Melbourne'), 'Flinders Lane');
    assert.equal(addressStreet('Federation Square'), null);
});

test('isLaneway spots lanes and places', () => {
    assert.equal(isLaneway('Hardware Lane'), true);
    assert.equal(isLaneway('Centre Place'), true);
    assert.equal(isLaneway('Bourke Street'), false);
    assert.equal(isLaneway(null), false);
});

test('parseFloor reads levels and rooftops from the address', () => {
    assert.deepEqual(parseFloor('66 Bourke Street MELBOURNE'), { floor: 0, rooftop: false });
    assert.deepEqual(parseFloor('Tenancy 29, Level 2 2 Swanston Street'), { floor: 2, rooftop: false });
    assert.deepEqual(parseFloor('Tenancy 17 & 23, Lvls 1-2 Atrium Federation Square'), { floor: 2, rooftop: false });
    assert.deepEqual(parseFloor('Rooftop, 252 Swanston Street'), { floor: 0, rooftop: true });
    assert.deepEqual(parseFloor('Basement 20-22 McKillop Street'), { floor: 0, rooftop: false });
});

test('nameSimilarity ignores filler words and case', () => {
    assert.equal(nameSimilarity('Chin Chin Restaurant', 'Chin Chin'), 1);
    assert.equal(nameSimilarity('Arbory Bar and Eatery / Afloat', 'Arbory Afloat'), 1);
    assert.equal(nameSimilarity('Mr Tulk Cafe', 'Mr Tulk'), 1);
    assert.ok(nameSimilarity('Garden State Hotel', 'State Library Cafe') < 0.6, 'one shared word is not a match');
    assert.equal(nameSimilarity('', 'x'), 0);
});

test('dedupeClueRows merges seating rows and skips other industries', () => {
    const row = (o) => ({ trading_name: 'Seven Seeds', business_address: '114 Berkeley Street CARLTON', industry_anzsic4_description: 'Cafes and Restaurants', property_id: 1, latitude: -37.80, longitude: 144.95, number_of_seats: 10, census_year: '2024', ...o });
    const { candidates, skipped } = dedupeClueRows([
        row(), row({ number_of_seats: 6 }), row({ property_id: 2 }),
        row({ industry_anzsic4_description: 'Clothing Retailing' }), row({ latitude: null }),
    ]);
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].outdoor_seats, 16);
    assert.equal(candidates[0].street, 'Berkeley Street');
    assert.equal(candidates[0].census_year, 2024);
    assert.deepEqual(skipped, { 'Clothing Retailing': 1, no_name_or_location: 1 });
});

test('matchExisting needs both a name match and proximity', () => {
    const existing = [{ id: 'dv-22', name: 'Arbory Afloat', lat: -37.819, lng: 144.965 }, { id: 'dv-13', name: 'Chin Chin', lat: -37.81561, lng: 144.97038 }];
    assert.equal(matchExisting({ name: 'Arbory Bar and Eatery / Afloat', lat: -37.81866, lng: 144.96547 }, existing)?.id, 'dv-22');
    assert.equal(matchExisting({ name: 'Chin Chin Restaurant', lat: -37.81566, lng: 144.97040 }, existing)?.id, 'dv-13');
    assert.equal(matchExisting({ name: 'Chin Chin Restaurant', lat: -37.80, lng: 144.97040 }, existing), null, 'too far');
    assert.equal(matchExisting({ name: 'Brother Baba Budan', lat: -37.81561, lng: 144.97038 }, existing), null, 'different name');
    assert.equal(matchExisting({ name: 'State Library Cafe', lat: -37.81561, lng: 144.97038 }, [{ id: 'g', name: 'Garden State Hotel', lat: -37.81561, lng: 144.97038 }]), null, 'one shared word');
});

test('streetAxes recovers a street direction from venue points along it', () => {
    // Points along a line at bearing 70° (the CBD's east-west streets).
    const pts = Array.from({ length: 6 }, (_, i) => {
        const d = i * 40, b = 70 * Math.PI / 180;
        return { street: 'Bourke Street', lat: -37.813 + (d * Math.cos(b)) / 111320, lng: 144.96 + (d * Math.sin(b)) / (111320 * Math.cos(-37.813 * Math.PI / 180)) };
    });
    const axis = streetAxes(pts).get('bourke street');
    assert.ok(Math.abs(axis.bearing - 70) < 1, String(axis.bearing));
    assert.equal(axis.points, 6);
    assert.equal(streetAxes(pts.slice(0, 2)).size, 0, 'too few points');
    assert.equal(streetAxes([{ street: null, lat: 0, lng: 0 }]).size, 0);
});

test('streetAxes ignores short or blobby runs of points', () => {
    const at = (dx, dy) => ({ street: 'Russell Street', lat: -37.813 + dy / 111320, lng: 144.96 + dx / (111320 * Math.cos(-37.813 * Math.PI / 180)) });
    // four points over ~30 m on one block, not a line
    assert.equal(streetAxes([at(0, 0), at(20, 5), at(5, 20), at(25, 25)]).size, 0);
    // a clear 120 m line is kept
    assert.equal(streetAxes([at(0, 0), at(40, 2), at(80, -1), at(120, 1)]).size, 1);
});
