import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Test-only: an in-memory PostgreSQL instance. No hosted URL, keys or disk DB.
export async function createPilotDatabase() {
  if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to an already installed PGlite dist/index.js');
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create schema private;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema private grant all on tables to anon, authenticated;
    create table public.venues(id text primary key, access_details text not null);
    revoke all on public.venues from anon, authenticated;
    grant select on public.venues to anon, authenticated;
    insert into public.venues values ('dv-20', 'Permanent step-free entry instructions'),
      ('other-venue', 'Permanent lift directions');
  `);
  await db.exec(await readFile(new URL('../../docs/proposals/venue-area-heaters.sql', import.meta.url), 'utf8'));
  const ids = { manager: randomUUID(), guest: randomUUID(), otherManager: randomUUID(),
    terrace: randomUUID(), courtyard: randomUUID(), otherArea: randomUUID() };
  for (const actor of [ids.manager, ids.guest, ids.otherManager]) await db.query('insert into auth.users values ($1)', [actor]);
  for (const [venue, actor] of [['dv-20', ids.manager], ['other-venue', ids.otherManager]]) {
    await db.query(`insert into private.venue_pilot_managers values ($1, $2, 'manager', true, 'in_person', now())`, [venue, actor]);
  }
  for (const [id, venue, name, kind] of [[ids.terrace, 'dv-20', 'Terrace', 'terrace'],
    [ids.courtyard, 'dv-20', 'Courtyard', 'courtyard'], [ids.otherArea, 'other-venue', 'Other terrace', 'terrace']]) {
    await db.query('insert into private.venue_guest_areas values ($1, $2, $3, $4, true, true)', [id, venue, name, kind]);
  }
  const rpcNames = new Set(['get_venue_area_heaters', 'get_venue_guest_areas', 'get_managed_venue_areas', 'publish_venue_area_heaters']);
  async function as(actor, action) {
    return db.transaction(async tx => {
      await tx.exec(`set local role ${actor ? 'authenticated' : 'anon'}`);
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [actor ?? '']);
      return action(tx);
    });
  }
  async function rpc(name, args = {}, actor = null) {
    if (!rpcNames.has(name)) throw new Error('Unknown fixture RPC');
    const keys = Object.keys(args);
    if (keys.some(key => !/^p_[a-z_]+$/.test(key))) throw new Error('Invalid fixture parameter');
    return as(actor, async tx => {
      const call = `public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')})`;
      const result = await tx.query(name === 'publish_venue_area_heaters'
        ? `select ${call} as report` : `select to_jsonb(result) as value from ${call} result`, keys.map(key => args[key]));
      return name === 'publish_venue_area_heaters' ? result.rows[0].report : result.rows.map(row => row.value);
    });
  }
  function publish(overrides = {}) {
    return { p_venue_id: 'dv-20', p_area_id: ids.terrace, p_heaters_on: true,
      p_valid_for_minutes: 120, p_request_id: randomUUID(), ...overrides };
  }
  return { db, ids, as, rpc, publish, close: () => db.close() };
}
