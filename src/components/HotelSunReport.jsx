import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Printer, Share2 } from 'lucide-react';
import ClayIcon from './common/ClayIcon.jsx';
import { DEFAULT_TIME_ZONE, formatGuestDate, venueLocalDate } from '../utils/balconySunEngine.js';
import { buildHotelSunReport } from '../utils/hotelSunReport.js';
import { hotelSunReportUrl } from '../utils/hotelSunReportRoute.js';
import '../styles/hotel-sun-report.css';

function RoomReport({ room, year }) {
  const titleId = useId();
  return (
    <article className="ss-sun-report__room rounded-3xl" aria-labelledby={titleId}>
      <div className="ss-sun-report__room-heading">
        <div className="ss-sun-report__room-icon"><ClayIcon name="hotel-views" size={44} /></div>
        <h2 id={titleId}>{room.name}</h2>
      </div>

      {room.error ? <p className="ss-sun-report__notice">Sun estimates are unavailable for this room side. Its location or room-side details need to be checked.</p> : (
        <>
          <div className={`ss-sun-report__total${room.totalMinutes > 0 ? ' ss-sun-report__total--sunny' : ''}`}>
            <div>
              <p className="ss-sun-report__duration">{room.durationText}</p>
              <p>{room.totalMinutes > 0 ? 'of direct sun today' : 'No modelled direct sun today'}</p>
            </div>
            <ClayIcon name={room.totalMinutes > 0 ? 'sun' : 'shaded'} size={68} />
          </div>

          <figure className="ss-sun-report__chart">
            <figcaption>
              <h3>Sun through the year</h3>
              <p>Hours of direct sun · 15th of each month, {year}</p>
            </figcaption>
            <ol className="ss-sun-report__months" aria-label="Monthly direct sun in hours">
              {room.monthly.map(month => (
                <li key={month.month} aria-label={`${month.label}: ${month.hours} hours of direct sun`}>
                  <span className="ss-sun-report__month-hours" aria-hidden="true">{month.hours}</span>
                  <span className="ss-sun-report__bar-track" aria-hidden="true">
                    <span className={`ss-sun-report__bar${month.totalMinutes > 0 ? ' ss-sun-report__bar--sunny' : ''}`} style={{ height: `${month.barPercent}%` }} />
                  </span>
                  <span className="ss-sun-report__month-label" aria-hidden="true">{month.label}</span>
                </li>
              ))}
            </ol>
          </figure>

          <div className="ss-sun-report__sunniest">
            <span><ClayIcon name="sun-cloud" size={24} />Sunniest months</span>
            {room.sunniestMonths.length ? <ul aria-label="Sunniest months">{room.sunniestMonths.map(month => <li key={month}>{month}</li>)}</ul>
              : <p>No modelled direct sun</p>}
          </div>

          <div className="ss-sun-report__seasons">
            {room.seasons.map(season => (
              <section className="ss-sun-report__season" key={season.key} aria-label={`${season.label} sun moments`}>
                <h3>{season.label}<span>{formatGuestDate(`${season.date}T12:00:00Z`, 'UTC')}</span></h3>
                <ul className="ss-sun-report__moments">
                  {season.moments.map(moment => (
                    <li key={moment.key} className={`ss-sun-report__moment${moment.available ? ' ss-sun-report__moment--sunny' : ''}`}>
                      <ClayIcon name={moment.icon} size={30} />
                      <span><strong>{moment.title}</strong><small>{moment.available ? 'Gets direct sun' : moment.available === null ? 'Unavailable' : 'In the shade'}</small></span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

/** A shareable, printable view; the portal keeps app chrome outside the print document. */
export default function HotelSunReport({ venue, onClose, loading = false }) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();
  const [now, setNow] = useState(() => new Date());
  const nowRef = useRef(now);
  nowRef.current = now;
  const [prepared, setPrepared] = useState(null);
  const [shareStatus, setShareStatus] = useState('');
  const [copyLink, setCopyLink] = useState('');
  let today = null;
  try { today = venueLocalDate(now, venue?.timeZone ?? venue?.timezone ?? DEFAULT_TIME_ZONE); }
  catch { /* The report helper supplies a visible error for invalid venue data. */ }

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  useEffect(() => {
    setPrepared(null);
    setShareStatus('');
    setCopyLink('');
    if (!venue || loading) return undefined;
    let cancelled = false;
    let idle, timer;
    const calculate = () => {
      if (cancelled) return;
      try {
        const report = buildHotelSunReport(venue, { now: nowRef.current, ...(today ? { date: today } : {}) });
        if (!cancelled) setPrepared({ venue, date: today, report });
      } catch {
        if (!cancelled) setPrepared({ venue, date: today, error: true });
      }
    };
    // Let the page paint before calculating the representative days for every room side.
    const frame = window.requestAnimationFrame(() => {
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(calculate, { timeout: 800 });
      else timer = window.setTimeout(calculate, 0);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [venue, today, loading]);

  useEffect(() => {
    const previous = document.activeElement;
    const root = document.getElementById('root');
    const wasInert = root?.inert;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (root) root.inert = true;
    dialog.current?.querySelector('button')?.focus({ preventScroll: true });
    const handleKeyDown = event => {
      // A global connection dialog can temporarily take focus above this page.
      if (event.defaultPrevented || !dialog.current?.contains(event.target)) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current?.(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...(dialog.current?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? [])]
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      if (root) root.inert = wasInert;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const report = prepared?.venue === venue && prepared?.date === today ? prepared.report : null;
  const failed = prepared?.venue === venue && prepared?.date === today && prepared.error;
  const busy = loading || Boolean(venue && !report && !failed);
  const venueName = venue?.venueName || venue?.name || 'Hotel';
  const venueAddress = venue?.address || venue?.full_street_address;

  const share = async () => {
    const url = hotelSunReportUrl(window.location.href, venue.id);
    setShareStatus('');
    setCopyLink('');
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `${venueName} · Sun report`, url });
        setShareStatus('Report shared.');
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('Report link copied.');
    } catch {
      setCopyLink(url);
      setShareStatus('Select and copy the report link below.');
    }
  };

  return createPortal(
    <div ref={dialog} className="ss-sun-report" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="ss-sun-report__toolbar ss-sun-report__screen-only">
        <div className="ss-sun-report__toolbar-inner">
          <button className="ss-sun-report__button" type="button" onClick={onClose}><ArrowLeft size={18} aria-hidden="true" />Back</button>
          <div className="ss-sun-report__actions">
            <button className="ss-sun-report__button" type="button" onClick={() => window.print()} disabled={!report}><Printer size={18} aria-hidden="true" />Print</button>
            {venue?.id != null && <button className="ss-sun-report__button ss-sun-report__button--primary" type="button" onClick={share}><Share2 size={18} aria-hidden="true" />Share</button>}
          </div>
        </div>
      </div>

      <main className="ss-sun-report__document">
        <header className="ss-sun-report__header">
          <div className="ss-sun-report__hero-icon"><ClayIcon name="hotel-views" size={82} /></div>
          <p className="ss-sun-report__eyebrow">Sun report</p>
          <h1 id={titleId}>{venue ? venueName : loading ? 'Finding your hotel' : 'Hotel not found'}</h1>
          {venueAddress && <p className="ss-sun-report__address">{venueAddress}</p>}
          <p className="ss-sun-report__subtitle">Room sun report · estimated from City of Melbourne building data</p>
          {report && <p className="ss-sun-report__date">Today · {formatGuestDate(`${report.date}T12:00:00Z`, 'UTC')}</p>}
        </header>

        <div className="ss-sun-report__share-feedback ss-sun-report__screen-only">
          <p role="status" aria-live="polite">{shareStatus}</p>
          {copyLink && <label>Report link<input readOnly value={copyLink} onFocus={event => event.target.select()} /></label>}
        </div>

        {busy ? <div className="ss-sun-report__notice" role="status"><ClayIcon name="sun" size={40} /><p>{loading ? 'Finding your hotel…' : 'Calculating your room sun report…'}</p></div>
          : !venue ? <p className="ss-sun-report__notice">This hotel could not be found. Go back to explore stays and open a new sun report.</p>
          : failed ? <p className="ss-sun-report__notice" role="alert">We could not calculate this sun report. Go back and try opening it again.</p>
          : report && <>
            <p className="ss-sun-report__explanation">See when direct sun is estimated to reach each room side. These are sun-path and building estimates, not a weather forecast; cloud, curtains and unrecorded obstructions can change the sun you experience.</p>
            {report.rooms.length ? <div className="ss-sun-report__rooms">{report.rooms.map(room => <RoomReport key={room.id} room={room} year={report.year} />)}</div>
              : <p className="ss-sun-report__notice">Room-side sun data is not available for this hotel yet.</p>}

            {report.rooms.some(room => room.totalMinutes != null) && report.summary.length > 0 && <section className="ss-sun-report__summary rounded-3xl" aria-labelledby={`${titleId}-summary`}>
              <h2 id={`${titleId}-summary`}>Find your sun moment</h2>
              <p>Best room sides for today&apos;s direct sun, among available estimates</p>
              <ul>{report.summary.map(moment => <li key={moment.key}>
                <ClayIcon name={moment.icon} size={40} />
                <span><strong>Best for {moment.title.toLowerCase()}</strong><span>{moment.roomName || 'No room side gets direct sun at this time today'}</span></span>
              </li>)}</ul>
            </section>}
            <footer className="ss-sun-report__footer">Monthly bars use the 15th of each month in {report.year}. Summer and winter moments use 15 January and 15 July in the hotel&apos;s local time. Sunniest months rank those representative days; actual days and individual rooms may differ.</footer>
          </>}
      </main>
    </div>, document.body,
  );
}
