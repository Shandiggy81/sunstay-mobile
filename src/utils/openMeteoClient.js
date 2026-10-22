// Switch off once the paid plan and weather function are enabled everywhere.
export const ALLOW_DIRECT_OPEN_METEO = true;

const WEATHER_KINDS = new Set(['forecast', 'hourly', 'air']);

/** Keep the callers' Response parsing, caches and abort/timeout budgets intact. */
export async function fetchOpenMeteoResponse(kind, lat, lng, {
  signal,
  directUrl,
  fetchImpl = fetch,
  supabaseUrl = import.meta.env?.VITE_SUPABASE_URL,
  anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY,
  allowDirect = ALLOW_DIRECT_OPEN_METEO,
} = {}) {
  if (!WEATHER_KINDS.has(kind)) throw new Error('Unsupported weather kind');

  const checkAbort = () => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  };
  const fetchDirect = () => {
    checkAbort();
    if (!allowDirect || !directUrl) throw new Error('Weather service unavailable');
    return fetchImpl(directUrl, { signal });
  };

  checkAbort();
  if (!supabaseUrl || !anonKey) return fetchDirect();

  let response;
  try {
    const url = new URL(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/weather`);
    url.search = new URLSearchParams({ kind, lat: String(lat), lng: String(lng) }).toString();
    response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal,
    });
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError' || !allowDirect) throw error;
    return fetchDirect();
  }

  if (!response.ok && allowDirect) return fetchDirect();
  return response;
}
