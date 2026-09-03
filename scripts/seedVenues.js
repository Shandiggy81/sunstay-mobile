/**
 * Database Seeding Script — Sunstay Venues
 * ─────────────────────────────────────────
 * Reads 48 venues from src/data/demoVenues.js and uploads them
 * into the live Supabase PostgreSQL 'venues' table.
 *
 * Usage:
 *   npm run seed
 *
 * Environment variables required in .env.local (or .env):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { demoVenues } from '../src/data/demoVenues.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load .env.local first (local overrides), then fall back to .env
const envLocalPath = path.join(rootDir, '.env.local');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('\n❌ Missing Supabase credentials!');
  console.error('Please configure the following in .env.local:');
  console.error('  VITE_SUPABASE_URL=https://your-project.supabase.co');
  console.error('  VITE_SUPABASE_ANON_KEY=your-anon-or-service-role-key\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

function sanitizeVenue(venue) {
  return {
    id: String(venue.id),
    venueName: venue.venueName || venue.name || 'Unnamed Venue',
    companyName: venue.companyName || null,
    address: venue.address || null,
    suburb: venue.suburb || null,
    city: venue.city || 'Melbourne',
    state: venue.state || 'VIC',
    lat: Number(venue.lat),
    lng: Number(venue.lng),
    emoji: venue.emoji || '☀️',
    vibe: venue.vibe || null,
    typeCategory: venue.typeCategory || 'Bar',
    typeLabel: venue.typeLabel || null,
    tags: Array.isArray(venue.tags) ? venue.tags : [],
    heating: venue.heating || null,
    hasBalcony: Boolean(venue.hasBalcony),
    hasFireplace: Boolean(venue.hasFireplace),
    hasCozy: Boolean(venue.hasCozy),
    price: venue.price || null,
    capacity: typeof venue.capacity === 'number' ? venue.capacity : null,
    opening_hours: venue.opening_hours || null,
    hours: venue.hours || venue.opening_hours || null,
    venue_description: venue.venue_description || null,
    official_website_url: venue.official_website_url || null,
    contact_phone: venue.contact_phone || null,
    notes: venue.notes || null,
    proTip: venue.proTip || null,
    image: typeof venue.image === 'string' ? venue.image : null,
    shielding: venue.shielding && typeof venue.shielding === 'object' ? venue.shielding : {},
    sunIntelligence: venue.sunIntelligence || null,
    roomTypes: Array.isArray(venue.roomTypes) ? venue.roomTypes : [],
    happyHour: venue.happyHour && typeof venue.happyHour === 'object' ? venue.happyHour : null,
    sunshineNow: Boolean(venue.sunshineNow),
    fireplaceOn: Boolean(venue.fireplaceOn),
    heatersOn: Boolean(venue.heatersOn),
    roofClosed: Boolean(venue.roofClosed),
    obstacle_height: Number.isFinite(venue.obstacle_height) ? venue.obstacle_height : 2,
    obstacle_distance: Number.isFinite(venue.obstacle_distance) ? venue.obstacle_distance : 1,
    base_elevation_meters: Number.isFinite(venue.base_elevation_meters) ? venue.base_elevation_meters : 0,
    balconyData: venue.balconyData && typeof venue.balconyData === 'object' ? venue.balconyData : {},
    updated_at: new Date().toISOString(),
  };
}

async function seed() {
  console.log(`\n🚀 Starting Sunstay venue seeding to Supabase...`);
  console.log(`📍 Supabase Project: ${supabaseUrl}`);
  console.log(`📦 Venues found in demoVenues.js: ${demoVenues.length}`);

  const payload = demoVenues.map(sanitizeVenue);

  // Validate coordinates before uploading
  const invalid = payload.filter(
    (v) => isNaN(v.lat) || isNaN(v.lng) || v.lat < -90 || v.lat > 90 || v.lng < -180 || v.lng > 180
  );

  if (invalid.length > 0) {
    console.error(`❌ Aborting: Found ${invalid.length} venue(s) with invalid coordinates:`, invalid.map(v => v.id));
    process.exit(1);
  }

  // Upsert all records in batches of 25 for safe transmission
  const batchSize = 25;
  let totalInserted = 0;

  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('venues')
      .upsert(batch, { onConflict: 'id' })
      .select('id');

    if (error) {
      console.error(`\n❌ Error upserting batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      if (error.details) console.error('Details:', error.details);
      if (error.hint) console.error('Hint:', error.hint);
      process.exit(1);
    }

    totalInserted += (data ? data.length : batch.length);
    console.log(`   ✓ Upserted batch ${Math.floor(i / batchSize) + 1} (${totalInserted}/${payload.length})`);
  }

  console.log(`\n🎉 Seeding complete! Successfully synchronized ${totalInserted} venues in Supabase.\n`);
}

seed().catch((err) => {
  console.error('\n❌ Fatal error during seeding:', err);
  process.exit(1);
});
