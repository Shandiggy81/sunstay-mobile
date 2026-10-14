#!/usr/bin/env node
/**
 * Loads City of Melbourne "2023 Building Footprints" into public.buildings.
 *
 * Needs migration 20261014130000_city_of_melbourne_buildings applied first.
 * Dry run by default; writes only with --apply. Do not run --apply against
 * production without explicit approval (CLAUDE.md).
 *
 *   1. Download the GeoJSON export from
 *      https://discover.data.vic.gov.au/dataset/2023-building-footprints
 *      (CC BY 4.0). Do not commit it; it is ~35 MB.
 *   2. Dry run:  node scripts/loadCityBuildings.mjs path/to/2023-building-footprints.geojson
 *   3. Load:     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *                node scripts/loadCityBuildings.mjs path/to/file.geojson --apply
 *   4. Rows loaded before structure_ref existed (migration 20261014140000):
 *                add --apply --backfill-structures to set only structure_ref, no geometry.
 *
 * The service role key is a secret: pass it in the environment for this one
 * command only. Never put it in a VITE_* variable, .env, or the repository.
 *
 * Re-runnable: rows upsert on source_ref, and the OSM dedupe is recomputed.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chunk, cityBuildingRows, structurePairs } from '../src/utils/cityBuildings.js';

const BATCH = 500;
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const backfillStructures = args.includes('--backfill-structures');
const file = args.find(arg => !arg.startsWith('--'));

if (!file) {
    console.error('Usage: node scripts/loadCityBuildings.mjs <2023-building-footprints.geojson> [--apply]');
    process.exit(1);
}

const collection = JSON.parse(readFileSync(file, 'utf8'));
const { rows, skipped } = cityBuildingRows(collection);
const heights = rows.map(row => row.height_m).sort((a, b) => a - b);
console.log(`Features: ${collection.features?.length ?? 0}`);
console.log(`Building parts to load: ${rows.length}`);
console.log(`Skipped: ${skipped.notStructure} non-buildings (bridges, tram stops, jetties...), ${skipped.invalid} invalid, ${skipped.duplicate} duplicates`);
if (heights.length) {
    console.log(`Heights: median ${heights[Math.floor(heights.length / 2)]} m, tallest ${heights[heights.length - 1]} m, ` +
        `${heights.filter(h => h > 50).length} parts over 50 m`);
}

if (!apply) {
    console.log('\nDry run only. Re-run with --apply (and SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) to load.');
    process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --apply.');
    process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

if (backfillStructures) {
    const pairs = structurePairs(collection);
    let updated = 0;
    for (const batch of chunk(pairs, 10000)) {
        const { data, error } = await supabase.rpc('set_city_structure_refs', { p_pairs: batch });
        if (error) { console.error(`Structure backfill failed: ${error.message}. Re-running is safe.`); process.exit(1); }
        updated += data ?? 0;
    }
    console.log(`Building grouping set on ${updated} parts (${pairs.length} pairs sent).`);
    process.exit(0);
}
const batches = chunk(rows, BATCH);
let loaded = 0;
for (const [index, batch] of batches.entries()) {
    const { data, error } = await supabase.rpc('upsert_city_buildings_batch', { p_rows: batch });
    if (error) {
        console.error(`\nBatch ${index + 1}/${batches.length} failed: ${error.message}`);
        console.error(`${loaded} parts were loaded before the failure. Re-running is safe (rows upsert).`);
        process.exit(1);
    }
    loaded += data ?? 0;
    process.stdout.write(`\rLoaded ${loaded}/${rows.length}`);
}
console.log();

const { data: superseded, error: dedupeError } = await supabase.rpc('mark_osm_buildings_superseded');
if (dedupeError) {
    console.error(`Loaded, but marking duplicate OSM buildings failed: ${dedupeError.message}`);
    process.exit(1);
}
console.log(`OSM buildings now covered by City data (skipped in shading): ${superseded}`);
console.log('Done. Venue shading profiles update when seed_venue_morphology next runs for each venue.');
