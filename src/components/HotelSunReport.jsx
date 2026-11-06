import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Printer, Share2, ChevronDown } from 'lucide-react';
import ClayIcon from './common/ClayIcon.jsx';
import { DEFAULT_TIME_ZONE, formatGuestDate, venueLocalDate } from '../utils/balconySunEngine.js';
import { buildStaySunReport } from '../utils/stayRoomTypes.js';
import { hotelSunReportUrl } from '../utils/hotelSunReportRoute.js';
import { bestSideRows, sideRows, sidesSubtitle, defaultOpenSideId, sunniestMonthsText, seasonTable, sharedEvidence, reportTrustText, reportWords } from '../utils/sunReportLayout.js';
import { formatHours, yearSunChart } from '../utils/yearSunChart.js';
import '../styles/hotel-sun-report.css';

function melbourneNow(timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  const get = type => Number(parts.find(part => part.type === type)?.value);
  return { year: get('year'), month: get('month') };
}

/** Smooth amber area of monthly sun hours, like the app's daily sun graph (utils/yearSunChart). */
function YearSunChart({ monthly, year, sharedMax }) {
  const gradientId = useId();
  const now = melbourneNow();
  const chart = yearSunChart(monthly, { currentMonth: now.year === Number(year) ? now.month : null, maxHours: sharedMax });
  if (!chart) return null;
  const nowPoint = chart.callouts.find(c => c.kind === 'now');
  const edge = x => (x < 12 ? 'ss-year-chart__callout--start' : x > 88 ? 'ss-year-chart__callout--end' : '');
  return (
    <div className="ss-year-chart">
      <div className="ss-year-chart__plot">
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-amber-200)" />
              <stop offset="1" stopColor="var(--color-accent)" />
            </linearGradient>
          </defs>
          {chart.ticks.map(tick => <line key={tick.hours} x1="0" x2={chart.width} y1={tick.y} y2={tick.y} className="ss-year-chart__grid" vectorEffect="non-scaling-stroke" />)}
          <path d={chart.area} fill={`url(#${gradientId})`} />
          {nowPoint && <line x1={nowPoint.x} x2={nowPoint.x} y1={nowPoint.y} y2={chart.baseline} className="ss-year-chart__now-line" vectorEffect="non-scaling-stroke" />}
          <line x1="0" x2={chart.width} y1={chart.baseline} y2={chart.baseline} className="ss-year-chart__baseline" vectorEffect="non-scaling-stroke" />
        </svg>
        {chart.ticks.map(tick => <span key={tick.hours} className="ss-year-chart__tick" style={{ top: `${tick.yPercent}%` }} aria-hidden="true">{tick.label}</span>)}
        {/* The clay sun on the sunniest month, like the daily graph's peak; shaded when there is no direct sun all year. */}
        <span className={`ss-year-chart__sun ss-year-chart__sun--${chart.sun.kind}`} style={{ left: `${chart.sun.xPercent}%`, top: `${chart.sun.yPercent}%` }} aria-hidden="true">
          <ClayIcon name={chart.sun.kind === 'sun' ? 'sun' : 'shaded'} size={28} />
        </span>
        {chart.callouts.map(c => {
          const onSun = c.placement === 'sun';
          const x = onSun ? chart.sun.xPercent : c.xPercent;
          return (
            <React.Fragment key={c.month}>
              {!onSun && <span className={`ss-year-chart__dot ss-year-chart__dot--${c.kind}`} style={{ left: `${c.xPercent}%`, top: `${c.yPercent}%` }} aria-hidden="true" />}
              <span className={`ss-year-chart__callout ss-year-chart__callout--${c.kind} ss-year-chart__callout--${c.placement} ${edge(x)}`} style={{ left: `${x}%`, top: `${c.yPercent}%` }} aria-hidden="true">{c.text}</span>
            </React.Fragment>
          );
        })}
      </div>
      <ol className="ss-year-chart__months" aria-label="Monthly direct sun in hours">
        {chart.points.map(p => (
          <li key={p.month} className={p.month === nowPoint?.month ? 'ss-year-chart__month--now' : undefined}
            aria-label={`${p.label}: ${formatHours(p.hours).replace('h', '')} hours of direct sun`}>
            <span aria-hidden="true">{p.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The sunniest month across every room, so all of a report's year charts share one axis. */
const reportMaxHours = rooms => Math.max(0, ...rooms.flatMap(room => (room.monthly ?? []).map(m => m.hours)).filter(Number.isFinite));

function RoomReport({ room, side, year, sharedMax, initiallyOpen, showEvidence }) {
  const titleId = useId();
  const panelId = `${titleId}-panel`;
  const [open, setOpen] = useState(initiallyOpen);
  const table = seasonTable(room.seasons);
  return (
    <article className="ss-sun-report__side" aria-labelledby={titleId}>
      <button id={titleId} type="button" className="ss-sun-report__side-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
        <span className="ss-sun-report__side-label">
          <span>{side.name}</span>
          {side.share !== null && <span className="ss-sun-report__side-bar" aria-hidden="true"><span style={{ width: `${side.share * 100}%` }} /></span>}
          {showEvidence && room.display && <span className="ss-sun-report__side-evidence">{room.display.chip ?? room.display.evidenceLabel}</span>}
        </span>
        <span className="ss-sun-report__side-duration">{side.durationText}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div id={panelId} className="ss-sun-report__side-panel" hidden={!open}>
        {room.error ? <p className="ss-sun-report__notice">Sun estimates are unavailable for this {room.display?.kind === 'facade_side' ? 'side of the building' : 'room'}. Its location or bearing needs to be checked.</p> : <>
          <figure className="ss-sun-report__chart">
            <figcaption>
              <h3>Through the year</h3>
              <p>Hours of direct sun on the 15th of each month, {year}</p>
            </figcaption>
            <YearSunChart monthly={room.monthly} year={year} sharedMax={sharedMax} />
          </figure>
          <p className="ss-sun-report__sunniest">{sunniestMonthsText(room.sunniestMonths) ?? 'No modelled direct sun'}</p>
          <section className="ss-sun-report__season-section" aria-labelledby={`${titleId}-seasons`}>
            <h3 id={`${titleId}-seasons`}>Summer and winter</h3>
            <table className="ss-sun-report__season-table">
              <thead><tr>
                <th scope="col">Time of day</th>
                {table.columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}
              </tr></thead>
              <tbody>{table.rows.map(row => <tr key={row.key}>
                <th scope="row"><span className="ss-sun-report__moment-title"><ClayIcon name={row.icon} size={24} />{row.title}</span></th>
                {row.cells.map((cell, index) => <td key={table.columns[index].key}>
                  <span className={`ss-sun-report__season-status ss-sun-report__season-status--${cell}`}>
                    {cell === 'sun' ? <><ClayIcon name="sun" size={18} />Sun</>
                      : cell === 'some' ? <><ClayIcon name="sun" size={18} className="ss-sun-report__some-sun" />Some sun</>
                      : cell === 'shade' ? <><span className="ss-sun-report__shade-dot" aria-hidden="true" />Shade</> : 'Unavailable'}
                  </span>
                </td>)}
              </tr>)}</tbody>
            </table>
          </section>
        </>}
      </div>
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
        const report = buildStaySunReport(venue, { now: nowRef.current, ...(today ? { date: today } : {}) });
        if (!cancelled) setPrepared({ venue, date: today, report });
      } catch {
        if (!cancelled) setPrepared({ venue, date: today, error: true });
      }
    };
    // Let the page paint before calculating the representative days for every side.
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
  const firstOpenSide = defaultOpenSideId(report?.rooms);
  const evidence = sharedEvidence(report?.rooms);
  const trustText = reportTrustText(report);
  const words = reportWords(report?.display?.mode);
  const dateLabel = today ? formatGuestDate(`${today}T12:00:00Z`, 'UTC') : null;

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
            <button className="ss-sun-report__button ss-sun-report__button--icon" type="button" onClick={() => window.print()} disabled={!report} aria-label="Print"><Printer size={18} aria-hidden="true" /></button>
            {venue?.id != null && <button className="ss-sun-report__button ss-sun-report__button--primary" type="button" onClick={share}><Share2 size={18} aria-hidden="true" />Share</button>}
          </div>
        </div>
      </div>

      <main className="ss-sun-report__document">
        <header className="ss-sun-report__header">
          <p className="ss-sun-report__eyebrow">Sun report{dateLabel ? ` · ${dateLabel}` : ''}</p>
          <div className="ss-sun-report__header-main">
            <div className="ss-sun-report__icon-tile"><ClayIcon name="hotel-views" size={40} /></div>
            <div>
              <h1 id={titleId}>{venue ? venueName : loading ? 'Finding your hotel' : 'Hotel not found'}</h1>
              {venueAddress && <p className="ss-sun-report__address">{venueAddress}</p>}
            </div>
          </div>
          {trustText && <p className="ss-sun-report__trust-line">{trustText}</p>}
        </header>

        <div className="ss-sun-report__share-feedback ss-sun-report__screen-only">
          <p role="status" aria-live="polite">{shareStatus}</p>
          {copyLink && <label>Report link<input readOnly value={copyLink} onFocus={event => event.target.select()} /></label>}
        </div>

        {busy ? <div className="ss-sun-report__notice" role="status"><ClayIcon name="sun" size={40} /><p>{loading ? 'Finding your hotel…' : 'Calculating your sun report…'}</p></div>
          : !venue ? <p className="ss-sun-report__notice">This hotel could not be found. Go back to explore stays and open a new sun report.</p>
          : failed ? <p className="ss-sun-report__notice" role="alert">We could not calculate this sun report. Go back and try opening it again.</p>
          : report && <>
            {report.rooms.some(room => room.totalMinutes != null) && report.summary.length > 0 && <section className="ss-sun-report__summary" aria-labelledby={`${titleId}-summary`}>
              <h2 id={`${titleId}-summary`}>{words.best}</h2>
              <p className="ss-sun-report__section-subtitle">Where direct sun reaches at each time of day.</p>
              <ul>{bestSideRows(report).map(moment => <li key={moment.key}>
                <ClayIcon name={moment.icon} size={32} />
                <span className="ss-sun-report__summary-moment"><strong>{moment.title}</strong><span>{moment.window}</span></span>
                {moment.side === null ? <span className="ss-sun-report__summary-side ss-sun-report__summary-side--empty">No direct sun</span>
                  : <span className={`ss-sun-report__summary-side${moment.fit === 'some' ? ' ss-sun-report__summary-side--some' : ''}`}>
                    <strong>{moment.side}</strong>{moment.sun && <span>{moment.sun}</span>}
                  </span>}
              </li>)}</ul>
            </section>}
            {report.rooms.length ? <section className="ss-sun-report__sides" aria-labelledby={`${titleId}-sides`}>
              <h2 id={`${titleId}-sides`}>{words.list}</h2>
              <p className="ss-sun-report__section-subtitle">{sidesSubtitle(report)}</p>
              {sideRows(report.rooms).map((side, index) => <RoomReport key={side.id} side={side} room={report.rooms[index]} year={report.year}
                sharedMax={reportMaxHours(report.rooms)} initiallyOpen={side.id === firstOpenSide} showEvidence={evidence === null} />)}
            </section> : <p className="ss-sun-report__notice">Sun by side of the building is not available for this hotel yet.</p>}
            <footer className="ss-sun-report__footer">Estimates from the sun&apos;s path and nearby buildings, not a weather forecast. Cloud, curtains and unrecorded obstructions can change the sun you get. &ldquo;Only&rdquo; and &ldquo;Some sun&rdquo; mean direct sun for less than half of that time of day. The year uses the 15th of each month in {report.year}; summer and winter use 15 January and 15 July in the hotel&apos;s local time.</footer>
          </>}
      </main>
    </div>, document.body,
  );
}
