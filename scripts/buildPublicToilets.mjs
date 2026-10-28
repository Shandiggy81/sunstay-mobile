#!/usr/bin/env node
/**
 * Builds src/data/publicAccessibleToilets.json from the National Public Toilet
 * Map CSV: accessible toilets inside greater Melbourne (MAX_BOUNDS) only.
 *
 *   node scripts/buildPublicToilets.mjs <toiletmapexport.csv>
 *
 * Source: National Public Toilet Map, Australian Government Department of
 * Health, Disability and Ageing, data.gov.au dataset
 * 553b3049-2b8b-46a2-95e6-640d7986a8c1, licensed CC BY 3.0 AU
 * (http://creativecommons.org/licenses/by/3.0/au/). The app credits it
 * wherever a toilet is shown. Rerun after a new export to refresh.
 *
 * Output rows are compact arrays: [facilityId, name, lat, lng, flags, hours]
 *   flags: 1 = MLAK key or key required, 2 = Changing Places, 4 = baby change,
 *          8 = payment required
 */
import fs from 'node:fs';
import { MAX_BOUNDS } from '../src/config/mapBounds.js';
import { parseCsv } from '../src/utils/csv.js';

const [input] = process.argv.slice(2);
if (!input) {
    console.error('usage: node scripts/buildPublicToilets.mjs <toiletmapexport.csv>');
    process.exit(1);
}

const rows = parseCsv(fs.readFileSync(input, 'utf8').replace(/^﻿/, ''));
const [[west, south], [east, north]] = MAX_BOUNDS;
const yes = value => String(value).trim().toLowerCase() === 'true';
const out = [];
for (const row of rows) {
    if (row.State !== 'VIC' || !yes(row.Accessible)) continue;
    const lat = Number(row.Latitude);
    const lng = Number(row.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lng < west || lng > east || lat < south || lat > north) continue;
    const flags = (yes(row.KeyRequired) || yes(row.MLAK24) || yes(row.MLAKAfterHours) ? 1 : 0)
        | (yes(row.ChangingPlaces) ? 2 : 0)
        | (yes(row.BabyChange) || yes(row.BabyCareRoom) ? 4 : 0)
        | (yes(row.PaymentRequired) ? 8 : 0);
    const hours = String(row.OpeningHours ?? '').replace(/^OPEN:\s*/i, '').trim().slice(0, 80);
    out.push([String(row.FacilityID), String(row.Name).trim(), Number(lat.toFixed(5)), Number(lng.toFixed(5)), flags, hours]);
}
out.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
const file = new URL('../src/data/publicAccessibleToilets.json', import.meta.url);
fs.writeFileSync(file, JSON.stringify(out) + '\n');
console.log(`${out.length} accessible public toilets written to src/data/publicAccessibleToilets.json`);
