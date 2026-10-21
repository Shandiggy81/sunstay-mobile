/**
 * events-tonight: tonight's Ticketmaster events near a point in Victoria.
 *
 * GET /functions/v1/events-tonight?lat=-37.81&lng=144.96&radius=3&start=…Z&end=…Z
 *   start/end: YYYY-MM-DDTHH:mm:ssZ, at most 24 h apart (the app sends
 *   ticketmasterSearchParams' window from src/utils/afterDarkEvents.js).
 * Auth:   Authorization: Bearer <anon key or user JWT> (verify_jwt = true)
 * Secret: TICKETMASTER_API_KEY (the app's Consumer Key). It never reaches the client.
 *
 * Response: { _embedded: { events: [...] }, fetchedAt, cached }. Events are
 * trimmed to the fields src/utils/afterDarkEvents.js normalises; the app
 * normalises them and keeps them in review until approved.
 *
 * Limits: 20 requests/min and 120/hour per client IP, 60/min per instance
 * (Ticketmaster allows 5,000 calls a day, 5 a second). Answers are cached per
 * instance for 15 minutes on a ~1 km grid, so most guests never reach Ticketmaster.
 *
 * Deploy (production; needs approval):
 *   supabase secrets set TICKETMASTER_API_KEY=... --project-ref fksuqgvsazoxarocmaii
 *   supabase functions deploy events-tonight --project-ref fksuqgvsazoxarocmaii
 */

import { clientKey, createRateLimiter } from '../chat-sunny/limits.js';
import { createCache, discoveryUrl, parseEventsRequest, trimDiscoveryBody, upstreamError } from './request.js';

// limits.js types its default as fixed numbers; these are this function's own limits.
type Limits = { perClientPerMinute: number; perClientPerHour: number; perInstancePerMinute: number };
const rateLimiter = (createRateLimiter as unknown as (limits: Limits) => ReturnType<typeof createRateLimiter>)(
  { perClientPerMinute: 20, perClientPerHour: 120, perInstancePerMinute: 60 },
);
const cache = createCache();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('TICKETMASTER_API_KEY');
  if (!apiKey) return json({ error: 'not_configured' }, 503);

  const parsed = parseEventsRequest(new URL(req.url).searchParams);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

  const hit = cache.get(parsed.cacheKey);
  if (hit) return json({ ...hit.value, cached: true }, 200, { 'Cache-Control': 'public, max-age=300' });

  const limit = rateLimiter.check(clientKey(req.headers));
  if (!limit.ok) return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(limit.retryAfterSec) });

  try {
    const upstream = await fetch(discoveryUrl(parsed.query, apiKey), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      const mapped = upstreamError(upstream.status);
      console.warn('[events-tonight] upstream', upstream.status);
      return json({ error: mapped.error }, mapped.status);
    }
    const value = { ...trimDiscoveryBody(await upstream.json()), fetchedAt: new Date().toISOString() };
    cache.set(parsed.cacheKey, value);
    return json({ ...value, cached: false }, 200, { 'Cache-Control': 'public, max-age=300' });
  } catch (error) {
    console.warn('[events-tonight] fetch failed', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'upstream_unreachable' }, 502);
  }
});
