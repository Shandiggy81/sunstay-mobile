import test from 'node:test';
import assert from 'node:assert/strict';
import { currentAreaReport, currentAreaReports, guestArea, reportFeatures, areaReportNote, areaReportPinLabel, reportTime } from './venueAreaReports.js';
import { venuePublishing } from './venuePublishing.js';
import { liveWarmth, liveWarmthNote } from './venueFeaturePin.js';

const now = Date.parse('2026-11-18T06:00:00Z');
const areaId = '00000000-0000-4000-8000-000000000001';
const report = (patch = {}) => ({ venue_id: 'pilot-a', area_id: areaId, area_name: 'Terrace', area_kind: 'terrace',
  report_id: '00000000-0000-4000-8000-000000000002', heaters_on: true, source: 'venue_staff',
  updated_at: new Date(now - 60000).toISOString(), expires_at: new Date(now + 3600000).toISOString(), ...patch });

test('public report projection strips identity and internal fields', () => {
  const clean = currentAreaReport(report({ publisher_id: 'private', email: 'private', publication_state: 'published' }), now);
  assert.deepEqual(Object.keys(clean).sort(), ['area_id', 'area_kind', 'area_name', 'expires_at', 'heaters_on',
    'report_id', 'source', 'updated_at', 'venue_id'].sort());
  assert.equal(clean.area_name, 'Terrace');
});

test('expiry is exclusive and malformed or unsupported reports fail closed', () => {
  for (const patch of [{ expires_at: new Date(now).toISOString() }, { heaters_on: null }, { heaters_on: 'true' },
    { source: 'forecast' }, { publication_state: 'draft' }, { area_name: '' }, { area_name: 'a'.repeat(81) }, { updated_at: 'bad' },
    { area_id: 'not-an-area' }, { expires_at: new Date(now + 5 * 3600000).toISOString() },
    { updated_at: new Date(now + 120000).toISOString() }]) assert.equal(currentAreaReport(report(patch), now), null);
  assert.equal(currentAreaReport(report({ heaters_on: false }), now).heaters_on, false);
  assert.equal(guestArea(report(), 'another-venue'), null);
});

test('duplicate areas and expired reports never extend the public list', () => {
  assert.equal(currentAreaReports([report(), report()], now).length, 1);
  assert.deepEqual(currentAreaReports([report()], now + 3600000), []);
  assert.deepEqual(currentAreaReports(null, now), []);
});

test('only the named reported area supplies the published warmth feature', () => {
  const preview = { 'pilot-a': { fireplaceOn: true }, other: { heatersOn: true } };
  const features = reportFeatures(preview, [report()], now);
  assert.equal(features['pilot-a'].heatersOn, true);
  assert.equal(features['pilot-a'].fireplaceOn, false);
  assert.equal(areaReportNote(features['pilot-a'], now), 'Terrace: heaters on');
  assert.equal(areaReportNote(features['pilot-a'], now + 3600000), null);
  assert.match(areaReportPinLabel('Pilot venue', features['pilot-a'], { now }), /Terrace: heaters on, venue staff, updated/);
  assert.equal(areaReportPinLabel('Pilot venue', features['pilot-a'], { now: now + 3600000 }), null);
  assert.equal(features.other.heatersOn, true);
  assert.deepEqual(preview['pilot-a'], { fireplaceOn: true });
});

test('expired or off published warmth never falls back to a raw whole-venue on flag', () => {
  const features = { heatersOn: true, fireplaceOn: true, publishedReports: [report()] };
  assert.deepEqual(liveWarmth(features, now), { heatersOn: true, fireplaceOn: false });
  assert.deepEqual(liveWarmth(features, now + 3600000), { heatersOn: false, fireplaceOn: false });
  assert.equal(liveWarmthNote(features, { now: now + 3600000 }), null);
  assert.deepEqual(liveWarmth({ ...features, publishedReports: [report({ heaters_on: false })] }, now),
    { heatersOn: false, fireplaceOn: false });
});

test('public timestamp uses explicit venue-local times rather than a relative live claim', () => {
  assert.match(reportTime(report()), /Updated 4:59\s*pm .*until 6:00\s*pm/i);
  assert.equal(reportTime({}), null);
});

function client(result) {
  const calls = [];
  return { calls, rpc(name, args) { calls.push({ name, args }); return { abortSignal: async () => result }; } };
}

test('publishing sends no caller identity, forecast request or arbitrary extra field', async () => {
  const saved = report({ updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString() });
  const db = client({ data: saved, error: null });
  const result = await venuePublishing(db).publish({ venueId: 'pilot-a', areaId, heatersOn: true, minutes: 60,
    requestId: 'request', userId: 'forged', source: 'forecast' });
  assert.equal(result.area_id, areaId);
  assert.deepEqual(db.calls, [{ name: 'publish_venue_area_heaters', args: { p_venue_id: 'pilot-a', p_area_id: areaId,
    p_heaters_on: true, p_valid_for_minutes: 60, p_request_id: 'request' } }]);
});

test('denied and unconfirmed saves never return success or leak server details', async () => {
  const draft = { venueId: 'pilot-a', areaId, heatersOn: true, minutes: 60, requestId: 'request' };
  await assert.rejects(venuePublishing(client({ error: { code: '42501', message: 'private account detail' } })).publish(draft),
    error => error.code === 'not_authorized' && !error.message.includes('private'));
  await assert.rejects(venuePublishing(client({ data: null, error: null })).publish(draft), /save_unconfirmed/);
  await assert.rejects(venuePublishing(null).publish(draft), /unavailable/);
  await assert.rejects(venuePublishing(client({ error: { code: '54000' } })).publish(draft), /rate_limited/);
  await assert.rejects(venuePublishing(client({ error: { code: 'PGRST202' } })).publish(draft), /unavailable/);
});

test('guest areas are bounded and cannot borrow another venue area or private fields', async () => {
  const api = venuePublishing(client({ data: [report({ internal_note: 'private' }), report({ venue_id: 'other' })] }));
  const areas = await api.areas('pilot-a');
  assert.equal(areas.length, 1);
  assert.deepEqual(Object.keys(areas[0]).sort(), ['area_id', 'area_kind', 'area_name', 'venue_id']);
  assert.equal((await venuePublishing(client({ data: Array(25).fill(report()) })).areas('pilot-a')).length, 20);
});
