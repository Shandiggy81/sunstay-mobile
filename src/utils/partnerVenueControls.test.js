import test from 'node:test';
import assert from 'node:assert/strict';
import { partnerOutdoorSpace, partnerStatusGroups, partnerTagSuggestions, partnerTagIcon } from './partnerVenueControls.js';
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
    assert.deepEqual(partnerStatusGroups({ typeLabel: 'Cafe', tags: ['Indoor only'] }), []);
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
