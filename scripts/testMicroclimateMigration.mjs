/** Isolated, in-memory PostgreSQL test. NEVER connects to a Supabase project.
 * Install @electric-sql/pglite outside the repo and pass its module file URL as
 * PGLITE_MODULE, or resolve it from an existing local installation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/20261117140000_microclimate_weather_bulk_v1.sql', import.meta.url), 'utf8');
const original = await readFile(new URL('../supabase/migrations/20260917092106_venues_in_bbox.sql', import.meta.url), 'utf8');
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  -- Reproduce Supabase defaults to catch incomplete PUBLIC-only revocation.
  alter default privileges grant execute on functions to anon, authenticated;
  create table public.venues(id text primary key);
`);
await db.exec(original.slice(original.indexOf('create table if not exists public.microclimate_profiles ('), original.indexOf('-- ------------------------------------------------------------\n-- 3.')));
await db.exec(original.slice(original.indexOf('create or replace function public.apply_microclimate_weather(')));
await db.exec("insert into public.venues values ('a'),('b'); insert into public.microclimate_profiles(venue_id, sun_score_annual, canyon_aspect_hw) values ('a',.7,1.3),('b',.8,1.4)");
const legacyDefinition = await db.query("select pg_get_functiondef('public.apply_microclimate_weather(text,real,real,real,real,real,real,text,integer)'::regprocedure) as definition");
// Only the ephemeral in-memory fixture receives the migration.
await db.exec(migration);
const row = id => ({ venue_id: id, wind_speed_10m: 0, wind_direction_deg: 0,
  cloud_cover_pct: 0, effective_sun: .6, effective_wind: 0,
  wind_shelter_score: .5, comfort_hint: 'sunny_calm' });
const call = (rows, ttl = 30) => db.query('select public.apply_microclimate_weather_bulk_v1($1::jsonb,$2::integer) as n', [JSON.stringify(rows), ttl]);
const snapshot = () => db.query('select * from public.microclimate_profiles order by venue_id');
await test('bulk migration in isolated PostgreSQL', async t => {
  await t.test('legacy RPC remains callable with identical definition', async () => {
    const q = await db.query("select proname from pg_proc where proname = 'apply_microclimate_weather'");
    assert.equal(q.rows.length, 1);
    assert.deepEqual(await db.query("select pg_get_functiondef('public.apply_microclimate_weather(text,real,real,real,real,real,real,text,integer)'::regprocedure) as definition"), legacyDefinition);
    await db.exec("set role service_role; select public.apply_microclimate_weather('a',0,0,0,.5,0,.5,'sunny_calm',30); reset role;");
  });
  await t.test('service role writes zeros atomically, geometry preserved, TTL 30m', async () => {
    await db.exec('set role service_role');
    assert.equal((await call([row('a'), row('b')])).rows[0].n, 2);
    await db.exec('reset role');
    const result = await db.query('select venue_id, wind_speed_10m, effective_wind, sun_score_annual, canyon_aspect_hw, extract(epoch from (expires_at-weather_computed_at)) as ttl from public.microclimate_profiles order by venue_id');
    assert.equal(result.rows[0].wind_speed_10m, 0); assert.equal(result.rows[0].effective_wind, 0);
    assert.equal(result.rows[0].sun_score_annual, .7); assert.equal(result.rows[0].canyon_aspect_hw, 1.3);
    assert.equal(Number(result.rows[0].ttl), 1800);
  });
  await t.test('anon/authenticated cannot invoke; PUBLIC has no execute grant', async () => {
    for (const role of ['anon', 'authenticated']) {
      const q = await db.query(`select has_function_privilege('${role}', 'public.apply_microclimate_weather_bulk_v1(jsonb,integer)', 'EXECUTE') as allowed`);
      assert.equal(q.rows[0].allowed, false);
      await db.exec(`set role ${role}`);
      await assert.rejects(call([row('a')]), /permission denied/);
      await db.exec('reset role');
    }
    const q = await db.query("select p.proacl::text as acl from pg_proc p where p.proname='apply_microclimate_weather_bulk_v1'");
    assert.ok(!q.rows[0].acl.includes(',=X'));
  });
  await t.test('invalid rows cause whole-batch rollback', async () => {
    const before = await snapshot();
    for (const invalid of [
      { ...row('b'), wind_speed_10m: null }, { ...row('b'), wind_speed_10m: '0' },
      { ...row('b'), effective_sun: 2 }, { ...row('b'), wind_direction_deg: -1 },
      { ...row('b'), comfort_hint: 'made_up' }, { ...row('b'), venue_id: null },
      { ...row('b'), wind_shelter_score: null },
    ]) {
      await assert.rejects(call([{ ...row('a'), effective_sun: .1 }, invalid]));
      assert.deepEqual(await snapshot(), before);
    }
  });
  await t.test('missing profile rolls back already matched rows', async () => {
    const before = await snapshot();
    await assert.rejects(call([{ ...row('a'), effective_sun: .2 }, row('missing')]), /missing profiles/);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('duplicate IDs rejected without write', async () => {
    const before = await snapshot();
    await assert.rejects(call([row('a'), row('a')]), /duplicate/);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('null, non-array, empty, oversized batch and invalid TTL rejected', async () => {
    for (const batch of [null, {}, [], Array(201).fill(row('a'))]) await assert.rejects(call(batch));
    for (const ttl of [null, 0, 29, 31, 100]) await assert.rejects(call([row('a')], ttl));
  });
});
await db.close();
