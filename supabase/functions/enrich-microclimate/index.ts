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
 *   - Writes via apply_microclimate_weather_bulk_v1; geometry stays intact
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
import { melbourneHour, scoreVenue } from "./scoring.js";
import { runEnrichment, refreshPageQuery, LIMITS } from "./reliability.js";
import { sendCheckIn } from "./checkin.js";

type Profile = {
  venue_id: string;
  sun_score_annual: number | null;
  sun_hour_fraction: number[] | null;
  wind_exposure_by_sector: number[] | null;
  canyon_aspect_hw: number | null;
  venues: { id: string; lat: number; lng: number } | null;
};
type Weather = { windSpeed: number; windDir: number; cloud: number; sunCloud?: number };
type WeatherWrite = ReturnType<typeof scoreVenue> & {
  venue_id: string; wind_speed_10m: number; wind_direction_deg: number; cloud_cover_pct: number;
};
type PageRequest = { after: { venue_id: string; expires_at: string | null } | null; cutoff: string; limit: number; signal: AbortSignal };

// A client per invocation prevents concurrent calls sharing deadlines/signals.
export async function enrichBatch() {
  const started = performance.now();
  const deadline = started + LIMITS.invocationMs;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return runEnrichment({
    deadline,
    pageSize: Deno.env.get("ENRICH_BATCH_SIZE"),
    ttlMinutes: Deno.env.get("ENRICH_TTL_MINUTES"),
    score: (profile: Profile, weather: Weather, now: Date) => scoreVenue(profile, weather, melbourneHour(now)),
    selectPage: async ({ after, cutoff, limit, signal }: PageRequest) => {
      const { data, error } = await refreshPageQuery(supabase, { after, cutoff, limit, signal });
      if (error) throw new Error("selection_failed");
      return data ?? [];
    },
    writeBatch: async (rows: WeatherWrite[], ttl: number, signal: AbortSignal) => {
      const { data, error } = await supabase.rpc("apply_microclimate_weather_bulk_v1", {
        p_rows: rows, p_ttl_minutes: ttl,
      }).abortSignal(signal);
      if (error) throw new Error("bulk_failed");
      return data;
    },
  });
}

Deno.serve(async (_req) => {
  let result;
  try {
    result = await enrichBatch();
  } catch {
    // Initialization/configuration failures must also avoid raw credential-bearing errors.
    result = { ok: false, code: "initialization_failed" };
  }
  // Sentry Crons alert on a failed or missing run; "off" until SENTRY_CRON_DSN is set.
  const checkin = await sendCheckIn({ dsn: Deno.env.get("SENTRY_CRON_DSN"), result });
  // Only fixed codes and counts: never raw upstream/DB errors, URLs or credentials.
  console.log(JSON.stringify({ event: "microclimate_enrichment", ...result, checkin }));
  return Response.json(result, { status: result.ok ? 200 : 503 });
});
