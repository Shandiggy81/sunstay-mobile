import './VenueCard.css';
import React, { useEffect, useState } from 'react';
import { PARTNER_PREVIEW_NOTE } from '../utils/partnerTools.js';
import { formatHappyHourRange } from '../utils/happyHour.js';
import { X, Share2, Heart, ChevronRight, Check, Armchair, Users, Flame, Umbrella, Accessibility, Clock, CalendarDays, Camera, Store, MapPin } from 'lucide-react';
import ClayIcon from './common/ClayIcon';
import VenueIcon from './common/VenueIcon';
import LiveSunTimeline from './LiveSunTimeline';
import { OFFERINGS_PREVIEW } from '../utils/venueOfferings';
import { accessSourceLine } from '../utils/venueAccess.js';
import { PUBLIC_TOILET_CREDIT, publicToiletHours, publicToiletLine } from '../utils/publicToilets.js';
import { PHOTO_COMING_SOON_MESSAGE } from '../utils/demoDeadEnds';

const PHOTO_NOTICE_MS = 4500;

export const SECTION_TITLE = 'text-[17px] font-extrabold tracking-[-0.015em] text-slate-900';

// Score colour within the amber/slate palette. Shared by the stat row and
// the compact header so the number reads the same in both places.
export function scoreTone(score) {
  if (!Number.isFinite(score)) return 'text-slate-600';
  if (score >= 75) return 'text-amber-700';
  if (score >= 50) return 'text-amber-800';
  return 'text-slate-700';
}

export function formatScore(score) {
  return Number.isFinite(score) ? String(Math.round(score)) : '–';
}

const roundButton = 'ss-venue-round-button';

// The handle retains the card's existing drag-to-close gesture.
export function VenueHero({ onClose, onShare, shareLabel, canShare, saved, onToggleSave, onDragStart, compact = false }) {
  return (
    <div className="ss-venue-toolbar" aria-hidden={compact || undefined}>
      <div className="ss-venue-drag-target" onPointerDown={onDragStart} style={{ touchAction: 'none' }} aria-hidden="true">
        <span />
      </div>
      <div className="ss-venue-toolbar-actions">
        <button type="button" tabIndex={compact ? -1 : 0} onClick={onClose} className={roundButton} aria-label="Close venue details"><X size={20} /></button>
        <div className="flex gap-2">
          <button type="button" tabIndex={compact ? -1 : 0} onClick={onShare} disabled={!canShare} className={roundButton}
            aria-label={shareLabel === 'Share' ? 'Share venue' : shareLabel}><Share2 size={18} /></button>
          <button type="button" tabIndex={compact ? -1 : 0} onClick={onToggleSave} className={roundButton} aria-pressed={saved}
            aria-label={saved ? 'Saved on this device. Tap to remove' : 'Save on this device'}>
            <Heart size={18} className={saved ? 'fill-amber-300 text-amber-900' : ''} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function VenueInfoHeader({ icon, name, subtitle, children }) {
  return (
    <div className="ss-venue-info">
      <div className="ss-venue-icon-tile"><VenueIcon icon={icon} size={46} /></div>
      <div className="min-w-0 flex-1">
        <h2>{name}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

// The sun headline and weather row still read venueStatTiles' exact values,
// icon included, so "Raining" or "Sun has set" never sits beside a sun.
export function VenueSunNow({ tile }) {
  return (
    <dl aria-label="Current venue conditions" className="ss-venue-sun-now">
      <dt className="sr-only">{tile.label}</dt>
      <dd><ClayIcon name={tile.icon ?? 'sun'} size={32} /><span>{tile.value}</span></dd>
    </dl>
  );
}

export function VenueWeatherNow({ tiles, rainChance }) {
  const wind = tiles[1];
  return (
    <dl aria-label="Weather now" className="ss-venue-weather-now">
      {[
        { icon: 'windsock', label: `Wind${wind.note ? ` · ${wind.note}` : ''}`, value: wind.value },
        { icon: 'thermometer', label: 'Feels like', value: tiles[2].value },
        { icon: 'rain', label: 'Rain now', value: rainChance != null ? `${Math.round(rainChance)}%` : '–' },
      ].map(item => <div key={item.label}>
        <ClayIcon name={item.icon} size={28} /><dt>{item.label}</dt><dd>{item.value}</dd>
      </div>)}
    </dl>
  );
}

// Keep the provenance in words, without stacking badges and caveats.
export function VenueSunCaption({ source, buildingData, sunrise, sunset, timeZoneLabel }) {
  return (
    <p className="ss-venue-sun-caption" data-cafe-sun-source={buildingData ? '' : undefined}>
      {buildingData ? <>Direct sun on a clear day at the venue’s mapped point, {source?.basis?.replace(/^[A-Z]/, letter => letter.toLowerCase()) ?? 'estimated from mapped buildings'} within 150 m{source ? ` (${source.confidenceLabel.toLowerCase()})` : ''}. Awnings, umbrellas and trees aren’t included. </>
        : <>Sun and weather estimates from the sun’s path and available forecast; local shade may differ. </>}
      {sunrise ? <>Sunrise {sunrise} · </> : null}{sunset ? <>sunset {sunset}. </> : null}
      {timeZoneLabel}.
    </p>
  );
}

// ── 4. Today's sun ──────────────────────────────────────────
export function TodaysSun({ forecast, sentence }) {
  return (
    <section aria-labelledby="todays-sun-heading" className="flex flex-col gap-3">
      <h3 id="todays-sun-heading" className={SECTION_TITLE}>Today&rsquo;s sun</h3>
      {sentence ? <p className="text-[14px] font-medium leading-relaxed text-slate-500">{sentence}</p> : null}
      <LiveSunTimeline forecast={forecast} />
    </section>
  );
}

// Today's evening forecast uses the card's real clock, independently of map preview time.
export function TonightFeelSection({ view }) {
  if (!view) return null;
  return (
    <section aria-labelledby="tonight-feel-heading" data-tonight-feel className="ss-venue-summary-row">
      <ClayIcon name="night" size={32} />
      <div className="min-w-0">
        <h3 id="tonight-feel-heading">Tonight: {view.verdict}</h3>
        <p>{view.detail}</p>
        {view.warmth.length > 0 ? <p className="flex flex-wrap gap-x-3">
          {view.warmth.map(item => <span key={item.icon} className="inline-flex items-center gap-1"><ClayIcon name={item.icon} size={22} />{item.text}</span>)}
        </p> : null}
        <span className="sr-only">Open-Meteo hourly forecast · Melbourne evening</span>
      </div>
    </section>
  );
}

export function HourByHour({ items, forecastLabel }) {
  if (!items?.length) return null;
  return (
    <section aria-labelledby="hour-by-hour-heading" className="ss-venue-hourly">
      <div className="ss-venue-section-heading">
        <h3 id="hour-by-hour-heading" className={SECTION_TITLE}>Hour by hour</h3>
        <span>{forecastLabel}</span>
      </div>
      <div role="group" aria-label="Hour by hour forecast">
        <ol>
          {items.map(item => (
            <li key={item.key} className={item.isNow ? 'ss-venue-hour--now' : ''}
              aria-label={`${item.isNow ? 'Now' : item.label}: ${item.temp ?? '–'} degrees${item.rainChance != null ? `, ${item.rainChance}% chance of rain` : ''}`}>
              <span className="ss-venue-hour-label">{item.label}</span>
              <ClayIcon name={item.icon} size={28} />
              <span className="ss-venue-hour-temp">{item.temp != null ? `${item.temp}°` : '–'}</span>
              <span>{item.rainChance != null ? `${item.rainChance}%` : ''}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── 7. What this venue offers ───────────────────────────────
const offeringIcons = { 'garden-table': Armchair, 'large-groups': Users, fireplace: Flame, heater: Flame, umbrella: Umbrella, wheelchair: Accessibility };

export function VenueOfferingsList({ offerings, amenities = [] }) {
  const [showAll, setShowAll] = useState(false);
  // Key amenities can include facts not present in the longer offerings list.
  const extra = amenities.filter(a => !offerings.some(row => row.label === a.label));
  const visible = showAll ? offerings : offerings.slice(0, OFFERINGS_PREVIEW);
  if (!offerings.length && !extra.length) return null;
  return (
    <div>
      <ul>
        {[...visible, ...extra].map(row => {
          const Icon = offeringIcons[row.icon] ?? Check;
          return <li key={row.key} className="ss-venue-fact"><Icon size={22} aria-hidden="true" /><span>{row.label}</span></li>;
        })}
      </ul>
      {offerings.length > OFFERINGS_PREVIEW ? <button type="button" onClick={() => setShowAll(v => !v)} aria-expanded={showAll} className="ss-venue-text-action">
        {showAll ? 'Show fewer' : `Show all ${offerings.length} features`}
        <span className="sr-only">{showAll ? '' : ` (${offerings.length - visible.length} more)`}</span>
      </button> : null}
    </div>
  );
}

// Getting in and around: only stated facts; unknown says so plainly.
export function AccessSection({ access, publicToilet = null }) {
  if (!access) return null;
  return (
    <section aria-label="Getting in and around">
      <h4 className="sr-only">Getting in and around</h4>
      {access.facts.length ? <>
        <ul>{access.facts.map(fact => <li key={fact.key} className="ss-venue-fact">
          <Accessibility size={22} aria-hidden="true" /><span>{fact.tone === 'heads-up' ? <span className="sr-only">Heads-up: </span> : null}{fact.text}</span>
        </li>)}</ul>
        <p className="ss-venue-fact-source">{accessSourceLine(access)}</p>
      </> : <div className="ss-venue-fact"><Accessibility size={22} aria-hidden="true" /><p>Steps, lifts and toilets aren't confirmed for this venue yet. Worth a quick call before you go.</p></div>}
      {publicToilet ? <>
        <div className="ss-venue-fact"><MapPin size={22} aria-hidden="true" /><div>
          <p>{publicToiletLine(publicToilet)}</p>
          {publicToiletHours(publicToilet.hours) ? <p className="ss-venue-fact-detail">{publicToiletHours(publicToilet.hours)}</p> : null}
          <a href={publicToilet.url} target="_blank" rel="noopener noreferrer" className="ss-venue-text-action">{publicToilet.name} on the Toilet Map</a>
        </div></div>
        <p className="ss-venue-fact-source">{PUBLIC_TOILET_CREDIT}</p>
      </> : null}
    </section>
  );
}

export function AboutAndHours({ description, hours, websiteUrl }) {
  return <>
    {description ? <p className="ss-venue-description">{description}</p> : null}
    <div className="ss-venue-fact"><Clock size={22} aria-hidden="true" />
      <span>{hours.verified ? hours.text : hours.note}</span>
      {websiteUrl ? <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="ss-venue-text-action" aria-label="Check today’s hours on their website">Website</a> : null}
    </div>
  </>;
}

export function VenueSourceNote({ note }) {
  if (!note) return null;
  return <p aria-label="Listing source" className="ss-venue-source-note">
    {note.seats ? <>{note.seats} </> : null}{note.credit}{' '}
    {note.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>)}
  </p>;
}

export function HappyHourSection({ happyHour, fromPartnerPreview = false }) {
  if (!happyHour) return null;
  return <section aria-labelledby="happy-hour-heading" className="ss-venue-fact">
    <Clock size={22} aria-hidden="true" /><div>
      <h4 id="happy-hour-heading">{happyHour.start ? 'Happy hour' : 'Specials'}</h4>
      {happyHour.deal ? <p>{happyHour.deal}</p> : null}
      {happyHour.start && happyHour.end ? <p className="ss-venue-fact-detail">
        {Array.isArray(happyHour.days) && happyHour.days.length ? `${happyHour.days.join(', ')} · ` : ''}
        {formatHappyHourRange(happyHour.start, happyHour.end)}
      </p> : null}
      {fromPartnerPreview ? <p className="ss-venue-fact-source">{PARTNER_PREVIEW_NOTE}</p> : null}
    </div>
  </section>;
}

export function PartnerExtrasSection({ events = [], outdoor = [] }) {
  if (!events.length && !outdoor.length) return null;
  return <section aria-labelledby="partner-extras-heading">
    <h4 id="partner-extras-heading" className="sr-only">{events.length ? 'On here' : 'Outdoor setup'}</h4>
    {events.length ? <ul>{events.map(event => <li key={event.id} className="ss-venue-fact">
      <CalendarDays size={22} aria-hidden="true" /><div><p>{event.title}</p><p className="ss-venue-fact-detail">{event.when} · {event.kindLabel}</p></div>
    </li>)}</ul> : null}
    {outdoor.length ? <ul aria-label="Outdoor setup">{outdoor.map(chip => <li key={chip.key} className="ss-venue-fact"><Armchair size={22} aria-hidden="true" />{chip.label}</li>)}</ul> : null}
    <p className="ss-venue-fact-source">{PARTNER_PREVIEW_NOTE}</p>
  </section>;
}

// ── 9. Vibe + manage link ───────────────────────────────────
export function VibeSection({ onManage, venueName }) {
  const [photoNotice, setPhotoNotice] = useState(false);
  useEffect(() => {
    if (!photoNotice) return undefined;
    const timer = setTimeout(() => setPhotoNotice(false), PHOTO_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [photoNotice]);
  // Keep the existing device-local photo notice and immediately discard the file.
  const handlePhotoPicked = (event) => {
    const input = event.target;
    if (input.files?.length) setPhotoNotice(true);
    input.value = '';
  };
  return <div className="ss-venue-list-actions">
    <label className="ss-venue-list-action focus-within:ring-2 focus-within:ring-amber-400">
      <Camera size={22} aria-hidden="true" /><span><strong>How’s the vibe?</strong><span>Share what it’s like right now</span></span><ChevronRight size={20} aria-hidden="true" />
      <input aria-label="Capture the vibe" type="file" accept="image/*" capture="environment" className="sr-only" onChange={handlePhotoPicked} />
    </label>
    <p role="status" aria-live="polite" className={photoNotice ? 'ss-venue-fact-source' : 'sr-only'}>{photoNotice ? PHOTO_COMING_SOON_MESSAGE : ''}</p>
    {onManage ? <button type="button" onClick={onManage} className="ss-venue-list-action">
      <Store size={22} aria-hidden="true" /><span><strong>Run {venueName || 'this venue'}?</strong><span>Partner preview · changes stay on this device</span></span><ChevronRight size={20} aria-hidden="true" />
    </button> : null}
  </div>;
}
