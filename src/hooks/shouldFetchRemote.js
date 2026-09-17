/**
 * Gate for VenueCard extra weather fetches (AQ / UV / Tomorrow / hourly strip).
 * Callers pass enabled=false until the forecast accordion is opened.
 */
export function shouldFetchRemote({ enabled = true, lat, lng } = {}) {
  if (!enabled) return false;
  if (lat == null || lng == null || lat === '' || lng === '') return false;
  const latN = Number(lat);
  const lngN = Number(lng);
  return Number.isFinite(latN) && Number.isFinite(lngN);
}
