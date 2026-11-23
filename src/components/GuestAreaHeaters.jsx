import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { venuePublishing } from '../utils/venuePublishing.js';
import { currentAreaReports, reportTime } from '../utils/venueAreaReports.js';
import ClayIcon from './common/ClayIcon.jsx';
import DemoAreaBooking from './DemoAreaBooking.jsx';
import './VenuePublishing.css';

export default function GuestAreaHeaters({ venue, reports }) {
  const [areas, setAreas] = useState([]), [selected, setSelected] = useState(''), [booking, setBooking] = useState(null);
  useEffect(() => {
    let alive = true;
    venuePublishing(supabase).areas(venue.id).then(values => {
      if (alive) { setAreas(values); setSelected(values[0]?.area_id ?? ''); }
    }).catch(() => { if (alive) setAreas([]); });
    return () => { alive = false; };
  }, [venue.id]);
  const current = useMemo(() => currentAreaReports(reports), [reports]);
  const area = areas.find(value => value.area_id === selected);
  const report = current.find(value => value.area_id === selected);
  if (!areas.length) return null;
  return <section className="ss-guest-area-reports" aria-label="Venue staff reports">
    <h3>At the venue</h3>
    <label>Choose an area<select value={selected} onChange={event => setSelected(event.target.value)}>
      {areas.map(value => <option key={value.area_id} value={value.area_id}>{value.area_name}</option>)}
    </select></label>
    {report ? <div className="ss-guest-report"><ClayIcon name="heater" size={36} /><div>
      <strong>{report.area_name}: heaters {report.heaters_on ? 'on' : 'off'}</strong>
      <span>Confirmed by venue staff</span><small>{reportTime(report, { timeZone: venue.timeZone ?? venue.timezone ?? 'Australia/Melbourne' })}</small>
    </div></div> : <p className="ss-publish-meta">No current staff report for this area.</p>}
    <button type="button" className="ss-publish-demo-action" onClick={event => { event.currentTarget.focus({ preventScroll: true }); setBooking(area); }}><CalendarDays size={18} aria-hidden="true" />Book this area · Demo</button>
    {booking ? <DemoAreaBooking venue={venue} area={booking} onClose={() => setBooking(null)} /> : null}
  </section>;
}
