/**
 * Sentry Crons check-in for this job, so a stalled refresh raises an alert.
 *
 * Without it the job failed for about six days (16–23 Nov 2026) and nothing
 * told anyone: the app quietly fell back to estimates. One check-in per run
 * covers both ways it breaks:
 *   - the run ends with ok=false (bad config, Open-Meteo down, a failed write)
 *     → "error" check-in;
 *   - the run never reports (killed at the platform limit, cron or pg_net
 *     stopped, a broken deploy) → Sentry marks the slot missed.
 *
 * Off unless the SENTRY_CRON_DSN function secret is set. A check-in can never
 * fail or slow the job beyond CHECKIN_TIMEOUT_MS, and the DSN is never logged.
 * HTTP API: https://docs.sentry.io/product/crons/getting-started/http/
 * Plain JavaScript so the Node test runner can import it; Deno imports it from index.ts.
 */

export const MONITOR_SLUG = 'enrich-microclimate';
export const CHECKIN_TIMEOUT_MS = 3000;

// Sent with every check-in, so Sentry creates the monitor on the first one and
// keeps it in step with this file. The schedule must match the pg_cron job
// (20260918034428_schedule_enrich_microclimate_cron.sql); a test checks it.
export const MONITOR_CONFIG = Object.freeze({
  schedule: Object.freeze({ type: 'crontab', value: '*/20 * * * *' }),
  timezone: 'UTC',
  // Minutes past the slot before a run counts as missed.
  checkin_margin: 10,
  max_runtime: 5,
  // Two bad runs in a row (about 40 minutes) open an issue, so one passing
  // Open-Meteo hiccup does not page anyone; one good run resolves it.
  failure_issue_threshold: 2,
  recovery_threshold: 1,
});

/**
 * Check-in URL for a DSN such as https://<key>@o1.ingest.us.sentry.io/123,
 * or null when the DSN is missing or malformed.
 * @param {string|null|undefined} dsn
 * @param {string} [slug]
 * @returns {string|null}
 */
export function checkInUrl(dsn, slug = MONITOR_SLUG) {
  if (typeof dsn !== 'string' || !dsn.trim()) return null;
  let url;
  try { url = new URL(dsn.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || !url.username || url.password || url.search || url.hash) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const projectId = segments.pop();
  if (!projectId || !/^\d+$/.test(projectId)) return null;
  // Self-hosted Sentry can sit under a path prefix, which the API URL keeps.
  const prefix = segments.length ? `/${segments.join('/')}` : '';
  return `https://${url.host}${prefix}/api/${projectId}/cron/${encodeURIComponent(slug)}/${encodeURIComponent(url.username)}/`;
}

/** @param {{ ok?: boolean, [key: string]: unknown }|null|undefined} result */
export function checkInBody(result) {
  return { status: result?.ok === true ? 'ok' : 'error', monitor_config: MONITOR_CONFIG };
}

/**
 * Report one finished run. Never throws.
 * @param {{ dsn?: string|null, result?: { ok?: boolean, [key: string]: unknown }|null, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<'off'|'sent'|'failed'>}
 */
export async function sendCheckIn({ dsn, result, fetchImpl = fetch, timeoutMs = CHECKIN_TIMEOUT_MS } = {}) {
  const url = checkInUrl(dsn);
  if (!url) return 'off';
  const controller = new AbortController();
  let timer;
  try {
    const request = Promise.resolve().then(() => fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkInBody(result)),
      signal: controller.signal,
      redirect: 'error',
    }));
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs);
    });
    const response = await Promise.race([request, timeout]);
    // The body is never needed; release the connection without reading it.
    void response?.body?.cancel?.().catch(() => {});
    return response?.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
