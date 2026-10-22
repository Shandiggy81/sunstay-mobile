import { clientKey, createRateLimiter } from '../chat-sunny/limits.js';
import { createCache, parseWeatherRequest, weatherUrl } from './request.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const RATE_LIMITS = { perClientPerMinute: 20, perClientPerHour: 120, perInstancePerMinute: 60 };

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: {
    ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers,
  } });
}
const error = (code, status, headers) => response(JSON.stringify({ error: code }), status, headers);
const success = (body) => response(body, 200, { 'Cache-Control': 'public, max-age=300' });

// Dependencies are injectable for Node tests; Deno supplies only the secret reader.
export function createWeatherHandler({
  fetchImpl = fetch,
  getApiKey = () => '',
  now = Date.now,
  cache = createCache(),
  rateLimiter = createRateLimiter(RATE_LIMITS),
} = {}) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'GET') return error('method_not_allowed', 405, { Allow: 'GET, OPTIONS' });
    const parsed = parseWeatherRequest(new URL(req.url).searchParams);
    if (!parsed.ok) return error(parsed.error, parsed.status);
    const hit = cache.get(parsed.cacheKey, now());
    if (hit !== null) return success(hit);
    const limit = rateLimiter.check(clientKey(req.headers), now());
    if (!limit.ok) return error('rate_limited', 429, { 'Retry-After': String(limit.retryAfterSec) });

    try {
      const apiKey = (getApiKey() || '').trim();
      const upstream = await fetchImpl(weatherUrl(parsed.query, apiKey), {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error',
      });
      if (!upstream.ok) return error('upstream_error', 502);
      const value = await upstream.json();
      if (!value || typeof value !== 'object' || Array.isArray(value)) return error('upstream_error', 502);
      const body = JSON.stringify(value);
      // Success responses normally contain only weather. Fail closed if an upstream
      // ever echoes the secret, rather than returning it or mutating the data shape.
      if (apiKey && body.includes(JSON.stringify(apiKey).slice(1, -1))) return error('upstream_error', 502);
      cache.set(parsed.cacheKey, body, parsed.ttlMs, now());
      return success(body);
    } catch {
      // Fetch/JSON errors can contain the upstream URL and its key. Never log or
      // return the exception, upstream body, or URL.
      return error('upstream_error', 502);
    }
  };
}
