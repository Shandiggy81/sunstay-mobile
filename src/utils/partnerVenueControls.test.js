import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTNER_SUN_HINT, partnerOutdoorSpace, partnerStatusGroups, partnerSunHint, partnerTagSuggestions, partnerTagIcon } from './partnerVenueControls.js';
const pub = { typeCategory: 'Bar', typeLabel: 'Pub & Beer Garden', tags: ['Beer Garden'] };
const stay = { typeCategory: 'Serviced apartment', roomTypes: [{ source: 'estimated', orientation: 'W' }] };
test('outdoor food venues have existing preview keys and the heater artwork', () => {
    const controls = partnerStatusGroups(pub).flatMap(group => group.controls);
    assert.deepEqual(controls.map(c => c.key), ['sunshineNow', 'hasUmbrellas', 'hasWindProtection', 'heatersOn', 'fireplaceOn']);
    assert.equal(controls.find(c => c.key === 'heatersOn').icon, 'heater');
});
test('facade estimates do not invent balconies or food venue controls for stays', () => {
    assert.equal(partnerOutdoorSpace(stay), null);
    assert.deepEqual(partnerStatusGroups(stay), []);
    const balcony = { ...stay, roomTypes: [{ hasBalcony: true }] };
    assert.deepEqual(partnerStatusGroups(balcony).flatMap(g => g.controls).map(c => c.key), ['sunshineNow']);
    assert.ok(!partnerStatusGroups({ ...stay, hasPool: true, hasHeaters: true }).flatMap(g => g.controls).some(c => c.key === 'fireplaceOn'));
});
test('indoor-only venues have no outdoor toggles and stay tags omit bar suggestions', () => {
    assert.deepEqual(partnerStatusGroups({ typeLabel: 'Cafe', tags: ['Indoor only'] }).map(g => g.label), ['Warmth']);
    assert.ok(!partnerTagSuggestions(stay).some(t => /screens|cocktails|late night|firepit/i.test(t)));
    assert.equal(partnerTagIcon('Heaters'), 'heater');
});

test('communal pool and terrace never borrow room facade geometry', () => {
    const room = { name: 'West room', orientation: 'W', hasBalcony: true };
    for (const space of [{ hasPool: true }, { hasTerrace: true }]) {
        const area = partnerOutdoorSpace({ ...stay, ...space, roomTypes: [room] });
        assert.equal(area.communal, true);
        assert.equal(area.room, undefined);
    }
    const outdoor = partnerOutdoorSpace({ ...stay, roomTypes: [{ hasOutdoorArea: true }] });
    assert.equal(outdoor.label, 'outdoor area');
});

const unionHotel = { id: 'union-hotel', typeCategory: 'Bar', typeLabel: 'Pub & Restaurant',
    tags: ['live-music', 'food-available'], heating: 'traditional-fireplace' };
const controlsOf = (venue, previewTags) => partnerStatusGroups(venue, previewTags).flatMap(group => group.controls);

test('a pub with no outdoor tags still gets Warmth with "Fireplace lit"', () => {
    const groups = partnerStatusGroups(unionHotel);
    assert.deepEqual(groups.map(g => g.label), ['Warmth']);
    assert.deepEqual(groups[0].controls.map(c => [c.key, c.label]), [['heatersOn', 'Heaters on'], ['fireplaceOn', 'Fireplace lit']]);
    assert.equal(groups[0].controls[1].icon, 'fireplace');
});

test('no outdoor space gives no Sun & shade, and a hint in its place', () => {
    assert.equal(partnerOutdoorSpace(unionHotel), null);
    assert.ok(!controlsOf(unionHotel).some(c => ['sunshineNow', 'hasUmbrellas', 'hasWindProtection'].includes(c.key)));
    assert.equal(partnerSunHint(unionHotel), PARTNER_SUN_HINT);
    assert.equal(partnerSunHint(pub), null);
});

test('previewed "Beer Garden" adds Sun & shade without changing the venue', () => {
    const previewed = [...unionHotel.tags, 'Beer Garden'];
    assert.equal(partnerOutdoorSpace(unionHotel, previewed).label, 'beer garden');
    const groups = partnerStatusGroups(unionHotel, previewed);
    assert.deepEqual(groups.map(g => g.label), ['Sun & shade', 'Warmth']);
    assert.equal(groups[0].controls[0].label, 'Sun on the beer garden');
    // The heating field names a fireplace, so it stays a fireplace even with a beer garden.
    assert.equal(groups[1].controls.find(c => c.key === 'fireplaceOn').label, 'Fireplace lit');
    assert.equal(partnerSunHint(unionHotel, previewed), null);
    assert.deepEqual(unionHotel.tags, ['live-music', 'food-available']);
    // Previewing fewer tags takes the outdoor space away again.
    const gardenPub = { ...pub, typeLabel: 'Pub' };
    assert.equal(partnerOutdoorSpace(gardenPub).label, 'beer garden');
    assert.equal(partnerOutdoorSpace(gardenPub, []), null);
});

test('an outdoor fire is a fire pit only when there is an outdoor space and no fireplace', () => {
    assert.equal(controlsOf(pub).find(c => c.key === 'fireplaceOn').label, 'Fire pit lit');
    assert.equal(controlsOf({ ...pub, heating: 'Gas fireplace' }).find(c => c.key === 'fireplaceOn').label, 'Fireplace lit');
    assert.equal(controlsOf({ ...pub, typeLabel: 'Pub', tags: [] }).find(c => c.key === 'fireplaceOn').label, 'Fireplace lit');
});

test('stays are unchanged: no outdoor space means no switches, and never a fireplace', () => {
    assert.deepEqual(partnerStatusGroups(stay), []);
    assert.deepEqual(partnerStatusGroups(stay, ['Heaters']), []);
    assert.equal(partnerSunHint(stay), null);
    assert.deepEqual(controlsOf({ ...stay, hasTerrace: true }).map(c => c.key), ['sunshineNow', 'hasUmbrellas', 'hasWindProtection']);
    assert.deepEqual(controlsOf({ ...stay, hasTerrace: true }, ['Heaters']).map(c => c.key), ['sunshineNow', 'hasUmbrellas', 'hasWindProtection', 'heatersOn']);
    assert.deepEqual(controlsOf(stay, ['Balcony']).map(c => c.key), ['sunshineNow']);
});

test('a café with heaters gets the heater switch and an indoor fireplace', () => {
    const cafe = { typeCategory: 'Bar', typeLabel: 'Cafe', tags: ['Heaters'] };
    assert.deepEqual(partnerStatusGroups(cafe).map(g => g.label), ['Warmth']);
    assert.deepEqual(controlsOf(cafe).map(c => [c.key, c.label, c.icon]),
        [['heatersOn', 'Heaters on', 'heater'], ['fireplaceOn', 'Fireplace lit', 'fireplace']]);
    assert.equal(partnerSunHint(cafe), PARTNER_SUN_HINT);
    assert.deepEqual(controlsOf(cafe, ['Heaters', 'Sunny Terrace']).map(c => c.key),
        ['sunshineNow', 'hasUmbrellas', 'hasWindProtection', 'heatersOn', 'fireplaceOn']);
});

test('non-food, non-stay venues still get no switches', () => {
    assert.deepEqual(partnerStatusGroups({ typeCategory: 'Bar', typeLabel: 'Gallery' }), []);
    assert.equal(partnerSunHint({ typeCategory: 'Bar', typeLabel: 'Gallery' }), null);
});
