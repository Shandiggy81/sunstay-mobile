import test from 'node:test';
import assert from 'node:assert/strict';
import {
    outdoorChips, restorePartnerTools, sanitiseAccess, sanitiseEvent, sanitiseHappyHour, sanitiseOutdoor,
    upcomingPartnerEvents, updatePartnerTools, withPartnerAccess, MAX_EVENTS,
} from './partnerTools.js';

const today = '2026-11-03';

test('happy hour keeps the card shape and drops nonsense', () => {
    assert.deepEqual(sanitiseHappyHour({ days: ['Fri', 'Mon', 'Funday'], start: '16:00', end: '18:00', deal: '  $8 pints  ' }),
        { days: ['Mon', 'Fri'], start: '16:00', end: '18:00', deal: '$8 pints' });
    assert.deepEqual(sanitiseHappyHour({ deal: 'Half-price oysters' }), { days: [], start: null, end: null, deal: 'Half-price oysters' });
    assert.equal(sanitiseHappyHour({ days: ['Mon'], start: '18:00', end: '16:00' }), null, 'end before start, no deal');
    assert.equal(sanitiseHappyHour({ days: ['Mon'], start: '25:00', end: '26:00' }), null);
    assert.equal(sanitiseHappyHour(null), null);
});

test('events: today up to 60 days out, a known kind, a title', () => {
    assert.deepEqual(sanitiseEvent({ id: 'a', title: ' The Tuesday Band ', kind: 'live-music', date: today, start: '19:30' }, today),
        { id: 'a', title: 'The Tuesday Band', kind: 'live-music', date: today, start: '19:30' });
    assert.equal(sanitiseEvent({ kind: 'trivia', date: '2026-11-02', start: '19:00' }, today), null, 'yesterday');
    assert.equal(sanitiseEvent({ kind: 'trivia', date: '2027-02-01', start: '19:00' }, today), null, 'too far ahead');
    assert.equal(sanitiseEvent({ kind: 'karaoke', date: today, start: '20:00' }, today).kind, 'other');
    assert.equal(sanitiseEvent({ kind: 'trivia', date: today, start: '20:00' }, today).title, 'Trivia');
    assert.equal(sanitiseEvent({ kind: 'dj', date: today }, today), null, 'needs a start time');
});

test('access facts follow the database limits', () => {
    assert.deepEqual(sanitiseAccess({ access_step_free_entry: true, access_entry_steps: 999, access_toilet_level: 'upstairs', access_lift: 'yes' }),
        { access_step_free_entry: true, access_entry_steps: null, access_lift: null, access_lift_floors: null, access_accessible_toilet: null, access_toilet_level: 'upstairs', access_toilet_distance_m: null });
    assert.equal(sanitiseAccess({ access_lift: 'maybe' }), null);
    assert.deepEqual(sanitiseOutdoor({ seats: 40, umbrellas: true, heaters: 'on' }), { seats: 40, umbrellas: true, awning: null, retractableRoof: null, heaters: null, dogFriendly: null });
    assert.equal(sanitiseOutdoor({ seats: -1 }), null);
});

test('updates one section at a time and clears empty venues', () => {
    let map = {};
    map = updatePartnerTools(map, 'dv-12', 'happyHour', { days: ['Fri'], start: '16:00', end: '18:00', deal: '$8 pints' }, { today });
    map = updatePartnerTools(map, 'dv-12', 'outdoor', { seats: 60, dogFriendly: true }, { today });
    assert.equal(map['dv-12'].happyHour.deal, '$8 pints');
    assert.equal(map['dv-12'].outdoor.seats, 60);
    map = updatePartnerTools(map, 'dv-12', 'happyHour', null, { today });
    assert.equal(map['dv-12'].happyHour, null);
    map = updatePartnerTools(map, 'dv-12', 'outdoor', null, { today });
    assert.deepEqual(map, {});
    assert.equal(updatePartnerTools(map, 'dv-12', 'secrets', 1, { today }), map, 'unknown sections are ignored');
});

test('storage round trip drops past events and junk', () => {
    const events = Array.from({ length: 14 }, (_, i) => ({ id: `e${i}`, kind: 'dj', date: '2026-11-0' + (3 + (i % 5)), start: '21:00' }));
    const stored = JSON.stringify({ 'dv-1': { events: [{ kind: 'trivia', date: '2026-10-01', start: '19:00' }, ...events] }, 'dv-2': 'bad', 'dv-3': {} });
    const map = restorePartnerTools(stored, today);
    assert.deepEqual(Object.keys(map), ['dv-1']);
    assert.equal(map['dv-1'].events.length, MAX_EVENTS);
    assert.ok(map['dv-1'].events.every(event => event.date >= today));
    assert.deepEqual(restorePartnerTools('not json', today), {});
});

test('card display: access overlay, upcoming events and outdoor chips', () => {
    const venue = { id: 'dv-12', venueName: 'Railway Hotel', access_lift: false };
    const merged = withPartnerAccess(venue, { access: sanitiseAccess({ access_lift: true, access_lift_floors: 'the deck' }), updatedAt: '2026-11-03T00:00:00.000Z' });
    assert.equal(merged.access_lift, true);
    assert.equal(merged.access_source, 'partner_preview');
    assert.equal(withPartnerAccess(venue, null), venue);

    const events = [
        { id: 'a', kind: 'trivia', title: 'Trivia', date: today, start: '12:00' },
        { id: 'b', kind: 'live-music', title: 'The Tuesday Band', date: today, start: '19:30' },
        { id: 'c', kind: 'dj', title: 'DJ Sol', date: '2026-11-04', start: '21:00' },
        { id: 'd', kind: 'comedy', title: 'Open mic', date: '2026-11-06', start: '20:00' },
    ];
    const shown = upcomingPartnerEvents(events, { today, nowMinutes: 14 * 60 });
    assert.deepEqual(shown.map(e => e.when), ['Tonight 7:30pm', 'Tomorrow 9pm', 'Fri 8pm'], 'midday trivia has finished');
    assert.equal(shown[0].icon, 'live-music');

    assert.deepEqual(outdoorChips({ seats: 60, umbrellas: true, retractableRoof: true, dogFriendly: true }).map(c => c.label),
        ['60 outdoor seats', 'Umbrellas', 'Retractable roof', 'Dog friendly']);
    assert.deepEqual(outdoorChips(null), []);
});

test('the clock is Melbourne time', async () => {
    const { partnerClock } = await import('./partnerTools.js');
    assert.deepEqual(partnerClock(new Date('2026-11-03T08:30:00Z')), { today: '2026-11-03', nowMinutes: 19 * 60 + 30 });
    assert.deepEqual(partnerClock(new Date('2026-11-03T13:05:00Z')), { today: '2026-11-04', nowMinutes: 5 });
});
