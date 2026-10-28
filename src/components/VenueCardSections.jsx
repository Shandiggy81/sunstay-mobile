import React, { useEffect, useState } from 'react';
import { X, Share2, Heart, ChevronRight } from 'lucide-react';
import ClayIcon from './common/ClayIcon';
import DataBadge from './DataBadge.jsx';
import VenueIcon from './common/VenueIcon';
import LiveSunTimeline from './LiveSunTimeline';
import { OFFERINGS_PREVIEW } from '../utils/venueOfferings';
import { accessSourceLine } from '../utils/venueAccess.js';
import { PUBLIC_TOILET_CREDIT, publicToiletHours, publicToiletLine } from '../utils/publicToilets.js';
import { PHOTO_COMING_SOON_MESSAGE } from '../utils/demoDeadEnds';

const PHOTO_NOTICE_MS = 4500;

export const SECTION_TITLE = 'text-[19px] font-extrabold tracking-[-0.015em] text-slate-900';

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

const roundButton =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-[0_2px_10px_rgba(15,23,42,0.18)] transition-transform duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

// ── 1. Hero ─────────────────────────────────────────────────
export function VenueHero({
  name, imageUrl, icon, onClose, onShare, shareLabel, canShare, saved, onToggleSave, onDragStart,
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setLoaded(false); setFailed(false); }, [imageUrl]);
  const showPhoto = Boolean(imageUrl) && !failed;

  return (
    <div className="relative h-[280px] w-full shrink-0 overflow-hidden bg-gradient-to-br from-amber-100 via-amber-50 to-sky-100">
      {showPhoto ? (
        <>
          {!loaded ? <div className="absolute inset-0 animate-pulse bg-slate-200" aria-hidden="true" /> : null}
          <img
            src={imageUrl}
            alt={name}
            decoding="async"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
          {/* Keeps the white buttons legible on bright photos. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-900/30 to-transparent" aria-hidden="true" />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pb-8" aria-hidden="true">
          <div className="absolute h-56 w-56 rounded-full bg-white/50" />
          <VenueIcon icon={icon} size={150} className="relative drop-shadow-[0_12px_18px_rgba(146,64,14,0.18)]" />
        </div>
      )}

      {/* Drag surface: 44px tall, between the buttons, so the sheet still swipes closed. */}
      <div
        className="absolute left-1/2 top-0 z-[2] flex h-11 w-32 -translate-x-1/2 items-center justify-center lg:hidden"
        onPointerDown={onDragStart}
        style={{ touchAction: 'none' }}
        aria-hidden="true"
      >
        <div className="h-[5px] w-11 rounded-full bg-white/90 shadow-[0_1px_3px_rgba(15,23,42,0.25)]" />
      </div>

      <div className="absolute inset-x-0 top-3 z-[3] flex items-start justify-between px-4">
        <button type="button" onClick={onClose} className={roundButton} aria-label="Close venue details">
          <X size={20} strokeWidth={2.25} />
        </button>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onShare}
            disabled={!canShare}
            className={`${roundButton} disabled:opacity-50`}
            aria-label={shareLabel === 'Share' ? 'Share venue' : shareLabel}
          >
            <Share2 size={18} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={onToggleSave}
            className={roundButton}
            aria-pressed={saved}
            aria-label={saved ? 'Saved on this device. Tap to remove' : 'Save on this device'}
          >
            <Heart size={18} strokeWidth={2.25} className={saved ? 'fill-rose-500 text-rose-500' : ''} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 2. Info header ──────────────────────────────────────────
const pillClass =
  'inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-slate-900/[0.08] bg-slate-50 py-1.5 pl-1.5 pr-3.5 text-[14px] font-semibold text-slate-800 transition-colors active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

export function VenueInfoHeader({ icon, name, subtitle, websiteUrl, address, mapsUrl, amenities = [], perfectFor }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3.5">
        <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-[20px] bg-amber-50">
          <VenueIcon icon={icon} size={56} />
        </div>
        <div className="min-w-0">
          <h2 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-slate-900">{name}</h2>
          {subtitle ? <p className="mt-1 truncate text-[15px] font-medium text-slate-600">{subtitle}</p> : null}
        </div>
      </div>
      {amenities.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Good to know">
          {amenities.map((a) => (
            <li
              key={a.key}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 py-1 pl-1 pr-3 text-[14px] font-semibold text-amber-900"
            >
              <ClayIcon name={a.icon} size={26} />
              <span>{a.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {perfectFor ? (
        <p className="text-[13px] font-medium leading-relaxed text-slate-700">
          <span className="font-semibold text-amber-900">Perfect for:</span> {perfectFor}
        </p>
      ) : null}
      {(websiteUrl || address) ? (
        <div className="flex flex-wrap gap-2">
          {websiteUrl ? (
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className={pillClass}>
              <ClayIcon name="clock" size={28} />
              <span>Check today&rsquo;s hours</span>
            </a>
          ) : null}
          {address ? (
            mapsUrl ? (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={pillClass} aria-label={`Address: ${address}. Open in maps`}>
                <ClayIcon name="map-pin" size={28} />
                <span className="truncate">{address}</span>
              </a>
            ) : (
              <span className={pillClass}>
                <ClayIcon name="map-pin" size={28} />
                <span className="truncate">{address}</span>
              </span>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── 3. Stat row ─────────────────────────────────────────────
export function VenueStatRow({ tiles, sunny }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5" aria-label="Current venue conditions">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={`flex min-h-[132px] min-w-0 flex-col items-start gap-1.5 rounded-3xl border p-3.5 ${sunny
            ? 'border-amber-200 bg-amber-50 shadow-[0_4px_14px_rgba(245,158,11,0.10),inset_0_2px_0_rgba(255,255,255,0.8)]'
            : 'border-slate-200 bg-slate-50 shadow-[0_4px_14px_rgba(15,23,42,0.06),inset_0_2px_0_rgba(255,255,255,0.8)]'}`}
        >
          <ClayIcon name={tile.icon} size={44} className="drop-shadow-sm" />
          <dt className="text-[12px] font-semibold text-slate-600">{tile.label}</dt>
          <dd className="text-[17px] font-extrabold leading-tight tracking-[-0.01em] text-slate-900 tabular-nums">
            {tile.value}
            {tile.note ? <span className="mt-1 block text-[12px] font-medium text-slate-600">{tile.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── 4. Today's sun ──────────────────────────────────────────
export function TodaysSun({ forecast, sentence }) {
  return (
    <section aria-labelledby="todays-sun-heading" className="flex flex-col gap-3">
      <h3 id="todays-sun-heading" className={SECTION_TITLE}>Today&rsquo;s sun</h3>
      <p className="text-[15px] font-medium leading-relaxed text-slate-700">{sentence}</p>
      <LiveSunTimeline forecast={forecast} />
    </section>
  );
}

// Today's evening forecast uses the card's real clock, independently of map preview time.
export function TonightFeelSection({ view }) {
  if (!view) return null;
  return (
    <section aria-labelledby="tonight-feel-heading" data-tonight-feel
      className="ss-tonight-feel flex min-w-0 flex-col gap-3 rounded-3xl border border-amber-200/70 bg-[#FFFBF3] p-3.5">
      <div className="flex items-center gap-2.5">
        <ClayIcon name="night" size={36} />
        <div className="min-w-0">
          <h3 id="tonight-feel-heading" className={SECTION_TITLE}>How it feels tonight</h3>
          <div className="mt-1 [&_[data-marker]]:hidden">
            <DataBadge kind="forecast" source="Open-Meteo hourly forecast · Melbourne evening" size="sm" />
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2.5">
        <ClayIcon name={view.icon} size={30} />
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-snug text-slate-900">{view.verdict}</p>
          <p className="mt-1 text-[13px] font-medium leading-relaxed text-slate-600">{view.detail}</p>
        </div>
      </div>
      {view.warmth.length > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-2 border-t border-amber-200/60 pt-3 text-[13px] font-semibold leading-snug text-slate-700">
          {view.warmth.map(item => <span key={item.icon} className="inline-flex items-center gap-1.5">
            <ClayIcon name={item.icon} size={28} />{item.text}
          </span>)}
        </p>
      )}
    </section>
  );
}

// ── 5. Hour by hour ─────────────────────────────────────────
export function HourByHour({ items }) {
  if (!items?.length) return null;
  return (
    <section aria-labelledby="hour-by-hour-heading" className="flex flex-col gap-2">
      <h3 id="hour-by-hour-heading" className={SECTION_TITLE}>Hour by hour</h3>
      <div className="-mx-5 overflow-x-auto overscroll-x-contain px-3 scrollbar-hide rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-600"
        tabIndex={0} role="group" aria-label="Hour by hour forecast, scrolls sideways">
        <ol className="flex min-w-max">
          {items.map((item) => (
            <li
              key={item.key}
              className={`flex w-[62px] flex-col items-center gap-1.5 rounded-2xl py-3 ${item.isNow ? 'bg-amber-50' : ''}`}
              aria-label={`${item.isNow ? 'Now' : item.label}: ${item.temp ?? '–'} degrees${item.rainChance != null ? `, ${item.rainChance}% chance of rain` : ''}`}
            >
              <span className={`text-[13px] tabular-nums ${item.isNow ? 'font-extrabold text-amber-800' : 'font-semibold text-slate-600'}`}>
                {item.label}
              </span>
              <ClayIcon name={item.icon} size={34} />
              <span className="text-[16px] font-bold tabular-nums text-slate-900">{item.temp != null ? `${item.temp}°` : '–'}</span>
              <span className="text-[12px] font-semibold tabular-nums text-sky-700">
                {item.rainChance != null ? `${item.rainChance}%` : ''}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── 6. Conditions ───────────────────────────────────────────
export function ConditionsGrid({ tiles, children }) {
  return (
    <section aria-labelledby="conditions-heading" className="flex flex-col gap-3">
      <h3 id="conditions-heading" className={SECTION_TITLE}>Conditions</h3>
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex min-h-[108px] items-start justify-between gap-2 rounded-3xl border border-slate-900/[0.08] bg-white p-3.5 last:odd:col-span-2">
            <div className="min-w-0">
              <span className="block text-[13px] font-semibold text-slate-600">{tile.label}</span>
              <span className="mt-1 block text-[22px] font-extrabold leading-tight tracking-[-0.01em] tabular-nums text-slate-900">{tile.value}</span>
              {tile.note ? <span className="mt-0.5 block text-[12px] font-medium leading-snug text-slate-600">{tile.note}</span> : null}
            </div>
            <ClayIcon name={tile.icon} size={40} />
          </div>
        ))}
      </div>
      {children}
    </section>
  );
}

// ── 7. What this venue offers ───────────────────────────────
export function VenueOfferingsList({ offerings, liveNotes = [] }) {
  const [showAll, setShowAll] = useState(false);
  if (!offerings.length && !liveNotes.length) return null;
  const visible = showAll ? offerings : offerings.slice(0, OFFERINGS_PREVIEW);
  const hidden = offerings.length - visible.length;

  return (
    <section aria-labelledby="offers-heading" className="flex flex-col gap-1">
      <h3 id="offers-heading" className={`${SECTION_TITLE} mb-2`}>What this venue offers</h3>
      {liveNotes.map((note) => (
        <div key={note} className="mb-1 flex items-center gap-3 rounded-2xl bg-amber-50 px-3 py-2.5">
          <ClayIcon name="fireplace" size={32} />
          <span className="text-[15px] font-semibold text-amber-900">{note}</span>
        </div>
      ))}
      <ul className="flex flex-col">
        {visible.map((row) => (
          <li key={row.key} className="flex min-h-[52px] items-center gap-4 py-1.5">
            <ClayIcon name={row.icon} size={40} />
            <span className="text-[16px] font-medium text-slate-800">{row.label}</span>
          </li>
        ))}
      </ul>
      {offerings.length > OFFERINGS_PREVIEW ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-2 min-h-11 self-start rounded-2xl border border-slate-900 px-5 text-[15px] font-semibold text-slate-900 transition-colors active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {showAll ? 'Show fewer' : `Show all ${offerings.length} features`}
          <span className="sr-only">{showAll ? '' : ` (${hidden} more)`}</span>
        </button>
      ) : null}
    </section>
  );
}

// Getting in and around: only stated facts; unknown says so plainly.
export function AccessSection({ access, publicToilet = null }) {
  if (!access) return null;
  const { facts } = access;
  const toiletRow = publicToilet ? (
    <li className="flex min-h-[52px] items-center gap-4 py-1">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50" aria-hidden="true">
        <ClayIcon name="toilet" size={34} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[16px] font-medium text-slate-800">{publicToiletLine(publicToilet)}</span>
        {publicToiletHours(publicToilet.hours) ? <span className="text-[13px] font-medium text-slate-600">{publicToiletHours(publicToilet.hours)}</span> : null}
        <a href={publicToilet.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-slate-700 underline underline-offset-2">
          {publicToilet.name} on the Toilet Map
        </a>
      </span>
    </li>
  ) : null;
  return (
    <section aria-labelledby="access-heading" className="flex flex-col gap-1">
      <h3 id="access-heading" className={`${SECTION_TITLE} mb-1`}>Getting in and around</h3>
      {facts.length ? (
        <>
          <ul className="flex flex-col">
            {facts.map((fact) => {
              return (
                <li key={fact.key} className="flex min-h-[52px] items-center gap-4 py-1">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${fact.tone === 'heads-up' ? 'bg-amber-50' : 'bg-emerald-50'}`} aria-hidden="true">
                    <ClayIcon name={fact.icon} size={34} />
                  </span>
                  <span className="text-[16px] font-medium text-slate-800">
                    {fact.tone === 'heads-up' ? <span className="sr-only">Heads-up: </span> : null}
                    {fact.text}
                  </span>
                </li>
              );
            })}
            {toiletRow}
          </ul>
          <p className="text-[12px] font-medium leading-snug text-slate-600">{accessSourceLine(access)}</p>
        </>
      ) : (
        <>
          <p className="text-[15px] leading-relaxed text-slate-700">Steps, lifts and toilets aren't confirmed for this venue yet. Worth a quick call before you go.</p>
          {toiletRow ? <ul className="flex flex-col">{toiletRow}</ul> : null}
        </>
      )}
      {publicToilet ? <p className="text-[11px] font-medium leading-snug text-slate-500">{PUBLIC_TOILET_CREDIT}</p> : null}
    </section>
  );
}

// ── 8. About and hours ──────────────────────────────────────
export function AboutAndHours({ description, hours }) {
  return (
    <>
      {description ? (
        <section aria-labelledby="about-heading" className="flex flex-col gap-2">
          <h3 id="about-heading" className={SECTION_TITLE}>About</h3>
          <p className="text-[15px] leading-relaxed text-slate-700">{description}</p>
        </section>
      ) : null}
      <section aria-labelledby="hours-heading" className="flex flex-col gap-2">
        <h3 id="hours-heading" className={SECTION_TITLE}>Hours</h3>
        <div className="flex items-start gap-3">
          <ClayIcon name="clock" size={32} />
          <p className="pt-1 text-[15px] leading-relaxed text-slate-700">{hours.verified ? hours.text : hours.note}</p>
        </div>
      </section>
    </>
  );
}

// Imported listings credit their source (CC BY) and say they aren't verified.
export function VenueSourceNote({ note }) {
  if (!note) return null;
  return (
    <section aria-label="Listing source" className="flex flex-col gap-1">
      {note.seats ? <p className="text-[14px] font-semibold text-slate-700">{note.seats}</p> : null}
      <p className="text-[12px] font-medium leading-snug text-slate-600">{note.credit}</p>
      <div className="-mt-2 flex flex-wrap gap-x-4">
        {note.links.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center text-[12px] font-semibold text-slate-700 underline underline-offset-2">
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
}

export function HappyHourSection({ happyHour }) {
  if (!happyHour) return null;
  return (
    <section aria-labelledby="happy-hour-heading" className="flex flex-col gap-2 rounded-3xl bg-amber-50 p-4">
      <h3 id="happy-hour-heading" className="text-[17px] font-extrabold text-slate-900">Happy hour</h3>
      {happyHour.deal ? <p className="text-[15px] font-semibold text-slate-800">{happyHour.deal}</p> : null}
      {happyHour.start && happyHour.end ? (
        <p className="text-[14px] font-medium tabular-nums text-slate-700">
          {Array.isArray(happyHour.days) && happyHour.days.length ? `${happyHour.days.join(', ')} · ` : ''}
          {happyHour.start} – {happyHour.end}
        </p>
      ) : null}
    </section>
  );
}

// ── 9. Vibe + manage link ───────────────────────────────────
export function VibeSection({ onManage }) {
  const [photoNotice, setPhotoNotice] = useState(false);
  useEffect(() => {
    if (!photoNotice) return undefined;
    const timer = setTimeout(() => setPhotoNotice(false), PHOTO_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [photoNotice]);
  // Photos aren't saved yet: say so, and drop the picked file straight away.
  const handlePhotoPicked = (event) => {
    const input = event.target;
    if (input.files?.length) setPhotoNotice(true);
    input.value = '';
  };

  return (
    <>
      <section aria-labelledby="vibe-heading" className="flex flex-col gap-3 rounded-3xl border border-slate-900/[0.08] bg-white p-4">
        <div className="flex items-center gap-3">
          <ClayIcon name="sparkles" size={40} />
          <div className="min-w-0">
            <h3 id="vibe-heading" className="text-[17px] font-extrabold tracking-[-0.01em] text-slate-900">How&rsquo;s the vibe?</h3>
            <p className="text-[13px] font-medium text-slate-600">Share what it&rsquo;s like right now.</p>
          </div>
        </div>
        <label className="flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-amber-500 text-[16px] font-bold text-slate-950 shadow-[0_2px_10px_rgba(245,158,11,0.35)] transition-transform duration-150 active:scale-[0.98] focus-within:ring-2 focus-within:ring-slate-900">
          <ClayIcon name="camera" size={30} />
          Capture the vibe
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handlePhotoPicked} />
        </label>
        <p role="status" aria-live="polite" className={photoNotice ? 'rounded-xl bg-amber-50 px-3 py-2 text-center text-[13px] font-medium text-slate-700' : 'sr-only'}>
          {photoNotice ? PHOTO_COMING_SOON_MESSAGE : ''}
        </p>
      </section>

      {onManage ? (
        <button
          type="button"
          onClick={onManage}
          className="mx-auto flex min-h-11 items-center gap-1 rounded-xl px-3 text-[13px] font-medium text-slate-600 underline underline-offset-2 active:bg-slate-900/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          Manage this partner venue
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}
