/**
 * One-off seed: upsert the 48 demoVenues into public.venues.
 *
 * RLS only allows INSERT for the `authenticated` role, so the anon key will
 * be rejected. Disable RLS for this run (see instructions) or set
 * SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) alongside the requested vars.
 *
 * Usage:
 *   node scripts/seedVenues.js
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { demoVenues } from '../src/data/demoVenues.js';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function toRow(venue) {
  return {
    id: venue.id,
    companyName: venue.companyName ?? null,
    venueName: venue.venueName ?? null,
    address: venue.address ?? null,
    suburb: venue.suburb ?? null,
    city: venue.city ?? null,
    state: venue.state ?? null,
    lat: venue.lat ?? null,
    lng: venue.lng ?? null,
    emoji: venue.emoji ?? null,
    vibe: venue.vibe ?? null,
    typeCategory: venue.typeCategory ?? null,
    typeLabel: venue.typeLabel ?? null,
    tags: Array.isArray(venue.tags) ? venue.tags : [],
    heating: venue.heating ?? null,
    hasBalcony: venue.hasBalcony ?? null,
    hasCozy: venue.hasCozy ?? null,
    hasFireplace: venue.hasFireplace ?? null,
    price: venue.price ?? null,
    capacity: venue.capacity ?? null,
    opening_hours: venue.opening_hours ?? null,
    venue_description: venue.venue_description ?? null,
    official_website_url: venue.official_website_url ?? null,
    contact_phone: venue.contact_phone ?? null,
    notes: venue.notes ?? null,
    proTip: venue.proTip ?? null,
    sunIntelligence: venue.sunIntelligence ?? null,
    image: venue.image ?? null,
    happyHour: venue.happyHour ?? null,
    shielding: venue.shielding ?? null,
    roomTypes: venue.roomTypes ?? null,
  };
}

loadEnv();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

if (!Array.isArray(demoVenues) || demoVenues.length === 0) {
  console.error('demoVenues is empty — aborting.');
  process.exit(1);
}

const supabase = createClient(url, key);
const rows = demoVenues.map(toRow);

const { data, error } = await supabase
  .from('venues')
  .upsert(rows, { onConflict: 'id' })
  .select('id');

if (error) {
  console.error('Seed failed:', error.message);
  if (/row-level security|permission denied|42501/i.test(error.message)) {
    console.error('\nRLS blocked this insert (anon is SELECT-only).');
    console.error('Either:');
    console.error('  1. Run in SQL Editor:  alter table public.venues disable row level security;');
    console.error('     then re-run this script, then:  alter table public.venues enable row level security;');
    console.error('  2. Set SUPABASE_SERVICE_ROLE_KEY in .env.local and re-run.');
  }
  process.exit(1);
}

console.log(`Seeded ${data?.length ?? rows.length} venues into public.venues.`);
