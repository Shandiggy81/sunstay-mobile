import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { currentAreaReports, reportFeatures, REPORT_POLL_MS } from '../utils/venueAreaReports.js';
import { REPORTS_CHANGED_EVENT, venuePublishing } from '../utils/venuePublishing.js';

// One shared read per visible app, independent of weather and map availability.
export function usePublishedVenueReports(previewFeatures) {
  const [rows, setRows] = useState([]);
  const refreshRef = useRef(() => {});
  useEffect(() => {
    let alive = true, loading = false, unavailable = false;
    const api = venuePublishing(supabase);
    const refresh = async () => {
      if (!alive || loading || !supabase || document.visibilityState === 'hidden') return;
      loading = true;
      try {
        const values = await api.reports();
        if (alive) setRows(previous => JSON.stringify(previous) === JSON.stringify(values) ? previous : values);
        unavailable = false;
      } catch (error) {
        if (error.code === 'unavailable') unavailable = true;
        // Keep a last successful reading only until its own expiry, never renew it.
      } finally { loading = false; }
    };
    refreshRef.current = refresh;
    void refresh();
    const poll = setInterval(() => { if (!unavailable) void refresh(); }, REPORT_POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener(REPORTS_CHANGED_EVENT, refresh);
    return () => {
      alive = false; clearInterval(poll);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener(REPORTS_CHANGED_EVENT, refresh);
    };
  }, []);
  useEffect(() => {
    const next = Math.min(...rows.map(row => Date.parse(row.expires_at)));
    if (!Number.isFinite(next)) return undefined;
    const timer = setTimeout(() => setRows(previous => currentAreaReports(previous)), Math.min(Math.max(0, next - Date.now() + 1), 2147483647));
    return () => clearTimeout(timer);
  }, [rows]);
  const features = useMemo(() => reportFeatures(previewFeatures, rows), [previewFeatures, rows]);
  const refresh = useCallback(() => refreshRef.current(), []);
  return { reports: rows, features, refresh };
}
