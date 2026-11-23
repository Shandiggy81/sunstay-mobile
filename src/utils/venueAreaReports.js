export const REPORT_POLL_MS = 15000;
export const REPORT_SOURCE = 'venue_staff';
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const kinds = new Set(['terrace', 'courtyard', 'beer_garden', 'indoor', 'other']);

export function guestArea(value, venueId = value?.venue_id) {
  if (!value || !uuid(value.area_id) || !text(value.venue_id, 200) || value.venue_id !== venueId
    || !text(value.area_name, 80) || !kinds.has(value.area_kind)) return null;
  return { area_id: value.area_id, venue_id: value.venue_id, area_name: value.area_name, area_kind: value.area_kind };
}

/** Keep only the public contract, even if a misconfigured endpoint adds private fields. */
export function currentAreaReport(value, now = Date.now()) {
  const area = guestArea(value);
  const updated = Date.parse(value?.updated_at), expires = Date.parse(value?.expires_at);
  if (!area || !uuid(value.report_id) || typeof value.heaters_on !== 'boolean' || value.source !== REPORT_SOURCE
    || (value.publication_state !== undefined && value.publication_state !== 'published')
    || !Number.isFinite(now) || !Number.isFinite(updated) || !Number.isFinite(expires)
    || updated > now + 60000 || expires <= now || expires <= updated || expires - updated > 4 * 3600000) return null;
  return { ...area, report_id: value.report_id, heaters_on: value.heaters_on, source: REPORT_SOURCE,
    updated_at: value.updated_at, expires_at: value.expires_at };
}

export function currentAreaReports(values, now = Date.now()) {
  if (!Array.isArray(values)) return [];
  const areas = new Set();
  return values.slice(0, 500).map(value => currentAreaReport(value, now)).filter(report => {
    if (!report || areas.has(report.area_id)) return false;
    areas.add(report.area_id); return true;
  });
}

/** Public reports override device-local warmth without turning one area into a whole-venue claim. */
export function reportFeatures(preview, reports, now = Date.now()) {
  const result = { ...preview };
  for (const report of currentAreaReports(reports, now)) {
    const prior = result[report.venue_id];
    const publishedReports = [...(prior?.publishedReports ?? []), report];
    result[report.venue_id] = { ...prior, publishedReports,
      heatersOn: publishedReports.some(value => value.heaters_on), fireplaceOn: false };
  }
  return result;
}

export function areaReportNote(features, now = Date.now()) {
  const reports = currentAreaReports(features?.publishedReports, now).filter(report => report.heaters_on);
  if (!reports.length) return null;
  return `${reports.map(report => report.area_name).join(', ')}: heaters on`;
}

export function areaReportPinLabel(venueName, features, { now = Date.now(), timeZone = 'Australia/Melbourne' } = {}) {
  const reports = currentAreaReports(features?.publishedReports, now).filter(report => report.heaters_on);
  if (!reports.length) return null;
  const format = value => new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(value));
  return `${venueName}, ${reports.map(report => `${report.area_name}: heaters on, venue staff, updated ${format(report.updated_at)}, until ${format(report.expires_at)}`).join('; ')}`;
}

export function reportTime(value, { timeZone = 'Australia/Melbourne' } = {}) {
  const updated = Date.parse(value?.updated_at), expires = Date.parse(value?.expires_at);
  if (!Number.isFinite(updated) || !Number.isFinite(expires)) return null;
  const format = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', timeZone });
  return `Updated ${format.format(updated)} · until ${format.format(expires)}`;
}
