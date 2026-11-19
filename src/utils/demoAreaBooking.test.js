import test from 'node:test';
import assert from 'node:assert/strict';
import { demoAreaBooking, demoBookingTimes, countDemoBooking } from './demoAreaBooking.js';
const now = Date.parse('2026-11-18T06:00:00Z');
const data = { venueId: 'pilot-a', venueName: 'Pilot venue', area: { venue_id: 'pilot-a', area_id: 'terrace', area_name: 'Terrace' },
  time: demoBookingTimes(now)[0], partySize: 4 };
test('demo confirmation preserves the chosen venue and area without a real booking', () => {
  const result = demoAreaBooking(data, now);
  assert.equal(result.kind, 'demo_booking');
  assert.equal(result.area_id, 'terrace');
  assert.equal(result.area_name, 'Terrace');
  assert.equal(result.party_size, 4);
  assert.equal('contact' in result, false);
});
test('invalid times, mismatched areas and party sizes cannot confirm', () => {
  for (const patch of [{ area: { ...data.area, venue_id: 'other' } }, { time: new Date(now).toISOString() },
    { time: new Date(now + 2 * 86400000).toISOString() }, { partySize: 0 }, { partySize: 13 }, { partySize: 2.5 }])
    assert.equal(demoAreaBooking({ ...data, ...patch }, now), null);
});
test('demo counts use their own device-session namespace', () => {
  const map = new Map([['real-booking-enquiries', '9']]);
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  assert.equal(countDemoBooking(storage), 1);
  assert.equal(countDemoBooking(storage), 2);
  assert.equal(map.get('real-booking-enquiries'), '9');
});
