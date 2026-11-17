import { scoringCloudCover } from './sky.js';

export const LIMITS = Object.freeze({
  invocationMs: 45000, weatherMs: 7000, databaseMs: 4000,
  retryDelayMs: 250, writeReserveMs: 5000, maxAttempts: 2,
  pageSize: 200, maxRows: 2000, maxPages: 40, weatherChunk: 80,
  refreshAheadMinutes: 22, ttlMinutes: 30,
});
const minute = 60000;
export const inRange = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export const validCoordinates = (lat, lng) => inRange(lat, -90, 90) && inRange(lng, -180, 180);
export const cellKey = (lat, lng) => `${(Math.round(lat / .05) * .05).toFixed(2)},${(Math.round(lng / .05) * .05).toFixed(2)}`;
const codeError = (code) => Object.assign(new Error(code), { code });

// Race as well as abort: even a broken transport/body reader cannot hold the caller.
// The operation must keep body consumption INSIDE this scope.
export async function bounded(operation, { deadline, timeoutMs, clock = () => performance.now() }) {
  const available = Math.min(timeoutMs, deadline - clock());
  if (available <= 0) throw codeError('deadline');
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(codeError('timeout'));
      }, available); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function fetchWeatherJSON(url, {
  deadline, fetchImpl = fetch, clock = () => performance.now(), metrics,
  timeoutMs = LIMITS.weatherMs, retryDelayMs = LIMITS.retryDelayMs,
}) {
  for (let attempt = 0; attempt < LIMITS.maxAttempts; attempt++) {
    // Do not start an attempt unless it fits, including the write reserve.
    if (deadline - clock() < timeoutMs + LIMITS.writeReserveMs) throw codeError('deadline');
    if (metrics) metrics.weather_attempts++;
    try {
      return await bounded(async (signal) => {
        const response = await fetchImpl(url, { signal });
        if (!response.ok) {
          // Never read/log an untrusted error body (it can stall or contain secrets).
          void response.body?.cancel().catch(() => {});
          const error = codeError('upstream_http');
          if (metrics) metrics.upstream_status_counts[response.status] = (metrics.upstream_status_counts[response.status] ?? 0) + 1;
          error.retryable = response.status === 429 || response.status >= 500;
          // Do not retry sooner than a provider asks; defer to the next scheduled run.
          if (response.headers?.get('retry-after')) error.retryable = false;
          throw error;
        }
        try { return await response.json(); }
        catch (error) {
          if (signal.aborted) throw codeError('timeout');
          if (error instanceof SyntaxError) throw codeError('invalid_json');
          throw error;
        }
      }, { deadline, timeoutMs, clock });
    } catch (error) {
      const retryable = error.code === 'timeout' || error instanceof TypeError || error.retryable;
      if (!retryable || attempt + 1 === LIMITS.maxAttempts) throw error;
      if (deadline - clock() < retryDelayMs + timeoutMs + LIMITS.writeReserveMs) throw codeError('deadline');
      if (metrics) metrics.retries++;
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
}

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dlat = (a.lat - b.lat) * rad, dlng = (a.lng - b.lng) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function validateWeather(body, points, nowMs = Date.now()) {
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length !== points.length) throw codeError('weather_cardinality');
  // JSON responses follow request order. Validate optional IDs and grid proximity;
  // returned coordinates are model grid points, NOT keys in our requested grid.
  // Reject the entire chunk if association is suspect; do not guess/reorder.
  rows.forEach((row, i) => {
    if (!row || !validCoordinates(row.latitude, row.longitude) ||
      (row.location_id !== undefined && row.location_id !== i) ||
      distanceKm(points[i], { lat: row.latitude, lng: row.longitude }) > 15) {
      throw codeError('weather_association');
    }
  });
  const valid = new Map();
  rows.forEach((row, i) => {
    const c = row.current, u = row.current_units;
    if (!c || !u || row.utc_offset_seconds !== 0 ||
      u.time !== 'unixtime' || u.interval !== 'seconds' ||
      u.wind_speed_10m !== 'm/s' || u.wind_direction_10m !== '°' || u.cloud_cover !== '%' ||
      !Number.isInteger(c.time) || !inRange(c.time, nowMs / 1000 - 30 * 60, nowMs / 1000 + 5 * 60) ||
      !inRange(c.interval, 1, 3600) ||
      !inRange(c.wind_speed_10m, 0, 150) || !inRange(c.wind_direction_10m, 0, 360) ||
      !inRange(c.cloud_cover, 0, 100)) return;
    // Radiation is optional; absence uses the EXISTING cloud-only sky fallback.
    const radiation = c.shortwave_radiation;
    if (radiation != null && (u.shortwave_radiation !== 'W/m²' || !inRange(radiation, 0, 1500))) return;
    valid.set(cellKey(points[i].lat, points[i].lng), {
      windSpeed: c.wind_speed_10m, windDir: c.wind_direction_10m, cloud: c.cloud_cover,
      sunCloud: scoringCloudCover(c.cloud_cover, radiation ?? null, row.latitude, row.longitude),
    });
  });
  return valid;
}

export function validWrite(row) {
  return typeof row.venue_id === 'string' && row.venue_id.length > 0 &&
    inRange(row.wind_speed_10m, 0, 150) && inRange(row.wind_direction_deg, 0, 360) &&
    inRange(row.cloud_cover_pct, 0, 100) && inRange(row.effective_sun, 0, 1) &&
    inRange(row.effective_wind, 0, 300) && inRange(row.wind_shelter_score, 0, 1) &&
    ['sunny_calm', 'sunny_breezy', 'shaded_calm', 'shaded_breezy'].includes(row.comfort_hint);
}

export async function runEnrichment({ selectPage, writeBatch, score,
  fetchImpl = fetch, clock = () => performance.now(), wallNow = () => new Date(),
  deadline = clock() + LIMITS.invocationMs, pageSize, ttlMinutes,
}) {
  const started = clock();
  const metrics = { ok: false, selected: 0, updated: 0, skipped: 0, pages: 0,
    cells: 0, upstream_status_counts: {}, weather_error_counts: {}, weather_attempts: 0, retries: 0, weather_failures: 0,
    bulk_failures: 0, write_outcome_unknown: false, unprocessed: 0,
    capped: false, code: 'complete', elapsed_ms: 0 };
  try {
    const size = pageSize === undefined ? LIMITS.pageSize : Number(pageSize);
    const ttl = ttlMinutes === undefined ? LIMITS.ttlMinutes : Number(ttlMinutes);
    if (!Number.isInteger(size) || size < 50 || size > 500 || ttl !== 30) throw codeError('invalid_config');
    const cutoff = new Date(wallNow().getTime() + LIMITS.refreshAheadMinutes * minute).toISOString();
    const rows = [], seen = new Set();
    let after = null;
    // Stable venue-ID keyset. Gather before writes; OFFSET paging of the changing
    // expires_at predicate would skip rows. Cap both work and memory.
    while (rows.length < LIMITS.maxRows && metrics.pages < LIMITS.maxPages) {
      const limit = Math.min(size, LIMITS.maxRows - rows.length);
      const page = await bounded(signal => selectPage({ after, cutoff, limit, signal }),
        { deadline, timeoutMs: LIMITS.databaseMs, clock });
      metrics.pages++;
      if (!Array.isArray(page) || page.length > limit) throw codeError('invalid_page');
      for (const row of page) {
        if (typeof row.venue_id !== 'string' || seen.has(row.venue_id)) throw codeError('invalid_page');
        seen.add(row.venue_id); rows.push(row);
      }
      if (page.length < limit) break;
      after = page.at(-1).venue_id;
      metrics.capped = rows.length === LIMITS.maxRows || metrics.pages === LIMITS.maxPages;
    }
    metrics.selected = rows.length;
    const cells = new Map();
    for (const row of rows) {
      if (!validCoordinates(row.venues?.lat, row.venues?.lng)) { metrics.skipped++; continue; }
      const key = cellKey(row.venues.lat, row.venues.lng);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(row);
    }
    metrics.cells = cells.size;
    const keys = [...cells.keys()];
    for (let i = 0; i < keys.length; i += LIMITS.weatherChunk) {
      const chunk = keys.slice(i, i + LIMITS.weatherChunk);
      const points = chunk.map(key => { const [lat, lng] = key.split(',').map(Number); return { lat, lng }; });
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + points.map(p => p.lat).join(',') +
        '&longitude=' + points.map(p => p.lng).join(',') +
        '&current=wind_speed_10m,wind_direction_10m,cloud_cover,shortwave_radiation&wind_speed_unit=ms&timezone=UTC&timeformat=unixtime';
      let weather;
      try {
        const body = await fetchWeatherJSON(url, { deadline, fetchImpl, clock, metrics });
        weather = validateWeather(body, points, wallNow().getTime());
      } catch (error) {
        if (error.code === 'deadline') throw error;
        metrics.weather_failures++;
        const reason = ['weather_cardinality', 'weather_association', 'timeout', 'invalid_json', 'upstream_http'].includes(error.code)
          ? error.code : 'upstream_network';
        metrics.weather_error_counts[reason] = (metrics.weather_error_counts[reason] ?? 0) + 1;
        metrics.skipped += chunk.reduce((n, key) => n + cells.get(key).length, 0);
        continue;
      }
      const writes = [];
      for (const key of chunk) for (const profile of cells.get(key)) {
        const w = weather.get(key);
        if (!w) { metrics.skipped++; continue; }
        const row = { venue_id: profile.venue_id, wind_speed_10m: w.windSpeed,
          wind_direction_deg: w.windDir, cloud_cover_pct: w.cloud, ...score(profile, w, wallNow()) };
        if (validWrite(row)) writes.push(row); else metrics.skipped++;
      }
      for (let j = 0; j < writes.length; j += LIMITS.pageSize) {
        const batch = writes.slice(j, j + LIMITS.pageSize);
        try {
          const count = await bounded(signal => writeBatch(batch, ttl, signal),
            { deadline, timeoutMs: LIMITS.databaseMs, clock });
          if (count !== batch.length) throw codeError('bulk_count');
          metrics.updated += count;
        } catch (error) {
          metrics.bulk_failures++;
          metrics.write_outcome_unknown = true;
          // A timed-out write can have committed: do not retry or claim success.
          throw codeError(error.code === 'deadline' ? 'deadline' : 'bulk_failed');
        }
      }
    }
    metrics.ok = !metrics.capped && !metrics.skipped && !metrics.weather_failures;
    if (!metrics.ok) metrics.code = metrics.capped ? 'capacity' : 'partial';
  } catch (error) {
    metrics.code = ['deadline', 'timeout', 'invalid_config', 'invalid_page', 'bulk_failed'].includes(error.code)
      ? error.code : 'execution_failed';
  }
  metrics.unprocessed = Math.max(0, metrics.selected - metrics.updated - metrics.skipped);
  metrics.elapsed_ms = Math.round(clock() - started);
  return metrics;
}
