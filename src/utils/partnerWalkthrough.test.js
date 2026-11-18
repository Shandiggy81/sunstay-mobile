import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoVenues } from '../data/demoVenues.js';
import { venueOfferings } from './venueOfferings.js';
import {
    HEATING_CHOICES, heatingConflict, offeringChanges, partnerDraftFor, resolveHeating,
    restorePartnerDrafts, updatePartnerDraft, venueWithHeating,
} from './partnerWalkthrough.js';

const tulk = demoVenues.find(venue => venue.id === 'dv-20');
const labels = venue => venueOfferings(venue).map(row => row.label);

test('the demo Mr Tulk listing is the walkthrough example: Heaters tag, indoor-only heating', () => {
    assert.equal(tulk.venueName, 'Mr Tulk');
    const conflict = heatingConflict(tulk);
    assert.equal(conflict.tag, 'Heaters');
    assert.equal(conflict.record, 'indoor only');
    assert.equal(conflict.summary, 'Your tags include “Heaters”, so guests are told Mr Tulk has outdoor heaters. Your heating record says “indoor only”.');
    assert.match(conflict.risk, /warm table outside/);
});

test('no conflict when the tag and the record agree, or there is no heater tag', () => {
    assert.equal(heatingConflict({ tags: ['Heaters'], heating: 'heated outdoor' }), null);
    assert.equal(heatingConflict({ tags: ['Cozy'], heating: 'indoor only' }), null);
    assert.equal(heatingConflict({ tags: ['Heaters'] }), null);
    assert.equal(heatingConflict(null), null);
    assert.equal(heatingConflict({ venueName: 'Cold Bar', tags: ['heated-outdoor'], heating: 'No heating' }).record, 'No heating');
});

test('each answer resolves the tags and heating record the guest card reads', () => {
    assert.deepEqual(HEATING_CHOICES.map(choice => choice.id), ['outdoor', 'indoor', 'unsure']);
    const withoutHeaters = ['Specialty Coffee', 'Cozy', 'Sunny', 'Wheelchair Accessible', 'Indoor Warmth'];
    assert.deepEqual(resolveHeating(tulk, 'indoor'), { tags: withoutHeaters, heating: 'indoor only' });
    assert.deepEqual(resolveHeating(tulk, 'outdoor'), { tags: tulk.tags, heating: 'heated outdoor' });
    assert.deepEqual(resolveHeating(tulk, 'unsure'), { tags: withoutHeaters, heating: 'indoor only' });
    assert.deepEqual(resolveHeating({ tags: ['Heaters'], heating: 'no heating' }, 'indoor').tags, ['Indoor Warmth']);
    assert.deepEqual(resolveHeating({ tags: [], heating: 'indoor only' }, 'outdoor').tags, ['Heaters']);
    assert.deepEqual(resolveHeating(tulk, 'bogus'), { tags: tulk.tags, heating: 'indoor only' });
});

test('the guest card follows the answer straight away', () => {
    assert.ok(labels(tulk).includes('Outdoor heaters') && labels(tulk).includes('Warm indoor space'));
    const indoor = venueWithHeating(tulk, 'indoor');
    assert.ok(!labels(indoor).includes('Outdoor heaters'));
    assert.deepEqual(offeringChanges(tulk, indoor), { added: [], removed: ['Outdoor heaters'] });
    assert.deepEqual(offeringChanges(tulk, venueWithHeating(tulk, 'outdoor')), { added: [], removed: [] });
    const cold = { tags: ['Heaters'], heating: 'no heating' };
    assert.deepEqual(offeringChanges(cold, venueWithHeating(cold, 'indoor')), { added: ['Warm indoor space'], removed: ['Outdoor heaters'] });
    assert.equal(venueWithHeating(tulk, null), tulk);
});

test('the answer round-trips through storage; bad storage never throws', () => {
    const map = updatePartnerDraft({}, 'dv-20', 'indoor', { now: new Date('2026-11-18T01:00:00Z') });
    assert.equal(partnerDraftFor(map, 'dv-20'), 'indoor');
    assert.equal(partnerDraftFor(restorePartnerDrafts(JSON.stringify(map)), 'dv-20'), 'indoor');
    assert.deepEqual(updatePartnerDraft(map, 'dv-20', null), {});
    assert.deepEqual(restorePartnerDrafts('not json'), {});
    assert.deepEqual(restorePartnerDrafts('[1,2]'), {});
    assert.deepEqual(restorePartnerDrafts(JSON.stringify({ a: { heating: 'lava' }, b: 7 })), {});
    assert.equal(partnerDraftFor({}, null), null);
    assert.deepEqual(updatePartnerDraft({ keep: 1 }, null, 'indoor'), { keep: 1 });
});
