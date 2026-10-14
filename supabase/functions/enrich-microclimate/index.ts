/**
 * SunStay — microclimate enrichment job (weather × morphology)
 *
 * Deploy as a Supabase Edge Function; cron every 20 minutes.
 * Geometry (sun horizon + canyon H/W) is computed offline; this job only
 * modulates cached morphology with live Open-Meteo wind/cloud.
 *
 * Decisions (Marcin):
 *   - Open-Meteo forecast API (no key, free, multi-point lat/lng lists)
 *   - 8-sector wind multipliers already on the row (morphology_hw_v1)
 *   - ~0.05° weather cells to collapse nearby venues into one fetch
 *   - Writes via apply_microclimate_weather so geometry columns stay intact
 *   - Service role only — never called from the Mapbox client
 *   - venues use lat/lng columns (not geography location)
 *   - sun_hour_fraction is indexed by Australia/Melbourne local hour
 *
 * Units written per venue (the client reads them in src/utils/microclimate.js):
 *   - effective_sun       0–1, sun_hour_fraction[hour] × (1 − cloud/100)
 *   - effective_wind      m/s, 10 m wind speed × sector exposure multiplier
 *                         (the wind felt at the venue; NOT a 0–1 factor)
 *   - wind_shelter_score  0–1, 1 − multiplier × 0.9 (1 = fully sheltered);
 *                         the client derives exposure as 1 − this
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { scoringCloudCover } from "./sky.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = Number(Deno.env.get("ENRICH_BATCH_SIZE") ?? 200);
const TTL_MINUTES = Number(Deno.env.get("ENRICH_TTL_MINUTES") ?? 30);
const GRID = 0.05; // ~5 km weather cells

type ProfileRow = {
  venue_id: string;
  sun_score_annual: number | null;
  sun_hour_fraction: number[] | null;
  wind_exposure_by_sector: number[] | null;
  canyon_aspect_hw: number | null;
  venues: { id: string; lat: number; lng: number } | null;
};

type LatLng = { lat: number; lng: number };
// cloud: Open-Meteo's reported cloud_cover (stored as-is).
// sunCloud: cloud as the sun experiences it (sky.ts), used for effective_sun.
type Weather = { windSpeed: number; windDir: number; cloud: number; sunCloud?: number };

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function melbourneHour(now = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now).find((p) => p.type === "hour")?.value;
  return Number(hour ?? now.getUTCHours());
}

/** Meteorological degrees → sector index 0=N … 7=NW */
export function windSector(directionDeg: number): number {
  const d = ((directionDeg % 360) + 360) % 360;
  return Math.round(d / 45) % 8;
}

export function shelterFromAspect(hw: number | null): number {
  if (hw == null || Number.isNaN(hw)) return 0.4;
  if (hw < 0.3) return 0.15;
  if (hw < 0.7) return 0.45;
  return Math.min(0.85, 0.5 + (hw - 0.7) * 0.25);
}

export function comfortHint(sun: number, windMs: number): string {
  const breezy = windMs >= 4.5;
  const sunny = sun >= 0.45;
  if (sunny && !breezy) return "sunny_calm";
  if (sunny && breezy) return "sunny_breezy";
  if (!sunny && !breezy) return "shaded_calm";
  return "shaded_breezy";
}

function cellKey(lat: number, lng: number): string {
  const r = (n: number) => (Math.round(n / GRID) * GRID).toFixed(2);
  return `${r(lat)},${r(lng)}`;
}

async function fetchOpenMeteo(points: LatLng[]): Promise<Map<string, Weather>> {
  const out = new Map<string, Weather>();
  if (points.length === 0) return out;
  const chunkSize = 80;
  for (let i = 0; i < points.length; i += chunkSize) {
    const slice = points.slice(i, i + chunkSize);
    const lats = slice.map((p) => p.lat).join(",");
    const lngs = slice.map((p) => p.lng).join(",");
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
      `&current=wind_speed_10m,wind_direction_10m,cloud_cover,shortwave_radiation` +
      `&wind_speed_unit=ms&timezone=UTC`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
    const body = await res.json();
    const rows = Array.isArray(body) ? body : [body];
    for (const row of rows) {
      const lat = Array.isArray(row.latitude) ? row.latitude[0] : row.latitude;
      const lng = Array.isArray(row.longitude) ? row.longitude[0] : row.longitude;
      const cur = row.current ?? {};
      const cloud = Number(cur.cloud_cover ?? 0);
      const radiation = cur.shortwave_radiation == null ? null : Number(cur.shortwave_radiation);
      out.set(cellKey(lat, lng), {
        windSpeed: Number(cur.wind_speed_10m ?? 0),
        windDir: Number(cur.wind_direction_10m ?? 0),
        cloud,
        sunCloud: scoringCloudCover(cloud, radiation, lat, lng),
      });
    }
  }
  return out;
}

export function scoreVenue(
  profile: {
    sun_hour_fraction: number[] | null;
    sun_score_annual: number | null;
    wind_exposure_by_sector: number[] | null;
    canyon_aspect_hw: number | null;
  },
  weather: Weather,
  hourLocal: number,
): {
  /** 0–1 */
  effective_sun: number;
  /** m/s at the venue */
  effective_wind: number;
  /** 0–1, 1 = fully sheltered from the current wind direction */
  wind_shelter_score: number;
  comfort_hint: string;
} {
  const hourFrac =
    profile.sun_hour_fraction?.[hourLocal] ??
    profile.sun_score_annual ??
    0.5;
  const cloudFactor = 1 - Math.min(Math.max(weather.sunCloud ?? weather.cloud, 0), 100) / 100;
  const effective_sun = Math.min(1, Math.max(0, hourFrac * cloudFactor));
  const sector = windSector(weather.windDir);
  const mult =
    profile.wind_exposure_by_sector?.[sector] ??
    (1 - shelterFromAspect(profile.canyon_aspect_hw));
  // weather.windSpeed is m/s (wind_speed_unit=ms), so this stays m/s.
  const effective_wind = Math.max(0, weather.windSpeed * mult);
  const wind_shelter_score = Math.min(1, Math.max(0, 1 - mult * 0.9));
  return {
    effective_sun,
    effective_wind,
    wind_shelter_score,
    comfort_hint: comfortHint(effective_sun, effective_wind),
  };
}

export async function enrichBatch(): Promise<{ updated: number; cells: number }> {
  const hourLocal = melbourneHour();
  const { data, error } = await supabase
    .from("microclimate_profiles")
    .select(`
      venue_id,
      sun_score_annual,
      sun_hour_fraction,
      wind_exposure_by_sector,
      canyon_aspect_hw,
      venues!inner ( id, lat, lng )
    `)
    .or(`expires_at.is.null,expires_at.lt.${new Date().toISOString()}`)
    .limit(BATCH_SIZE);
  if (error) throw error;
  const rows = (data ?? []) as unknown as ProfileRow[];
  if (rows.length === 0) return { updated: 0, cells: 0 };

  const cellPoints = new Map<string, LatLng>();
  const venueMeta: { venue_id: string; cell: string; profile: ProfileRow }[] = [];
  for (const row of rows) {
    const lat = row.venues?.lat;
    const lng = row.venues?.lng;
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const cell = cellKey(lat, lng);
    cellPoints.set(cell, {
      lat: Math.round(lat / GRID) * GRID,
      lng: Math.round(lng / GRID) * GRID,
    });
    venueMeta.push({ venue_id: row.venue_id, cell, profile: row });
  }

  const weatherByCell = await fetchOpenMeteo([...cellPoints.values()]);
  let updated = 0;
  for (const { venue_id, cell, profile } of venueMeta) {
    const w = weatherByCell.get(cell) ?? { windSpeed: 0, windDir: 0, cloud: 50 };
    const scored = scoreVenue(profile, w, hourLocal);
    const { error: upErr } = await supabase.rpc("apply_microclimate_weather", {
      p_venue_id: venue_id,
      p_wind_speed_10m: w.windSpeed,
      p_wind_direction_deg: w.windDir,
      p_cloud_cover_pct: w.cloud,
      p_effective_sun: scored.effective_sun,
      p_effective_wind: scored.effective_wind,
      p_wind_shelter_score: scored.wind_shelter_score,
      p_comfort_hint: scored.comfort_hint,
      p_ttl_minutes: TTL_MINUTES,
    });
    if (upErr) throw upErr;
    updated += 1;
  }
  return { updated, cells: cellPoints.size };
}

Deno.serve(async (_req) => {
  try {
    const result = await enrichBatch();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});
