import test from 'node:test';
import assert from 'node:assert/strict';
import { readVenueLinkId, resolveVenueLink, venueLinkUrl, venueShareMessage, venueShareUrl, venueUrlChange } from './venueLink.js';

const BASE = 'https://sunstayglobal30.netlify.app/';

test('reads and writes ?venue without touching other state', () => {
    assert.equal(readVenueLinkId('?venue=dv-01'), 'dv-01');
    assert.equal(readVenueLinkId('?venue=%20dv-01%20&report=x'), 'dv-01');
    assert.equal(readVenueLinkId(''), null);
    assert.equal(readVenueLinkId('?venue='), null);
    assert.equal(venueLinkUrl(`${BASE}?report=h1`, 'dv-01'), `${BASE}?report=h1&venue=dv-01`);
    assert.equal(venueLinkUrl(`${BASE}?report=h1&venue=dv-01`, null), `${BASE}?report=h1`);
    assert.equal(venueLinkUrl(`${BASE}?venue=dv-01`, null), BASE);
});

test('share link is clean and names the venue', () => {
    assert.equal(venueShareUrl(`${BASE}?report=h1&venue=x#map`, 'the osborne'), `${BASE}?venue=the%20osborne`);
    assert.equal(venueShareUrl('https://deploy-preview-9--sunstayglobal30.netlify.app/', 'dv-01'), 'https://deploy-preview-9--sunstayglobal30.netlify.app/?venue=dv-01');
    assert.deepEqual(venueShareMessage({ venueName: 'Wonderland Bar' }), { title: 'Wonderland Bar on SunStay', text: "Sun, weather and what's on at Wonderland Bar" });
    assert.equal(venueShareMessage({}).title, 'this spot on SunStay');
});

test('a link waits for the live list, then opens or is dropped', () => {
    const venues = [{ id: 'dv-01' }, { id: 7 }];
    assert.deepEqual(resolveVenueLink({ id: null, venues }), { status: 'none', venue: null });
    assert.equal(resolveVenueLink({ id: 'dv-01', venues, loading: false, lookupStarted: false }).status, 'pending');
    assert.equal(resolveVenueLink({ id: 'dv-01', venues, loading: true, lookupStarted: true }).status, 'pending');
    assert.deepEqual(resolveVenueLink({ id: 'dv-01', venues, loading: false, lookupStarted: true }), { status: 'found', venue: venues[0] });
    assert.equal(resolveVenueLink({ id: '7', venues, loading: false, lookupStarted: true }).venue, venues[1]);
    assert.equal(resolveVenueLink({ id: 'gone', venues, loading: false, lookupStarted: true }).status, 'missing');
});

test('the address bar follows the card, and back closes it', () => {
    assert.deepEqual(venueUrlChange({ href: BASE, openId: 'dv-01' }), { action: 'push', url: `${BASE}?venue=dv-01` });
    assert.deepEqual(venueUrlChange({ href: `${BASE}?venue=dv-01`, openId: 'dv-12' }), { action: 'replace', url: `${BASE}?venue=dv-12` });
    assert.equal(venueUrlChange({ href: `${BASE}?venue=dv-01`, openId: 'dv-01' }), null);
    assert.deepEqual(venueUrlChange({ href: `${BASE}?venue=dv-01`, openId: null, cardEntry: true }), { action: 'back' });
    assert.deepEqual(venueUrlChange({ href: `${BASE}?venue=dv-01`, openId: null, cardEntry: false }), { action: 'replace', url: BASE });
    assert.equal(venueUrlChange({ href: BASE, openId: null }), null);
});
