import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPilotDatabase } from '../../scripts/venue-pilot/database.mjs';

test('proposed publishing SQL: real PostgreSQL permission, privacy and lifetime boundary', {
  skip: !process.env.PGLITE_MODULE && 'Optional isolated PostgreSQL runtime: set PGLITE_MODULE',
}, async t => {
  const fixture = await createPilotDatabase();
  const { db, ids, as, rpc, publish } = fixture;
  t.after(() => fixture.close());
  const count = async () => (await db.query('select count(*)::int as n from private.venue_area_heater_reports')).rows[0].n;
  await t.test('signed-out, guest, other manager and mismatched area cannot write', async () => {
    for (const [actor, args] of [[null, publish()], [ids.guest, publish()],
      [ids.otherManager, publish()], [ids.manager, publish({ p_area_id: ids.otherArea })]]) {
      const before = await count();
      await assert.rejects(rpc('publish_venue_area_heaters', args, actor));
      assert.equal(await count(), before);
    }
  });
  await t.test('private tables, direct mutations and identity sequence are denied', async () => {
    for (const actor of [null, ids.guest, ids.manager]) {
      for (const table of ['venue_pilot_managers', 'venue_guest_areas', 'venue_area_heater_reports']) {
        await assert.rejects(as(actor, tx => tx.query(`select * from private.${table}`)));
      }
      await assert.rejects(as(actor, tx => tx.query("select nextval('private.venue_area_heater_reports_revision_seq')")));
      await assert.rejects(as(actor, tx => tx.query("update public.venues set access_details = 'changed'")));
    }
  });
  let first;
  await t.test('authorised publish has server timestamps, public projection and idempotent retries', async () => {
    const args = publish();
    first = await rpc('publish_venue_area_heaters', args, ids.manager);
    assert.equal(first.area_name, 'Terrace');
    assert.equal(first.source, 'venue_staff');
    assert.equal(Date.parse(first.expires_at) - Date.parse(first.updated_at), 120 * 60_000);
    assert.deepEqual(await rpc('publish_venue_area_heaters', args, ids.manager), first);
    assert.equal(await count(), 1);
    await assert.rejects(rpc('publish_venue_area_heaters', { ...args, p_heaters_on: false }, ids.manager));
    const rows = await rpc('get_venue_area_heaters');
    assert.deepEqual(rows, [first]);
    assert.equal('publisher_id' in rows[0], false);
    assert.equal('request_id' in rows[0], false);
    assert.equal('verified_via' in rows[0], false);
  });
  await t.test('invalid payloads leave persistence unchanged', async () => {
    for (const patch of [{ p_heaters_on: null }, { p_valid_for_minutes: -1 },
      { p_valid_for_minutes: 31 }, { p_valid_for_minutes: 241 }, { p_request_id: null }]) {
      const before = await count();
      await assert.rejects(rpc('publish_venue_area_heaters', publish(patch), ids.manager));
      assert.equal(await count(), before);
    }
  });
  await t.test('area names and lifetimes are constrained at the persistence boundary', async () => {
    for (const name of ['', ' ', 'x'.repeat(81), ' '.repeat(81) + 'Terrace']) {
      await assert.rejects(db.query(`insert into private.venue_guest_areas
        (venue_id, name, kind) values ('dv-20', $1, 'terrace')`, [name]), { code: '23514' });
    }
    await assert.rejects(db.query(`update private.venue_area_heater_reports
      set expires_at = updated_at + interval '5 hours' where id = $1`, [first.report_id]), { code: '23514' });
  });
  await t.test('drafts and hidden areas remain private; a newer draft does not hide published truth', async () => {
    await db.query(`insert into private.venue_area_heater_reports
      (venue_id, area_id, publisher_id, request_id, heaters_on, publication_state, valid_for_minutes, updated_at, expires_at)
      values ('dv-20', $1, $2, $3, false, 'draft', 30, now(), now() + interval '30 minutes')`,
    [ids.terrace, ids.manager, randomUUID()]);
    assert.deepEqual(await rpc('get_venue_area_heaters'), [first]);
    await db.query('update private.venue_guest_areas set public_visible = false where id = $1', [ids.terrace]);
    assert.deepEqual(await rpc('get_venue_area_heaters'), []);
    assert.equal((await rpc('get_venue_guest_areas', { p_venue_id: 'dv-20' })).length, 1);
    await db.query('update private.venue_guest_areas set public_visible = true where id = $1', [ids.terrace]);
  });
  await t.test('expired newer off report cannot resurrect an older on report', async () => {
    const off = await rpc('publish_venue_area_heaters', publish({ p_heaters_on: false, p_valid_for_minutes: 30 }), ids.manager);
    await db.query(`update private.venue_area_heater_reports set updated_at = now() - interval '31 minutes',
      expires_at = now() - interval '1 minute' where id = $1`, [off.report_id]);
    assert.deepEqual(await rpc('get_venue_area_heaters'), []);
  });
  await t.test('revocation blocks writes and removes current publications; permanent facts unchanged', async () => {
    await rpc('publish_venue_area_heaters', publish(), ids.manager);
    await db.query('update private.venue_pilot_managers set active = false where user_id = $1', [ids.manager]);
    assert.deepEqual(await rpc('get_venue_area_heaters'), []);
    await assert.rejects(rpc('get_managed_venue_areas', { p_venue_id: 'dv-20' }, ids.manager));
    await assert.rejects(rpc('publish_venue_area_heaters', publish(), ids.manager));
    assert.equal((await db.query("select access_details from public.venues where id = 'dv-20'")).rows[0].access_details,
      'Permanent step-free entry instructions');
    await db.query('update private.venue_pilot_managers set active = true where user_id = $1', [ids.manager]);
  });
  await t.test('bounded rate limit rejects the next new request but permits a confirmed retry', async () => {
    const args = publish();
    const saved = await rpc('publish_venue_area_heaters', args, ids.manager);
    while ((await db.query("select count(*)::int as n from private.venue_area_heater_reports where updated_at > now() - interval '1 minute'")).rows[0].n < 12) {
      await rpc('publish_venue_area_heaters', publish(), ids.manager);
    }
    await assert.rejects(rpc('publish_venue_area_heaters', publish({ p_area_id: ids.courtyard }), ids.manager), { code: '54000' });
    assert.deepEqual(await rpc('publish_venue_area_heaters', args, ids.manager), saved);
  });
});
