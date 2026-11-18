import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, LogOut, Send } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { venuePublishing, REPORTS_CHANGED_EVENT } from '../utils/venuePublishing.js';
import { reportTime } from '../utils/venueAreaReports.js';
import VenueActionDialog from './common/VenueActionDialog.jsx';
import ClayIcon from './common/ClayIcon.jsx';

const messages = {
  unavailable: 'Venue publishing is not available yet. Your listing has not changed.',
  not_authorized: 'This account is not an active manager for this venue.',
  rate_limited: 'Please wait a minute before publishing another update.',
  invalid_report: 'Choose an area and a valid report duration.',
  save_unconfirmed: 'Publication could not be confirmed. Retry to check the same update.',
};

export default function VenueManagerPanel({ venue, onClose }) {
  const api = useMemo(() => venuePublishing(supabase), []);
  const [session, setSession] = useState(null), [checking, setChecking] = useState(true);
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [codeSent, setCodeSent] = useState(false);
  const [areas, setAreas] = useState([]), [areaId, setAreaId] = useState('');
  const [on, setOn] = useState(false), [minutes, setMinutes] = useState(120), [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const inFlight = useRef(false), attempt = useRef(null), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!supabase) { setChecking(false); setError(messages.unavailable); return () => { alive.current = false; }; }
    let authEvent = false;
    supabase.auth.getSession().then(({ data }) => {
      if (alive.current && !authEvent) { setSession(data.session); setChecking(false); }
    }).catch(() => { if (alive.current) { setError('Sign-in could not be checked. Try again.'); setChecking(false); } });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      authEvent = true;
      if (alive.current) { setSession(next); setChecking(false); }
    });
    return () => { alive.current = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    setAreas([]); setAreaId(''); setSaved(null); setDirty(false); attempt.current = null;
    if (!session?.user?.id) return undefined;
    let current = true;
    setChecking(true); setError(''); setNotice('');
    api.areas(venue.id, { managed: true }).then(values => {
      if (!current) return;
      setAreas(values); setAreaId(values[0]?.area_id ?? '');
      if (!values.length) setError('No approved guest areas are assigned to this venue yet.');
    }).catch(reason => { if (current) setError(messages[reason.code] ?? messages.unavailable); })
      .finally(() => { if (current) setChecking(false); });
    return () => { current = false; };
  }, [session?.user?.id, venue.id, api]);

  async function run(action) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (reason) { if (alive.current) setError(messages[reason.code] ?? 'That action could not be confirmed. Please try again.'); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  function edit(change) {
    change(); setDirty(true); setSaved(null); setNotice(''); setError(''); attempt.current = null;
  }
  const selected = areas.find(area => area.area_id === areaId);
  return <VenueActionDialog title={`Manage ${venue.venueName || venue.name || 'this venue'}`} onClose={onClose} busy={busy}>
    {checking ? <p role="status">Checking venue access…</p> : null}
    {!checking && !session && supabase ? <form className="ss-publish-form" onSubmit={event => {
      event.preventDefault();
      void run(async () => {
        if (codeSent) {
          const { error: problem } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
          if (problem) throw Object.assign(new Error(), { code: 'signin_failed' });
          setCode(''); setEmail(''); setCodeSent(false);
        } else {
          const { error: problem } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
          if (problem) throw Object.assign(new Error(), { code: 'signin_failed' });
          setCodeSent(true); setNotice('Check your email for your sign-in code.');
        }
      });
    }}>
      <label>Email<input type="email" autoComplete="email" required value={email} disabled={busy || codeSent} onChange={event => setEmail(event.target.value)} /></label>
      {codeSent ? <label>Sign-in code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" minLength={6} maxLength={8} required value={code} disabled={busy} onChange={event => setCode(event.target.value)} /></label> : null}
      <button type="submit" className="ss-publish-primary" disabled={busy}><Send size={18} aria-hidden="true" />{busy ? 'Please wait…' : codeSent ? 'Sign in' : 'Send sign-in code'}</button>
      {codeSent ? <button type="button" disabled={busy} onClick={() => { setCodeSent(false); setCode(''); setNotice(''); }}>Use a different email</button> : null}
    </form> : null}
    {!checking && session && areas.length ? <form className="ss-publish-form" onSubmit={event => {
      event.preventDefault();
      if (!selected || !dirty) return;
      void run(async () => {
        attempt.current ??= crypto.randomUUID();
        const report = await api.publish({ venueId: venue.id, areaId, heatersOn: on, minutes, requestId: attempt.current });
        if (!alive.current) return;
        setSaved(report); setDirty(false); setNotice(`${report.area_name}: heaters ${report.heaters_on ? 'on' : 'off'} published.`);
        window.dispatchEvent(new Event(REPORTS_CHANGED_EVENT));
      });
    }}>
      <label>Guest area<select value={areaId} disabled={busy} onChange={event => edit(() => setAreaId(event.target.value))}>
        {areas.map(area => <option key={area.area_id} value={area.area_id}>{area.area_name}</option>)}
      </select></label>
      <button type="button" role="switch" aria-checked={on} disabled={busy} className="ss-publish-switch" onClick={() => edit(() => setOn(value => !value))}>
        <ClayIcon name="heater" size={42} /><span>Heaters on<small>{saved ? 'Published' : dirty ? on ? 'On' : 'Off' : 'Not reported in this form'}</small></span><span aria-hidden="true">{on ? 'On' : 'Off'}</span>
      </button>
      <label>Report valid for<select value={minutes} disabled={busy} onChange={event => edit(() => setMinutes(Number(event.target.value)))}>
        <option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={120}>2 hours</option><option value={240}>4 hours</option>
      </select></label>
      <button type="submit" className="ss-publish-primary" disabled={busy || !dirty}><Check size={18} aria-hidden="true" />{busy ? 'Publishing…' : 'Publish update'}</button>
    </form> : null}
    {notice ? <p role="status" className="ss-publish-status">{notice}</p> : null}
    {saved ? <p className="ss-publish-meta">Confirmed by venue staff · {reportTime(saved)}</p> : null}
    {error ? <p role="alert" className="ss-publish-error">{error}</p> : null}
    {session ? <button type="button" className="ss-publish-signout" disabled={busy} onClick={() => void run(async () => {
      const { error: problem } = await supabase.auth.signOut();
      if (problem) throw Object.assign(new Error(), { code: 'signout_failed' });
      setNotice('Signed out.');
    })}><LogOut size={18} aria-hidden="true" />Sign out</button> : null}
  </VenueActionDialog>;
}
