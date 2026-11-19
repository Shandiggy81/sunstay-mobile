import { currentAreaReport, currentAreaReports, guestArea } from './venueAreaReports.js';

export const REPORTS_CHANGED_EVENT = 'sunstay:published-area-reports';
const failure = code => Object.assign(new Error(code), { code });

function publicError(error) {
  if (error?.code === '42501') return 'not_authorized';
  if (error?.code === '54000') return 'rate_limited';
  if (error?.code === 'PGRST202' || error?.code === '42883') return 'unavailable';
  return 'save_unconfirmed';
}

export function venuePublishing(client) {
  async function rpc(name, args) {
    if (!client) throw failure('unavailable');
    const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(10000));
    if (error) throw failure(publicError(error));
    return data;
  }
  return {
    async reports(venueId = null) {
      return currentAreaReports(await rpc('get_venue_area_heaters', { p_venue_id: venueId }));
    },
    async areas(venueId, { managed = false } = {}) {
      const rows = await rpc(managed ? 'get_managed_venue_areas' : 'get_venue_guest_areas', { p_venue_id: venueId });
      return Array.isArray(rows) ? rows.slice(0, 20).map(row => guestArea(row, venueId)).filter(Boolean) : [];
    },
    async publish({ venueId, areaId, heatersOn, minutes, requestId }) {
      if (typeof heatersOn !== 'boolean' || ![30, 60, 120, 240].includes(minutes)) throw failure('invalid_report');
      const saved = await rpc('publish_venue_area_heaters', { p_venue_id: venueId, p_area_id: areaId,
        p_heaters_on: heatersOn, p_valid_for_minutes: minutes, p_request_id: requestId });
      const report = currentAreaReport(saved);
      if (!report || report.venue_id !== venueId || report.area_id !== areaId || report.heaters_on !== heatersOn)
        throw failure('save_unconfirmed');
      return report;
    },
  };
}
