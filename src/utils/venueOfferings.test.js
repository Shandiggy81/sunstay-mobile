import test from 'node:test';
import assert from 'node:assert/strict';
import { offeringsBesideCafeFacts, venueOfferings } from './venueOfferings.js';

const offerings = venueOfferings({ tags: ['Outdoor Tables', 'Good for groups', 'Beer garden'] });

test('outdoor seating gives way to the café facts\' outdoor tables', () => {
    assert.ok(offerings.some((row) => row.key === 'outdoor seating'));
    const labels = offeringsBesideCafeFacts(offerings, ['outdoor-tables', 'wind-sheltered']).map((row) => row.label);
    assert.equal(labels.includes('Outdoor seating'), false);
    assert.ok(labels.includes('Beer garden') && labels.includes('Good for groups'));
});

test('without outdoor tables in the facts every offering stays', () => {
    assert.deepEqual(offeringsBesideCafeFacts(offerings, []), offerings);
    assert.deepEqual(offeringsBesideCafeFacts(offerings, ['dog-friendly']), offerings);
    assert.deepEqual(offeringsBesideCafeFacts(offerings), offerings);
    assert.equal(offeringsBesideCafeFacts(null, ['outdoor-tables']), null);
});
