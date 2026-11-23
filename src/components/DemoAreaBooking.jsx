import { useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import VenueActionDialog from './common/VenueActionDialog.jsx';
import { countDemoBooking, demoAreaBooking, demoBookingTimes } from '../utils/demoAreaBooking.js';

export default function DemoAreaBooking({ venue, area, onClose }) {
  const times = useMemo(() => demoBookingTimes(), []);
  const [time, setTime] = useState(times[0]), [party, setParty] = useState(2), [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const submitted = useRef(false);
  const display = value => new Intl.DateTimeFormat('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit',
    timeZone: venue.timeZone ?? venue.timezone ?? 'Australia/Melbourne' }).format(new Date(value));
  return <VenueActionDialog title="Demo booking" onClose={onClose}>
    <p className="ss-publish-demo">Demo only. No reservation, payment or message will be sent.</p>
    <h3>{venue.venueName || venue.name}</h3><p className="ss-publish-area-name">{area.area_name}</p>
    {receipt ? <div role="status" className="ss-publish-confirmation"><Check size={30} aria-hidden="true" /><h3>Demo choice confirmed</h3>
      <p>{receipt.area_name} · {display(receipt.time)} · {receipt.party_size} people</p><p>No real booking was made.</p></div>
      : <form className="ss-publish-form" onSubmit={event => {
        event.preventDefault(); if (submitted.current) return;
        const next = demoAreaBooking({ venueId: venue.id, venueName: venue.venueName || venue.name, area, time, partySize: party });
        if (!next) { setError('Choose a future time and a party size from 1 to 12.'); return; }
        submitted.current = true; setReceipt(next); countDemoBooking(window.sessionStorage);
      }}>
        <label>Time<select value={time} onChange={event => setTime(event.target.value)}>{times.map(value => <option key={value} value={value}>{display(value)}</option>)}</select></label>
        <label>Party size<input type="number" min={1} max={12} step={1} required value={party} onChange={event => setParty(Number(event.target.value))} /></label>
        {error ? <p role="alert" className="ss-publish-error">{error}</p> : null}
        <button type="submit" className="ss-publish-primary">Confirm demo choice</button>
      </form>}
  </VenueActionDialog>;
}
