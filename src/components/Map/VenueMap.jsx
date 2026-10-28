import React, {
    useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback,
    forwardRef, useImperativeHandle, memo,
} from 'react';
import * as Sentry from '@sentry/react';
import mapboxgl from 'mapbox-gl';
import { Layers, Check, Search } from 'lucide-react';
import { clusterSize, sunPinView } from '../../utils/sunPin';
import { clayPinUrlFor, clayPinUrls } from '../../utils/clayVenuePins';
import { mapMomentBadge } from '../../utils/mapMomentBadge.js';
import {
    CLUSTER_MOMENT_PROPERTIES, pointMomentMatches, clusterMomentBadge, clusterMomentFeatureSignature,
} from '../../utils/clusterMomentBadge.js';
import coffeeBadgeUrl from '../../assets/clay/coffee.webp';
import lunchBadgeUrl from '../../assets/clay/dining.webp';
import sunsetBadgeUrl from '../../assets/clay/cocktail.webp';
import { areaPromptNeeded } from '../../utils/searchArea';
import { filterRefitNeeded } from '../../utils/filterRefit';
import { parseXweatherCredentials } from '../../utils/xweatherKey';
import 'mapbox-gl/dist/mapbox-gl.css';
import SunCalc from 'suncalc';
import { sunLightFor } from '../../utils/mapSunLight';
import { mapLightMode, standardLightsForPreset } from '../../utils/mapLightMode.js';
import { MAPBOX_TOKEN, MAP_STYLE, INITIAL_VIEW_STATE, MAX_BOUNDS } from '../../config/mapConfig';
import { useWeather } from '../../context/WeatherContext';
import { useMicroclimateActions, useMicroclimateState } from '../../context/MicroclimateContext';
import { melbourneDate } from '../../utils/sunPosition';
import {
    readMicroclimate,
    pinStateFromMicroclimate,
    markerScoreFromMicroclimate,
} from '../../utils/microclimate';
import { freshMicroclimateEntry, mapCaptionProvenance } from '../../utils/microclimateProvenance.js';
import {
    TOD_DAY_START_MIN as DAY_START_MIN,
    TOD_DAY_END_MIN as DAY_END_MIN,
    TOD_SLIDER_STEP_MIN,
    describeSliderTime,
    localTimeToSliderMinutes,
    melbourneMinutesNow,
} from '../../utils/todMinutes';
import { motion } from 'framer-motion';
import { syncExistingClusterMarker } from '../../utils/syncClusterMarkers';
import { registerMapCamera } from '../../utils/mapCameraSettle';
import {
    MARKER_SYNC_CAMERA_EVENTS,
    bindMapGestureListeners,
    coalesceResizeSchedule,
    completeMarkerSync,
    createSyncScheduler,
    featuresForMarkerSync,
    geojsonPayloadKey,
    markerFeatureSignature,
    markerSyncDecision,
    markerSyncTriggerPlan,
    noteMarkerListeners,
    noteSourceWait,
    planMapResize,
    releaseMarkerRecords,
    releaseMarkerSyncFrame,
    requestMarkerSync,
    markerCoordinatePlan,
    requiredMarkerGate,
    resumeMayGoLive,
    syncMarkerLayer,
    canvasOutOfSync,
} from '../../utils/mapMarkerLifecycle';
import { clusterSourceFeatures, heatmapSourceData } from '../../utils/mapVenueSources';
import { webglRecoveryView } from '../../utils/webglRecoveryView';
import {
    mapRecoveryControl,
    noteContextLost,
    noteMapLoaded,
    noteMapRemoved,
    noteResumeFailed,
    releaseInitLock,
    requestMapResume,
    startMapLoad,
    createMapRecoveryState,
} from '../../utils/mapRecovery';
import { TOD_SCRUB_DEBOUNCE_MS } from '../../utils/todScrub';
import { createDebouncer } from '../../utils/debounce';
import { CITY_BUILDINGS_ATTRIBUTION } from '../../utils/cityBuildings.js';
import DataBadge from '../DataBadge';
import ClayIcon from '../common/ClayIcon';
import MapTimeControls from './MapTimeControls.jsx';
import { venueFeaturePinState } from '../../utils/venueFeaturePin.js';
import { isHoverPointer, orphanedPinHover } from '../../utils/listMapPairing.js';
import { viewportBboxFromCanvas } from '../../utils/viewportBbox.js';
import {
    captureMapCamera,
    claimCameraRestore,
    createGenerationCamera,
    dispatchGenerationCallback,
    markerSyncAfterRestore,
    releaseMapOwners,
    restoreMapCamera,
    teardownGenerationCamera,
    trackCameraTimer,
} from '../../utils/mapLifecycle';
import {
    claimMapboxMount,
    clearMapboxContextLoss,
    directionalLightShadowProps,
    mapMemoryOptions,
    noteMapboxContextLost,
    releaseMapboxMount,
    suppressMobileGpuLayers,
} from '../../utils/mapGpuGuard';

// ── Pin states ──────────────────────────────────────────────────────────
const PIN_STATES = {
    sunshine: { emoji: '☀️',  bg: '#f59e0b', border: '#d97706', color: '#0f172a' },
    heater:   { emoji: '🔥',  bg: '#ff6b35', border: '#c2410c', color: '#ffffff' },
    rain:     { emoji: '🌦️', bg: '#e2e8f0', border: '#cbd5e1', color: '#64748b' },
    cold:     { emoji: '🥶',  bg: '#e2e8f0', border: '#cbd5e1', color: '#64748b' },
    sunny:    { emoji: '😎',  bg: '#f59e0b', border: '#d97706', color: '#0f172a' },
    default:  { emoji: '🌤️', bg: '#e2e8f0', border: '#cbd5e1', color: '#64748b' },
    cozy:     { emoji: '🛋️', bg: '#fde68a', border: '#f59e0b', color: '#0f172a' },
    windy:    { emoji: '💨',  bg: '#e2e8f0', border: '#cbd5e1', color: '#64748b' },
    cloudy:   { emoji: '☁️',  bg: '#e2e8f0', border: '#cbd5e1', color: '#64748b' },
};

function getPinStateKey(venue, weather, liveVenueFeatures, weatherColorFn, cozyFilterActive, microReading, weatherUnavailable) {
    // Cozy filter is a user intent overlay, not a weather recompute.
    if (cozyFilterActive) {
        const live = liveVenueFeatures?.[venue.id] || {};
        if (live.fireplaceOn === true) return 'heater';
        if (live.heatersOn === true || live.roofClosed === true || venue.hasCozy) return 'cozy';
    }

    // A fire or heaters the venue switched on now is fresher than any modelled
    // sun reading, so it wins: the pin shows the flame.
    const ownerWarmth = venueFeaturePinState(venue, liveVenueFeatures?.[venue.id]);
    if (ownerWarmth) return ownerWarmth;

    // Cached RPC profile wins: marker colour comes from effective_sun /
    // sun_hour_fraction / effective_wind, never from client weather APIs.
    const profilePin = pinStateFromMicroclimate(microReading);
    if (profilePin && PIN_STATES[profilePin]) return profilePin;

    // Missing, demo or failed weather must not colour pins as if it were real.
    // Heating is a venue feature, not weather, so it still shows.
    if (weatherUnavailable) return venueFeaturePinState(venue, liveVenueFeatures?.[venue.id]) ?? 'default';

    // Soft fallback only when the venue has no microclimate profile.
    if (typeof weatherColorFn === 'function') {
        const fnResult = weatherColorFn(weather, venue);
        if (fnResult && PIN_STATES[fnResult]) return fnResult;
    }

    const live = liveVenueFeatures?.[venue.id] || {};
    const apparentTemp = weather?.apparentTemp ?? weather?.main?.feels_like ?? weather?.main?.temp ?? 20;
    const precipProb   = weather?.precipProbability ?? 0;
    const cloudCover   = weather?.cloudCoverPct ?? weather?.clouds?.all ?? 0;
    const condition    = (weather?.weather?.[0]?.main || '').toLowerCase();
    const heatersOn    = venueFeaturePinState(venue, live) === 'heater';
    const sunshineNow  = !!live.sunshineNow || !!venue.sunshineNow;

    if (sunshineNow) {
        if (venue.beerGarden) return 'sunny';
        return 'sunshine';
    }
    if (heatersOn)   return 'heater';
    if (condition.includes('rain') || condition.includes('drizzle') || precipProb >= 40) return 'rain';
    if (apparentTemp <= 11) return 'cold';
    if (apparentTemp >= 18 && cloudCover <= 35 && precipProb < 20) return 'sunny';
    return 'default';
}

function readingForVenue(microById, venueId, todMinutes) {
    // Stale rows (see isMicroclimateEntryStale) count as no profile: weather/neutral rules apply.
    const entry = freshMicroclimateEntry(microById, venueId);
    if (!entry) return null;
    return readMicroclimate(entry, todMinutes);
}

function markerScoreForVenue(reading, venue, calculateSunScore) {
    const profileScore = markerScoreFromMicroclimate(reading);
    if (profileScore != null) return profileScore;
    const rawScore = typeof calculateSunScore === 'function'
        ? calculateSunScore(venue)
        : null;
    return Number.isFinite(rawScore) ? Math.round(rawScore) : null;
}

const isFiniteCoord = (v) => Number.isFinite(Number(v));
const isRenderableVenue = (v) => markerCoordinatePlan(v).ok;

const FLY_TO_PADDING = { top: 50, bottom: 50, left: 0, right: 0 };

// ── Bounds utility ──────────────────────────────────────────────────────
const SINGLE_PIN_PAD = 0.008; // ~800m so a one-venue fitBounds stays readable

function getBoundsFromVenues(venues) {
    if (!Array.isArray(venues) || venues.length === 0) return null;
    try {
        let minLng = Infinity,  maxLng = -Infinity;
        let minLat = Infinity,  maxLat = -Infinity;
        let count = 0;
        for (const v of venues) {
            const lng = Number(v.lng);
            const lat = Number(v.lat);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            count += 1;
        }
        if (count === 0 || !Number.isFinite(minLng)) return null;
        if (count === 1 || (minLng === maxLng && minLat === maxLat)) {
            return new mapboxgl.LngLatBounds(
                [minLng - SINGLE_PIN_PAD, minLat - SINGLE_PIN_PAD],
                [maxLng + SINGLE_PIN_PAD, maxLat + SINGLE_PIN_PAD],
            );
        }
        return new mapboxgl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
    } catch (e) {
        console.warn('[VenueMap] getBoundsFromVenues error:', e?.message);
        return null;
    }
}

function visibleVenueSetKey(venues) {
    return venues.map((v) => String(v.id)).sort().join('|');
}

// ── Map overlay chrome ──────────────────────────────────────────────────
// Apple-Maps-style grouped control stack: one translucent material container
// with hairline dividers, 44px hit areas, and no per-button shadows.
const CONTROL_BUTTON =
    'flex h-11 w-11 min-h-11 min-w-11 cursor-pointer items-center justify-center text-[19px] leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600';
const CONTROL_BUTTON_IDLE = 'bg-transparent text-slate-800 active:bg-slate-900/10';
const CONTROL_TOUCH_STYLE = { touchAction: 'auto', WebkitTapHighlightColor: 'transparent' };

// ── Marker DOM helpers ──────────────────────────────────────────────────
// Label pins: the venue's own icon + its sun score, coloured by sun tier
// (see utils/sunPin). No infinite CSS animation and no backdrop blur, so a
// map full of pins stays cheap for the iOS compositor.
const PIN_TAIL_SVG = (fill, stroke) =>
    `<svg width="14" height="8" viewBox="0 0 14 8" aria-hidden="true" style="display:block;margin-top:-1px"><path d="M1 0 L7 7 L13 0" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/></svg>`;

// 96px clay pin icons (utils/clayVenuePins), hashed or inlined by Vite.
const CLAY_PIN_URLS = clayPinUrls(import.meta.glob('../../assets/clay/pins/*.webp', { eager: true, import: 'default' }));
const PIN_ICON_PX = 20;
// Clusters hold through this zoom; individual pins appear one level above.
const MAP_CLUSTER_MAX_ZOOM = 16;
const MOMENT_BADGE_URLS = { coffee: coffeeBadgeUrl, dining: lunchBadgeUrl, cocktail: sunsetBadgeUrl };

function paintMomentBadge(bubble, badge, topOffset = -18) {
    const url = badge && MOMENT_BADGE_URLS[badge.icon];
    let img = bubble.querySelector('.ss-pin-moment-badge');
    if (!url) {
        img?.remove();
        bubble.style.removeProperty('position');
        return;
    }
    // Absolute decoration inside the bubble leaves the marker's dimensions
    // and Mapbox positioning untouched.
    bubble.style.position = 'relative';
    if (!img) {
        img = document.createElement('img');
        img.className = 'ss-pin-moment-badge';
        img.width = 20;
        img.height = 20;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.decoding = 'async';
        img.draggable = false;
        img.style.cssText = 'position:absolute;top:-18px;right:-8px;width:20px;height:20px;object-fit:contain;box-sizing:content-box;border:2px solid #fff;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(15,23,42,0.2);pointer-events:none';
        bubble.append(img);
    }
    img.style.top = `${topOffset}px`;
    if (img.getAttribute('src') !== url) img.src = url;
}

// One <img> per pin, reused across repaints. A failed URL is remembered on the
// element so later repaints keep the emoji instead of retrying it.
function paintPinIcon(icon, view) {
    const url = view.iconUrl && icon.dataset.failedSrc !== view.iconUrl ? view.iconUrl : null;
    if (!url) {
        if (icon.firstElementChild || icon.textContent !== view.icon) icon.textContent = view.icon;
        return;
    }
    let img = icon.firstElementChild;
    if (!img || img.tagName !== 'IMG') {
        icon.textContent = '';
        img = document.createElement('img');
        img.width = PIN_ICON_PX;
        img.height = PIN_ICON_PX;
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        img.style.cssText = `display:block;width:${PIN_ICON_PX}px;height:${PIN_ICON_PX}px;object-fit:contain;pointer-events:none`;
        icon.append(img);
    }
    img.onerror = () => {
        icon.dataset.failedSrc = url;
        icon.textContent = view.icon;
    };
    if (img.getAttribute('src') !== url) img.src = url;
}

function paintMarkerEl(el, view) {
    const bubble = el.querySelector('.ss-pin-bubble');
    const icon = el.querySelector('.ss-pin-icon');
    const score = el.querySelector('.ss-pin-score');
    const tail = el.querySelector('.ss-pin-tail');
    if (!bubble || !icon || !score || !tail) return;
    bubble.style.background = view.bg;
    bubble.style.borderColor = view.border;
    bubble.style.color = view.text;
    paintPinIcon(icon, view);
    paintMomentBadge(bubble, view.momentBadge);
    score.textContent = view.scoreText;
    score.style.display = view.scoreText ? '' : 'none';
    tail.innerHTML = PIN_TAIL_SVG(view.bg, view.border);
    el.setAttribute('aria-label', view.momentBadge
        ? `${view.venueName}, ${view.momentBadge.label}, ${view.label}`
        : view.label);
    el.dataset.sunTier = view.tier;
    el.dataset.highlighted = view.raised ? 'true' : 'false';
    el.style.zIndex = String(view.zIndex ?? 1);
    bubble.style.outline = view.ring ? '2.5px solid #0f172a' : '';
    bubble.style.outlineOffset = view.ring ? '2px' : '';
    bubble.style.transform = view.raised ? 'scale(1.08)' : '';
}

/** Repaint an existing venue pin from its record after a selection or highlight change. */
function repaintVenueMarker(record) {
    paintMarkerEl(record.el, {
        ...sunPinView({
            pinKey: record.pinKey, score: record.score, emoji: record.emoji, iconUrl: record.iconUrl,
            selected: record.selected, highlighted: Boolean(record.highlighted), night: Boolean(record.night),
            nightMode: Boolean(record.nightMode),
        }),
        momentBadge: record.momentBadge,
        venueName: record.venueName,
    });
}

function createMarkerEl(view) {
    const el = document.createElement('div');
    el.className = 'ss-sun-pin';
    el.setAttribute('role', 'button');
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;';

    const bubble = document.createElement('div');
    bubble.className = 'ss-pin-bubble';
    bubble.style.cssText = [
        'display:flex', 'align-items:center', 'gap:4px',
        'min-height:30px', 'padding:4px 9px', 'border-radius:12px',
        'border:1.5px solid', 'box-shadow:0 3px 8px rgba(15,23,42,0.16)',
        'font:700 14px/1 "Plus Jakarta Sans",system-ui,sans-serif',
        'white-space:nowrap', 'transition:transform 120ms ease',
    ].join(';');
    const icon = document.createElement('span');
    icon.className = 'ss-pin-icon';
    icon.style.cssText = 'font-size:15px;line-height:1';
    const score = document.createElement('span');
    score.className = 'ss-pin-score';
    score.style.cssText = 'font-variant-numeric:tabular-nums';
    bubble.append(icon, score);

    const tail = document.createElement('div');
    tail.className = 'ss-pin-tail';
    el.append(bubble, tail);

    el.addEventListener('mouseenter', () => { bubble.style.transform = 'scale(1.08)'; });
    el.addEventListener('mouseleave', () => { bubble.style.transform = ''; });
    paintMarkerEl(el, view);
    return el;
}

function createClusterMarkerEl(count, momentView) {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;';
    const inner = document.createElement('div');
    inner.className = 'ss-cluster-inner';
    inner.style.cssText = [
        'border-radius:50%', 'background:#ffffff', 'border:3px solid #f59e0b',
        'display:flex', 'align-items:center', 'justify-content:center',
        'font:800 15px/1 "Plus Jakarta Sans",system-ui,sans-serif', 'color:#0f172a',
        'box-shadow:0 3px 10px rgba(15,23,42,0.22)', 'transition:transform 120ms ease',
    ].join(';');
    el.appendChild(inner);
    el.addEventListener('mouseenter', () => { inner.style.transform = 'scale(1.08)'; });
    el.addEventListener('mouseleave', () => { inner.style.transform = ''; });
    updateClusterMarkerEl(el, count, momentView);
    return el;
}

function updateClusterMarkerEl(el, count, { badge = null, matchCount = 0 } = {}) {
    const inner = el.querySelector('.ss-cluster-inner');
    if (!inner) return;
    const size = clusterSize(count);
    inner.style.width = `${size}px`;
    inner.style.height = `${size}px`;
    if (inner.firstChild?.nodeType === Node.TEXT_NODE) inner.firstChild.nodeValue = String(count);
    else inner.prepend(document.createTextNode(String(count)));
    paintMomentBadge(inner, badge, -20);
    el.setAttribute('aria-label', badge ? `${count} venues, ${matchCount} with ${badge.label}` : `${count} venues`);
}

// HTML markers sit on the map plane so they do not parallax when the 3D
// camera pitches. Bottom-anchor treats each element like a pin on the ground.
const MAP_SURFACE_MARKER = { pitchAlignment: 'map', anchor: 'bottom' };

function createUserLocationEl() {
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'width:22px;height:22px;display:flex;align-items:center;justify-content:center;position:relative;pointer-events:none;';

    const ring = document.createElement('div');
    ring.className = 'absolute inset-0 rounded-full animate-ping';
    ring.style.cssText = 'background:rgba(59,130,246,0.45);pointer-events:none;';

    const dot = document.createElement('div');
    dot.style.cssText = [
        'width:12px', 'height:12px', 'border-radius:50%',
        'background:#2563eb', 'border:2px solid #fff',
        'box-shadow:0 0 0 2px rgba(37,99,235,0.28),0 1px 4px rgba(15,23,42,0.28)',
        'position:relative', 'z-index:1',
    ].join(';');

    el.appendChild(ring);
    el.appendChild(dot);
    return el;
}

// ── Layer helpers ───────────────────────────────────────────────────────
const LAYER_INSERT_BEFORE = 'aeroway-polygon';

const HEATMAP_SOURCE_ID = 'comfort-heatmap-src';
const HEATMAP_LAYER_ID  = 'comfort-heatmap-lyr';

const WEATHER_API_KEY = (import.meta.env.VITE_OPENWEATHER_KEY || '').trim();
const XWEATHER_CREDENTIALS = parseXweatherCredentials(
    import.meta.env.VITE_XWEATHER_KEY,
    import.meta.env.VITE_XWEATHER_ID,
    import.meta.env.VITE_XWEATHER_SECRET,
);

let mapsGlModulePromise = null;
function loadMapsGl() {
    if (!mapsGlModulePromise) mapsGlModulePromise = import('@xweather/mapsgl');
    return mapsGlModulePromise;
}
const CLOUD_SOURCE_ID = 'openweathermap-cloud';
const CLOUD_LAYER_ID  = 'openweathermap-cloud-layer';

const CLUSTER_SOURCE_ID = 'venues-cluster-src';
const CLUSTER_LAYER_ID  = 'venues-cluster-lyr';

// Mapbox Standard renders 3D buildings natively (no manual fill-extrusion layer),
// and its 3D lighting model casts real ground shadows — see TimeOfDayLight below.
const AMBIENT_LIGHT_ID     = 'sunstay-ambient';
const DIRECTIONAL_LIGHT_ID = 'sunstay-sun';

function addOrUpdateCloudLayer(map) {
    if (!map || !WEATHER_API_KEY) return;
    try {
        if (!map.getSource(CLOUD_SOURCE_ID)) {
            map.addSource(CLOUD_SOURCE_ID, {
                type: 'raster',
                tiles: [`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${WEATHER_API_KEY}`],
                tileSize: 256,
                minzoom: 0,
                maxzoom: 12,
                attribution: 'OpenWeatherMap',
            });
            const insertBefore = map.getLayer(LAYER_INSERT_BEFORE) ? LAYER_INSERT_BEFORE : undefined;
            map.addLayer({
                id: CLOUD_LAYER_ID,
                type: 'raster',
                source: CLOUD_SOURCE_ID,
                maxzoom: 13,
                paint: {
                    'raster-opacity': 0.65,
                    'raster-fade-duration': 150,
                },
            }, insertBefore);
        }
    } catch (e) {
        console.warn('[VenueMap] addOrUpdateCloudLayer error:', e?.message);
    }
}

function removeCloudLayer(map) {
    if (!map) return;
    try {
        if (map.getLayer(CLOUD_LAYER_ID))   map.removeLayer(CLOUD_LAYER_ID);
        if (map.getSource(CLOUD_SOURCE_ID)) map.removeSource(CLOUD_SOURCE_ID);
    } catch (e) {
        console.warn('[VenueMap] removeCloudLayer error:', e?.message);
    }
}

function isSuppressedMapError(msg) {
    if (!msg) return false;
    const lower = msg.toLowerCase();
    return (
        lower.includes('zoom level') ||
        lower.includes('not supported') ||
        lower.includes(HEATMAP_SOURCE_ID) ||
        lower.includes(HEATMAP_LAYER_ID) ||
        lower.includes(CLOUD_SOURCE_ID) ||
        lower.includes(CLOUD_LAYER_ID)
    );
}

// ── Time-of-day dynamic lighting ────────────────────────────────────────
const LIGHT_THROTTLE_MS = 100;  // skip per-frame setLights + shadows while scrubbing

const rad2deg = (r) => (r * 180) / Math.PI;

function formatClock(mins) {
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = ((h24 + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// Translate a minutes-of-day value into Mapbox v3 3D-lighting parameters using
// the real Melbourne sun position from suncalc (computed for today's date).
// The light curve itself is in utils/mapSunLight.js (unit-tested).
function computeSunLight(minutes, lat, lng) {
    const { azimuth, altitude } = SunCalc.getPosition(melbourneDate(minutes), lat, lng);
    return sunLightFor(rad2deg(altitude), rad2deg(azimuth));
}

// Floating slider that scrubs the global 3D-building light. Local React
// state drives the thumb + clock while dragging so the UI stays at input
// rate. Cluster/heatmap rebuilds publish through a 150ms debounce so the
// GeoJSON path does not run on every input sample. During scrub, map.setLights
// is throttled (~100ms) with cast-shadows off so the pitched Standard map
// stays interactive. A full lights+shadows pass runs once on settle. Score
// preview commits only on pointer-up / cancel / blur / keyup — never the
// live scrub path.
function TimeOfDayLight({ mapRef, mapLoaded, generation, mapGenerationRef, staleGenerationsRef, nightMode = false, isVenueSelected = false, todMinutes = null }) {
    const { weather, error: weatherError, unavailable: weatherUnavailable, setScorePreviewMinutes } = useWeather();
    // Writer-only: publishing the scrub position re-renders the microclimate
    // readouts, not this component or the map.
    const { setTodMinutes } = useMicroclimateActions();
    const [sliderMinutes, setSliderMinutes] = useState(() => {
        // `todMinutes` is null until someone scrubs. Number(null) is 0, which
        // used to clamp to 6:00 AM, so only reuse a real value.
        const existing = todMinutes == null ? NaN : Number(todMinutes);
        if (Number.isFinite(existing)) {
            return Math.min(DAY_END_MIN, Math.max(DAY_START_MIN, Math.round(existing)));
        }
        return localTimeToSliderMinutes();
    });
    const minutesRef = useRef(sliderMinutes);
    const lightTimerRef = useRef(null);
    const lastLightApplyAtRef = useRef(0);
    const panPausedRef = useRef(false);
    const publishTodRef = useRef(null);
    const rangeRef = useRef(null);
    const standardLightsRef = useRef(null);
    const nightModeRef = useRef(nightMode);
    useLayoutEffect(() => { nightModeRef.current = nightMode; }, [nightMode]);
    const lightMode = useCallback(() => mapLightMode({
        nightMode: nightModeRef.current, mapLoaded, generation,
        currentGeneration: mapGenerationRef.current,
        stale: staleGenerationsRef.current.has(generation),
    }), [mapLoaded, generation, mapGenerationRef, staleGenerationsRef]);
    // Re-read Melbourne time each minute so "Now" and the label stay honest
    // in a long session.
    const [nowMinutes, setNowMinutes] = useState(() => melbourneMinutesNow());
    useEffect(() => {
        const id = setInterval(() => setNowMinutes(melbourneMinutesNow()), 60_000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const publish = createDebouncer((mins) => setTodMinutes(mins), TOD_SCRUB_DEBOUNCE_MS);
        publishTodRef.current = publish;
        return () => publish.cancel();
    }, [setTodMinutes]);

    const applyLight = useCallback((mins, { castShadows = true } = {}) => {
        if (!lightMode().customLights) return;
        const map = mapRef.current;
        if (!map || typeof map.setLights !== 'function') return;
        if (!map.isStyleLoaded || !map.isStyleLoaded()) return;
        const mobile = typeof navigator !== 'undefined'
            && (navigator.maxTouchPoints > 0 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || ''));
        const shadowProps = directionalLightShadowProps(mobile, castShadows);
        const { direction, color, intensity, ambientIntensity } = computeSunLight(
            mins, INITIAL_VIEW_STATE.latitude, INITIAL_VIEW_STATE.longitude,
        );
        try {
            // Mapbox Standard 3D lighting: a directional "sun" with optional
            // cast-shadows from native 3D buildings, plus a soft ambient fill.
            map.setLights([
                {
                    id: AMBIENT_LIGHT_ID,
                    type: 'ambient',
                    properties: { color: '#ffffff', intensity: ambientIntensity },
                },
                {
                    id: DIRECTIONAL_LIGHT_ID,
                    type: 'directional',
                    properties: {
                        direction,
                        color,
                        intensity,
                        ...shadowProps,
                    },
                },
            ]);
        } catch (e) {
            console.warn('[VenueMap] setLights failed:', e?.message);
        }
    }, [mapRef, lightMode]);

    const cancelPendingLight = useCallback(() => {
        if (lightTimerRef.current != null) {
            clearTimeout(lightTimerRef.current);
            lightTimerRef.current = null;
        }
    }, []);

    const scheduleScrubLight = useCallback((mins) => {
        minutesRef.current = mins;
        const run = () => {
            lightTimerRef.current = null;
            lastLightApplyAtRef.current = performance.now();
            applyLight(minutesRef.current, { castShadows: false });
        };
        const elapsed = performance.now() - lastLightApplyAtRef.current;
        if (elapsed >= LIGHT_THROTTLE_MS) {
            cancelPendingLight();
            run();
            return;
        }
        if (lightTimerRef.current == null) {
            lightTimerRef.current = setTimeout(run, LIGHT_THROTTLE_MS - elapsed);
        }
    }, [applyLight, cancelPendingLight]);

    const pauseMapPan = useCallback(() => {
        const map = mapRef.current;
        if (!map?.dragPan || panPausedRef.current) return;
        try {
            map.dragPan.disable();
            panPausedRef.current = true;
        } catch { /* noop */ }
    }, [mapRef]);

    const resumeMapPan = useCallback(() => {
        const map = mapRef.current;
        if (!map?.dragPan || !panPausedRef.current) return;
        try {
            map.dragPan.enable();
        } catch { /* noop */ }
        panPausedRef.current = false;
    }, [mapRef]);

    useEffect(() => {
        const mode = lightMode();
        if (!mode.preset) return undefined;
        const map = mapRef.current;
        if (!map) return undefined;
        const mobile = typeof navigator !== 'undefined'
            && (navigator.maxTouchPoints > 0 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || ''));
        try {
            // 3.17 setLights mutates imported lights by type. Restore their
            // original config expressions so Standard can own night lighting.
            if (standardLightsRef.current?.map !== map) {
                const lights = map.getLights();
                standardLightsRef.current = { map, lights: standardLightsForPreset(lights) };
            }
            if (!mode.customLights && standardLightsRef.current.lights) {
                map.setLights(standardLightsForPreset(standardLightsRef.current.lights, mobile));
            }
            map.setConfigProperty('basemap', 'lightPreset', mode.preset);
        } catch (e) {
            console.warn('[VenueMap] light preset failed:', e?.message);
        }
        if (mobile) suppressMobileGpuLayers(map);
        applyLight(minutesRef.current);
        // Mapbox Standard finishes wiring its own style/config lights shortly
        // after 'load'; re-apply once the map settles so our sun isn't overwritten.
        if (map && typeof map.once === 'function') {
            const reapply = () => {
                if (mapRef.current === map) applyLight(minutesRef.current);
            };
            map.once('idle', reapply);
            return () => {
                cancelPendingLight();
                resumeMapPan();
                try { map.off('idle', reapply); } catch { /* noop */ }
            };
        }
        return () => {
            cancelPendingLight();
            resumeMapPan();
        };
        // Reapply on a loaded generation or ownership change, never by remounting the map.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapLoaded, nightMode, lightMode, applyLight, cancelPendingLight, resumeMapPan]);

    useEffect(() => () => {
        cancelPendingLight();
        resumeMapPan();
    }, [cancelPendingLight, resumeMapPan]);

    // Publish the slider's opening position once it mounts. Minutes are
    // Melbourne wall-clock (AEST/AEDT), matching the sun curve index and
    // the "is this the current hour?" comparison.
    useEffect(() => {
        if (todMinutes != null) return;
        setTodMinutes(minutesRef.current);
    }, [setTodMinutes, todMinutes]);

    // Sunny (and any other writer) publishes through MicroclimateContext.
    // Keep the thumb + 3D lights in lockstep when that value changes
    // without this slider firing the input.
    useEffect(() => {
        if (todMinutes == null) return;
        if (panPausedRef.current) return;
        const n = Number(todMinutes);
        if (!Number.isFinite(n)) return;
        const clamped = Math.min(DAY_END_MIN, Math.max(DAY_START_MIN, Math.round(n)));
        if (clamped === minutesRef.current) return;
        minutesRef.current = clamped;
        setSliderMinutes(clamped);
        applyLight(clamped, { castShadows: true });
        if (typeof setScorePreviewMinutes === 'function') {
            setScorePreviewMinutes(clamped);
        }
    }, [todMinutes, applyLight, setScorePreviewMinutes]);

    const handleScrub = (e) => {
        const v = Number(e.target.value);
        minutesRef.current = v;
        setSliderMinutes(v);
        scheduleScrubLight(v);
        publishTodRef.current?.(v);
    };

    const settleScrub = () => {
        cancelPendingLight();
        const v = minutesRef.current;
        setSliderMinutes((prev) => (prev === v ? prev : v));
        lastLightApplyAtRef.current = performance.now();
        applyLight(v, { castShadows: true });
        if (typeof setScorePreviewMinutes === 'function') {
            setScorePreviewMinutes(v);
        }
        publishTodRef.current?.cancel();
        setTodMinutes(v);
    };

    const handleRangePointerDown = (e) => {
        pauseMapPan();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    };

    const handleRangeRelease = () => {
        settleScrub();
        resumeMapPan();
    };

    // Chrome can apply a range input's value before its min/max, clamping it
    // to the default 0–100 and then up to min (6:00 AM). React then believes
    // the DOM already holds our value, so the thumb stays at 6 AM. Re-assert
    // it after every render.
    useLayoutEffect(() => {
        const el = rangeRef.current;
        if (el && el.value !== String(sliderMinutes)) el.value = String(sliderMinutes);
    });

    const clock = formatClock(sliderMinutes);
    const timeLabel = describeSliderTime(sliderMinutes, nowMinutes);

    const jumpToNow = () => {
        const v = localTimeToSliderMinutes();
        cancelPendingLight();
        minutesRef.current = v;
        setSliderMinutes(v);
        lastLightApplyAtRef.current = performance.now();
        applyLight(v, { castShadows: true });
        if (typeof setScorePreviewMinutes === 'function') setScorePreviewMinutes(v);
        publishTodRef.current?.cancel();
        setTodMinutes(v);
    };

    const selectPresetMinutes = (minutes) => {
        handleScrub({ target: { value: String(minutes) } });
        handleRangeRelease();
    };

    return <MapTimeControls
        minutes={sliderMinutes}
        clock={clock}
        timeLabel={timeLabel}
        nowMinutes={nowMinutes}
        weather={weatherError || weatherUnavailable ? null : weather}
        hidden={isVenueSelected}
        onSelectMinutes={selectPresetMinutes}
        onJumpNow={jumpToNow}
        rangeRef={rangeRef}
        rangeProps={{
            min: DAY_START_MIN, max: DAY_END_MIN, step: TOD_SLIDER_STEP_MIN,
            value: sliderMinutes, onChange: handleScrub,
            onPointerDown: handleRangePointerDown, onFocus: pauseMapPan,
            onPointerUp: handleRangeRelease, onPointerCancel: handleRangeRelease,
            onBlur: handleRangeRelease, onKeyUp: settleScrub,
        }}
    />;
}

// Not getBounds(): it leaves out the padding fitBounds/flyTo keep on the
// camera, which on a short map is nearly the whole canvas. The canvas css size
// matches the transform unproject() uses, even before a pending resize().
function readMapBounds(instance) {
    try {
        const canvas = instance?.getCanvas?.();
        if (!canvas) return null;
        return viewportBboxFromCanvas(canvas.clientWidth, canvas.clientHeight, (point) => instance.unproject(point));
    } catch {
        return null;
    }
}

// ══════════════════════════════════════════════════════════════════════
const VenueMap = forwardRef(({
    venues = [],
    selectedVenue,
    filteredVenueIds,
    activeSunMoment = null,
    sunMomentsById = null,
    filterKey,
    onVenueSelect,
    highlightedVenueId = null, // list ↔ map pairing: the hovered/focused row's venue
    onVenueHover = null,        // (venueId, 'enter' | 'leave') => void, from a pin hover
    liveVenueFeatures = {},
    // ── NEW: props wired from App.jsx ──────────────────────────────
    weatherColorFn    = null,   // (weather, venue) => pinKey string
    cozyWeatherActive = false,  // true when weather is cold/rainy
    cozyFilterActive  = false,  // true when user has 'Cozy' filter selected
    isNight           = false,  // sun is down at the map's time: pins show a moon, not 0
    nightMode         = false,  // After Dark owns Standard's basemap lighting, independently of pins
    filtersControl    = null,   // Filters FAB — stacked above TOD, layout only
    searchedArea      = null,   // bounds the list is narrowed to, or null
    onSearchArea      = null,   // (bounds) => void — "Search this area" pill
    onCameraSettle    = null,   // ({ lat, lng, zoom } | null) => void
}, ref) => {
    const mapContainer     = useRef(null);
    const map              = useRef(null);
    const controllerRef    = useRef(null);
    const radarLayerAddedRef = useRef(false);
    const markersRef       = useRef({});
    const userMarkerRef    = useRef(null);
    const hasFlownToBounds = useRef(false);
    const filterBoundsKeyRef = useRef(null);
    const filterChoiceKeyRef = useRef(undefined);
    const rafRef           = useRef(null);
    const mapInitLockRef   = useRef(false);
    const pendingTimersRef = useRef(new Set());
    const mountMapRef      = useRef(null);
    const teardownMapRef   = useRef(() => {});
    const recoveryRef      = useRef(createMapRecoveryState());
    const staleGenerationsRef = useRef(new Set());
    const recoveryCameraRef = useRef(null);
    const mapGenerationRef = useRef(0);
    const cameraClaimRef = useRef(new Set());
    const cameraGuardRef = useRef(createGenerationCamera(0));
    const syncSchedulerRef = useRef(createSyncScheduler());
    const finishResumeRef = useRef(() => {});
    const [recovery, setRecovery] = useState(() => createMapRecoveryState());
    const [cooldownNow, setCooldownNow] = useState(() => Date.now());

    const [comfortMapOn, setComfortMapOn] = useState(false);
    const [cloudOn,      setCloudOn]      = useState(false);
    const [showRadar,    setShowRadar]    = useState(false);
    const [layersOpen,   setLayersOpen]   = useState(false);
    const [areaPrompt,   setAreaPrompt]   = useState(null); // bounds to search, or null

    const [mapLoaded,    setMapLoaded]    = useState(false);
    const [mapError,     setMapError]     = useState(false);
    const webglLost = recovery.phase === 'paused'
        || recovery.phase === 'resuming'
        || recovery.phase === 'resume-failed';

    const { weather, calculateSunstayScore, calculateSunScore, unavailable: weatherUnavailable, dataKind, fetchedAt } = useWeather();
    const { setBbox } = useMicroclimateActions();
    // Reader: cached venues_in_bbox rows + slider minutes. Pin colour/size
    // use these fields (effective_sun, effective_wind, sun_hour_fraction)
    // rather than recomputing sun from client weather when a profile exists.
    const { byId: microById, todMinutes, viewportBbox } = useMicroclimateState();
    const clusterTodMinutes = todMinutes;

    const safeVenues = useMemo(
        () => (Array.isArray(venues) ? venues.filter(isRenderableVenue) : []),
        [venues]
    );
    const venuesMapRef = useRef(new Map());
    // Venue ids in the cluster source, and the last payload given to it.
    const clusterVenueIdsRef = useRef(new Set());
    const clusterPayloadRef = useRef(null);
    // The current marker sync, so a selection change can ask for one.
    const syncMarkersRef = useRef(null);
    useEffect(() => {
        venuesMapRef.current = new Map(safeVenues.map(v => [String(v.id), v]));
    }, [safeVenues]);

    const filteredIdSet = useMemo(() => {
        if (!Array.isArray(filteredVenueIds)) return null;
        return new Set(filteredVenueIds.map(id => String(id)));
    }, [filteredVenueIds]);

    // Map caption DataBadge: microclimate age when profile pins are the
    // on-screen majority, otherwise the client weather fetch.
    const captionBadge = useMemo(() => mapCaptionProvenance({
        venues: filteredIdSet ? safeVenues.filter((v) => filteredIdSet.has(String(v.id))) : safeVenues,
        bbox: viewportBbox,
        microById,
        todMinutes: clusterTodMinutes,
        weatherKind: dataKind,
        weatherFetchedAt: fetchedAt,
    }), [safeVenues, filteredIdSet, viewportBbox, microById, clusterTodMinutes, dataKind, fetchedAt]);

    const onVenueSelectRef = useRef(onVenueSelect);
    useEffect(() => { onVenueSelectRef.current = onVenueSelect; }, [onVenueSelect]);

    // Paint selection changes immediately. The marker sync below also keeps
    // the selected venue visible when the card's fly-to puts it in a cluster.
    const selectedVenueIdRef = useRef(selectedVenue?.id ?? null);
    useEffect(() => {
        const id = selectedVenue?.id ?? null;
        selectedVenueIdRef.current = id;
        for (const record of Object.values(markersRef.current || {})) {
            if (!record || record.isCluster || !record.el) continue;
            const selected = id != null && record.venueId === String(id);
            if (record.selected === selected) continue;
            record.selected = selected;
            repaintVenueMarker(record);
        }
        // Add (or drop) the separate pin for a selected venue inside a cluster.
        syncMarkersRef.current?.('selection');
    }, [selectedVenue?.id]);

    // List ↔ map pairing: a hovered or focused list row highlights its pin.
    // Only pins whose highlight changed are repainted; no marker sync runs,
    // so a venue hidden inside a cluster simply has no pin to highlight.
    const onVenueHoverRef = useRef(onVenueHover);
    useEffect(() => { onVenueHoverRef.current = onVenueHover; }, [onVenueHover]);
    const pinHoverIdRef = useRef(null); // venue id of the pin under the mouse, if any
    const highlightedVenueIdRef = useRef(highlightedVenueId != null ? String(highlightedVenueId) : null);
    useEffect(() => {
        const id = highlightedVenueId != null ? String(highlightedVenueId) : null;
        highlightedVenueIdRef.current = id;
        for (const record of Object.values(markersRef.current || {})) {
            if (!record || record.isCluster || !record.el) continue;
            const highlighted = id != null && record.venueId === id;
            if (Boolean(record.highlighted) === highlighted) continue;
            record.highlighted = highlighted;
            repaintVenueMarker(record);
        }
    }, [highlightedVenueId]);

    const liveVenueFeaturesRef = useRef(liveVenueFeatures);
    const liveKey = JSON.stringify(liveVenueFeatures);
    useEffect(() => {
        liveVenueFeaturesRef.current = liveVenueFeatures;
    }, [liveKey]);

    // Keep refs stable for use inside event handlers
    const weatherColorFnRef   = useRef(weatherColorFn);
    const cozyFilterActiveRef = useRef(cozyFilterActive);
    useEffect(() => { weatherColorFnRef.current   = weatherColorFn;   }, [weatherColorFn]);
    useEffect(() => { cozyFilterActiveRef.current = cozyFilterActive; }, [cozyFilterActive]);
    const isNightRef = useRef(isNight);
    useEffect(() => { isNightRef.current = isNight; }, [isNight]);
    const nightModeRef = useRef(nightMode);
    useEffect(() => { nightModeRef.current = nightMode; }, [nightMode]);

    const placeUserMarker = useCallback((lng, lat) => {
        const mapInst = map.current;
        if (!mapInst) return;
        try {
            if (userMarkerRef.current) {
                userMarkerRef.current.setLngLat([lng, lat]);
                return;
            }
            userMarkerRef.current = new mapboxgl.Marker({
                element: createUserLocationEl(),
                ...MAP_SURFACE_MARKER,
            })
                .setLngLat([lng, lat])
                .addTo(mapInst);
        } catch (e) {
            console.warn('[VenueMap] user marker failed:', e?.message);
        }
    }, []);

    // ── Imperative API ──────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        flyTo: (opts) => map.current?.flyTo(opts),

        // Frame the given venues, like the filter-change fitBounds. A paused
        // or lost map is skipped, not retried.
        fitVenues: (venuesToFit) => {
            if (!map.current) return;
            const bounds = getBoundsFromVenues(Array.isArray(venuesToFit) ? venuesToFit : []);
            if (!bounds) return;
            try {
                map.current.fitBounds(bounds, { padding: 50, duration: 800, maxZoom: 16, essential: false });
            } catch (e) {
                console.warn('[VenueMap] fitVenues failed:', e?.message);
            }
        },

        resizeAndFly: ([lng, lat]) => {
            if (!map.current) return;
            const generation = cameraGuardRef.current.generation;
            const handle = {
                cleared: false,
                id: 0,
                cancel() {
                    this.cleared = true;
                    clearTimeout(this.id);
                },
            };
            handle.id = setTimeout(() => {
                handle.cleared = true;
                pendingTimersRef.current.delete(handle.id);
                const decision = dispatchGenerationCallback(cameraGuardRef.current, generation, 'flyTo', () => {
                    if (staleGenerationsRef.current.has(generation) || mapGenerationRef.current !== generation) return;
                    map.current?.flyTo({
                        center:    [lng, lat],
                        zoom:      15,
                        pitch:     45,
                        duration:  900,
                        essential: false,
                        padding:   FLY_TO_PADDING,
                    });
                });
                cameraGuardRef.current = decision.state;
            }, 300);
            pendingTimersRef.current.add(handle.id);
            cameraGuardRef.current = trackCameraTimer(cameraGuardRef.current, handle);
        },

        locateUser: ({ lng, lat, zoom = 14, duration = 1100 } = {}) => {
            const nLng = Number(lng);
            const nLat = Number(lat);
            if (!map.current || !Number.isFinite(nLng) || !Number.isFinite(nLat)) return;
            hasFlownToBounds.current = true;
            try {
                placeUserMarker(nLng, nLat);
                map.current.flyTo({
                    center:    [nLng, nLat],
                    zoom,
                    duration,
                    essential: false,
                });
            } catch (e) {
                console.warn('[VenueMap] locateUser failed:', e?.message);
            }
        },

        getMap: () => map.current,
    }), [placeUserMarker]);

    const applyRecovery = (next) => {
        recoveryRef.current = next;
        setRecovery(next);
    };

    // ── Initialise map ONCE, then again only from Resume map ────────
    useEffect(() => {
        function mountMap(reason) {
        if (map.current || mapInitLockRef.current) return;
        if (!MAPBOX_TOKEN?.startsWith('pk.')) {
            setMapError(true);
            return;
        }
        if (!mapContainer.current) return;

        let generation = recoveryRef.current.generation;
        if (reason === 'resume') {
            if (recoveryRef.current.phase !== 'resuming') return;
            mapGenerationRef.current = generation;
        } else {
            const started = startMapLoad(recoveryRef.current);
            if (!started.ok) return;
            applyRecovery(started.state);
            generation = started.state.generation;
        }
        cameraGuardRef.current = createGenerationCamera(generation);

        const isCurrent = () => (
            generation === recoveryRef.current.generation
            && !staleGenerationsRef.current.has(generation)
        );
        const mountClaim = claimMapboxMount();
        if (!mountClaim.ok) {
            if (reason === 'resume') {
                const failed = noteResumeFailed(recoveryRef.current, generation, Date.now());
                if (failed.ok) applyRecovery(failed.state);
                noteMapboxContextLost(Date.now());
            } else {
                applyRecovery(releaseInitLock(recoveryRef.current, 'abort').state);
            }
            return undefined;
        }
        mapInitLockRef.current = true;

        mapboxgl.accessToken = MAPBOX_TOKEN;
        let disposed = false;
        let cleaned = false;
        let resizeObserver;
        let resizeFrame = 0;
        let removeWakeListeners = () => {};
        let removeUserCameraListener = () => {};
        const loadTimeout = setTimeout(() => {
            if (disposed || !isCurrent()) return;
            if (recoveryRef.current.phase === 'resuming') {
                teardownMap('failed-resume');
                return;
            }
            setMapError(true);
        }, 15000);

        // Detect touch/mobile devices up front. MSAA antialiasing sharpens the
        // 3D building edges but raises GPU memory pressure, which is a known
        // trigger for WebGL context loss on iOS Safari — so it stays desktop-only
        // to preserve the existing mobile stability work.
        const isMobileDevice = typeof navigator !== 'undefined'
            && (navigator.maxTouchPoints > 0 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));

        const memoryOptions = mapMemoryOptions(isMobileDevice);
        const reduceMobileGpu = () => {
            if (!isMobileDevice || disposed || !map.current) return;
            suppressMobileGpuLayers(map.current);
        };

        try {
            map.current = new mapboxgl.Map({
                container:           mapContainer.current,
                style:               MAP_STYLE,
                center:              [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
                zoom:                INITIAL_VIEW_STATE.zoom,
                // Keep the camera on greater Melbourne. Every live and demo
                // venue sits inside MAX_BOUNDS, so nothing becomes unreachable,
                // and users can no longer zoom out to the whole planet or pan
                // off to an empty map.
                maxBounds:           MAX_BOUNDS,
                minZoom:             9,
                maxZoom:             18,
                pitch:               45,
                bearing:             -17.6,
                antialias:           memoryOptions.antialias,
                cooperativeGestures: false,
                fadeDuration:        0,
                maxTileCacheSize:    memoryOptions.maxTileCacheSize,
                customAttribution:   CITY_BUILDINGS_ATTRIBUTION,
                ...(memoryOptions.config ? { config: memoryOptions.config } : {}),
            });

            const instance = map.current;
            const onUserCameraMove = (event) => {
                if (disposed || !isCurrent() || map.current !== instance) return;
                if (event.originalEvent) hasFlownToBounds.current = true;
            };
            instance.on('movestart', onUserCameraMove);
            removeUserCameraListener = () => instance.off('movestart', onUserCameraMove);

            if (reason === 'resume') {
                // Put the camera back where it was when the GPU context was lost.
                const cameraClaim = claimCameraRestore(cameraClaimRef.current, generation);
                cameraClaimRef.current = cameraClaim.claimed;
                if (cameraClaim.restore) restoreMapCamera(map.current, recoveryCameraRef.current);
            }

            let resizeSize = null;
            let pendingWidth = 0;
            let pendingHeight = 0;
            resizeObserver = new ResizeObserver((entries) => {
                const rect = entries?.[0]?.contentRect;
                pendingWidth = rect?.width ?? mapContainer.current?.clientWidth ?? 0;
                pendingHeight = rect?.height ?? mapContainer.current?.clientHeight ?? 0;
                const schedule = coalesceResizeSchedule(resizeFrame !== 0);
                if (schedule.replace) clearTimeout(resizeFrame);
                resizeFrame = setTimeout(() => {
                    resizeFrame = 0;
                    const decision = dispatchGenerationCallback(
                        cameraGuardRef.current,
                        generation,
                        'resize',
                        () => {},
                    );
                    cameraGuardRef.current = decision.state;
                    if (!decision.ran) return;
                    const phase = recoveryRef.current?.phase;
                    const plan = planMapResize({
                        width: pendingWidth,
                        height: pendingHeight,
                        previous: resizeSize,
                        generation,
                        currentGeneration: mapGenerationRef.current,
                        mapAlive: !disposed && !!map.current && phase !== 'paused' && phase !== 'resume-failed',
                    });
                    if (!plan.resize) return;
                    resizeSize = plan.size;
                    map.current.resize();
                }, schedule.settleMs);
            });
            resizeObserver.observe(mapContainer.current);

            // A tab left open in Safari can come back from the background or
            // the back/forward cache with the map canvas at a stale size: the
            // container never changed, so the ResizeObserver stays quiet, and
            // only a strip of the map draws. Re-measure when the page is shown.
            const onWake = (event) => {
                if (event?.type === 'visibilitychange' && document.visibilityState !== 'visible') return;
                if (disposed || !map.current || !isCurrent()) return;
                const phase = recoveryRef.current?.phase;
                if (phase === 'paused' || phase === 'resume-failed') return;
                try {
                    map.current.resize();
                    map.current.triggerRepaint();
                } catch (err) {
                    console.warn('[VenueMap] wake resize failed:', err?.message);
                }
            };
            window.addEventListener('pageshow', onWake);
            document.addEventListener('visibilitychange', onWake);

            // iOS Safari can grow the map box (toolbar collapse, 100dvh) without
            // a ResizeObserver callback, leaving the canvas at its old height
            // and the bottom of the map undrawn. Compare box and canvas after
            // each render and on viewport changes; resize only on a mismatch.
            // This is a size check, not a WebGL retry.
            const syncCanvasSize = () => {
                if (disposed || !map.current || !isCurrent()) return;
                const phase = recoveryRef.current?.phase;
                if (phase === 'paused' || phase === 'resume-failed') return;
                try {
                    const box = mapContainer.current;
                    const canvas = map.current.getCanvas?.();
                    if (!box || !canvas) return;
                    const outOfSync = canvasOutOfSync(
                        { width: box.clientWidth, height: box.clientHeight },
                        { width: canvas.clientWidth, height: canvas.clientHeight },
                    );
                    if (!outOfSync) return;
                    map.current.resize();
                    map.current.triggerRepaint();
                } catch (err) {
                    console.warn('[VenueMap] canvas size sync failed:', err?.message);
                }
            };
            const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
            window.addEventListener('resize', syncCanvasSize);
            window.addEventListener('orientationchange', syncCanvasSize);
            viewport?.addEventListener?.('resize', syncCanvasSize);
            map.current.on('idle', syncCanvasSize);
            const mapForSync = map.current;
            removeWakeListeners = () => {
                window.removeEventListener('pageshow', onWake);
                document.removeEventListener('visibilitychange', onWake);
                window.removeEventListener('resize', syncCanvasSize);
                window.removeEventListener('orientationchange', syncCanvasSize);
                viewport?.removeEventListener?.('resize', syncCanvasSize);
                try { mapForSync.off('idle', syncCanvasSize); } catch { /* map already removed */ }
            };

            map.current.on('load', () => {
                if (disposed || !map.current || !isCurrent()) return;
                clearTimeout(loadTimeout);
                // Hide Mapbox Standard's default POI labels so they don't compete
                // with our custom venue markers. (Standard exposes basemap config
                // properties instead of individual symbol layers.)
                try {
                    map.current.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
                } catch (e) {
                    console.warn('[VenueMap] hide POI labels failed:', e?.message);
                }
                reduceMobileGpu();
                // Global 3D lighting (and its cast shadows) is owned by the
                // TimeOfDayLight slider, which applies map.setLights() as soon as
                // the map reports loaded — no legacy setLight() needed here.
                map.current.dragRotate.disable();
                map.current.touchZoomRotate.disableRotation();
                if (reason === 'resume') {
                    mapGenerationRef.current = generation;
                    mapInitLockRef.current = false;
                    setMapLoaded(true);
                    setMapError(false);
                    return;
                }
                const loaded = noteMapLoaded(recoveryRef.current, generation);
                if (loaded.ok) {
                    mapGenerationRef.current = loaded.state.generation;
                    applyRecovery(loaded.state);
                    clearMapboxContextLoss();
                }
                mapInitLockRef.current = false;
                setMapLoaded(true);
                setMapError(false);
            });

            map.current.on('style.load', () => {
                if (disposed || !isCurrent()) return;
                reduceMobileGpu();
            });

            map.current.on('error', (e) => {
                if (disposed || !isCurrent()) return;
                const msg = e.error?.message || e.message || '';
                if (isSuppressedMapError(msg)) return;
                if (msg.includes('401') || msg.includes('403') || msg.includes('access token')) {
                    clearTimeout(loadTimeout);
                    if (recoveryRef.current.phase === 'resuming') {
                        teardownMap('failed-resume');
                        return;
                    }
                    setMapError(true);
                }
            });

            map.current.addControl(
                new mapboxgl.NavigationControl({ showCompass: false }),
                'top-right'
            );
            const canvas = map.current.getCanvas();
            let contextLossHandled = false;
            let contextLossTimer = 0;
            const handleWebglContextLost = (event) => {
                event.stopImmediatePropagation();
                event.stopPropagation();
                if (contextLossHandled || staleGenerationsRef.current.has(generation)) return;
                contextLossHandled = true;
                staleGenerationsRef.current.add(generation);
                const now = Date.now();
                noteMapboxContextLost(now);
                recoveryCameraRef.current = captureMapCamera(map.current);
                Sentry.captureMessage('WebGL Context Lost', { level: 'warning', tags: { type: 'gpu_crash' } });
                const paused = noteContextLost(recoveryRef.current, generation, now);
                if (paused.ok) {
                    applyRecovery(paused.state);
                }
                contextLossTimer = setTimeout(() => {
                    pendingTimersRef.current.delete(contextLossTimer);
                    teardownMap('context-loss');
                }, 0);
                pendingTimersRef.current.add(contextLossTimer);
            };
            const handleWebglContextRestored = (event) => {
                event.stopImmediatePropagation();
                event.stopPropagation();
            };
            if (canvas && typeof canvas.addEventListener === 'function') {
                canvas.addEventListener('webglcontextlost', handleWebglContextLost, true);
                canvas.addEventListener('webglcontextrestored', handleWebglContextRestored, true);
            }
            map.current._sunstayWebglContextLostHandler = handleWebglContextLost;
            map.current._sunstayWebglContextRestoredHandler = handleWebglContextRestored;
        } catch (err) {
            clearTimeout(loadTimeout);
            setMapError(true);
            if (!map.current) {
                releaseMapboxMount();
                mapInitLockRef.current = false;
                if (reason === 'resume') {
                    const failed = noteResumeFailed(recoveryRef.current, generation, Date.now());
                    if (failed.ok) applyRecovery(failed.state);
                    noteMapboxContextLost(Date.now());
                } else {
                    applyRecovery(releaseInitLock(recoveryRef.current, 'failed-init').state);
                }
            }
        }

        function teardownMap(reason = 'unmount') {
            if (cleaned) return;
            cleaned = true;
            disposed = true;
            setMapLoaded(false);
            clearTimeout(loadTimeout);
            for (const timer of pendingTimersRef.current) clearTimeout(timer);
            pendingTimersRef.current.clear();
            resizeObserver?.disconnect();
            removeUserCameraListener();
            removeWakeListeners();
            if (resizeFrame) clearTimeout(resizeFrame);
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            syncSchedulerRef.current = releaseMarkerSyncFrame(syncSchedulerRef.current);
            staleGenerationsRef.current.add(generation);
            cameraGuardRef.current = { ...cameraGuardRef.current, active: false };
            const retired = teardownGenerationCamera(cameraGuardRef.current, map.current);
            cameraGuardRef.current = retired;
            const lostCamera = retired.camera;
            if (lostCamera) recoveryCameraRef.current = lostCamera;
            let canvas = null;
            try { canvas = map.current?.getCanvas?.() ?? null; } catch { canvas = null; }
            const contextLostHandler = map.current?._sunstayWebglContextLostHandler;
            const contextRestoredHandler = map.current?._sunstayWebglContextRestoredHandler;
            const listeners = [];
            if (canvas && contextLostHandler) {
                listeners.push({ target: canvas, type: 'webglcontextlost', handler: contextLostHandler, capture: true });
            }
            if (canvas && contextRestoredHandler) {
                listeners.push({ target: canvas, type: 'webglcontextrestored', handler: contextRestoredHandler, capture: true });
            }
            const markers = [];
            releaseMarkerRecords(markersRef.current);
            markersRef.current = {};
            if (userMarkerRef.current) markers.push(userMarkerRef.current);

            if (controllerRef.current) {
                try {
                    controllerRef.current.dispose();
                } catch (err) {
                    console.warn('Error disposing MapsGL controller:', err);
                }
            }
            controllerRef.current = null;
            radarLayerAddedRef.current = false;

            // React 19 StrictMode can unmount this component before the style
            // finishes loading, and map.getLayer()/getSource() throw "Style is
            // not done loading" if touched too early — so guard style access with
            // isStyleLoaded() + try/catch (preserved from the StrictMode fix).
            // Mapbox Standard renders 3D buildings natively (no custom building
            // layer to remove); we still defensively tear down this component's
            // own analytical layers/sources before disposing the map.
            if (map.current?.isStyleLoaded?.()) {
                try {
                    [CLOUD_LAYER_ID, HEATMAP_LAYER_ID, CLUSTER_LAYER_ID].forEach((id) => {
                        if (map.current.getLayer(id)) map.current.removeLayer(id);
                    });
                    [CLOUD_SOURCE_ID, HEATMAP_SOURCE_ID, CLUSTER_SOURCE_ID].forEach((id) => {
                        if (map.current.getSource(id)) map.current.removeSource(id);
                    });
                } catch (err) {
                    console.warn('Style cleanup skipped:', err);
                }
            }
            const removal = noteMapRemoved(recoveryRef.current, generation);
            recoveryRef.current = removal.state;
            const released = removal.remove
                ? releaseMapOwners({
                    markers,
                    listeners,
                    map: map.current,
                })
                : { markerCleanups: 0, listenerCleanups: 0, removeCalls: 0 };
            markersRef.current = {};
            userMarkerRef.current = null;
            map.current = null;
            if (released.removeError) {
                console.warn('[VenueMap] map.remove failed:', released.removeError);
            }
            releaseMapboxMount();
            mapInitLockRef.current = false;
            if (reason === 'failed-resume') {
                const failed = noteResumeFailed(recoveryRef.current, generation, Date.now());
                if (failed.ok) applyRecovery(failed.state);
                noteMapboxContextLost(Date.now());
            } else if (reason !== 'context-loss') {
                applyRecovery(releaseInitLock(recoveryRef.current, reason === 'unmount' ? 'unmount' : 'abort').state);
            }
        }

        teardownMapRef.current = teardownMap;
        }

        mountMapRef.current = mountMap;
        mountMap('initial');
        return () => {
            mountMapRef.current = null;
            teardownMapRef.current('unmount');
        };
    }, []);

    useEffect(() => {
        if (recovery.phase !== 'resuming' || recovery.resumeStartedAt == null) return undefined;
        const delay = recovery.resumeStartedAt + 3000 - Date.now();
        if (delay <= 0) return undefined;
        const timer = setTimeout(() => setCooldownNow(Date.now()), delay);
        return () => clearTimeout(timer);
    }, [recovery.phase, recovery.resumeStartedAt]);

    useEffect(() => {
        if (recovery.cooldownUntil == null) return undefined;
        const delay = recovery.cooldownUntil - Date.now();
        if (delay <= 0) {
            setCooldownNow(Date.now());
            return undefined;
        }
        const timer = setTimeout(() => setCooldownNow(Date.now()), delay);
        return () => clearTimeout(timer);
    }, [recovery.cooldownUntil]);

    const onResumeMap = () => {
        if (map.current || mapInitLockRef.current) return;
        const decision = requestMapResume(recoveryRef.current, Date.now());
        if (!decision.ok) return;
        applyRecovery(decision.state);
        mountMapRef.current?.('resume');
    };

    finishResumeRef.current = (generation) => {
        const activeGeneration = recoveryRef.current.generation;
        if (recoveryRef.current.phase !== 'resuming') return;
        if (generation !== activeGeneration || mapGenerationRef.current !== activeGeneration) return;
        const loaded = noteMapLoaded(recoveryRef.current, generation);
        if (!loaded.ok) return;
        mapGenerationRef.current = loaded.state.generation;
        applyRecovery(loaded.state);
        clearMapboxContextLoss();
    };



    // ── Cloud toggle ────────────────────────────────────────────────
    useEffect(() => {
        if (!mapLoaded || !map.current || recovery.phase === 'resuming') return;
        if (cloudOn) {
            addOrUpdateCloudLayer(map.current);
        } else {
            removeCloudLayer(map.current);
        }
    }, [cloudOn, mapLoaded, recovery.phase, recovery.resumeAttempts, recovery.generation]);

    // ── Cluster source + GPU comfort heatmap ─────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const visibleVenues = filteredIdSet 
            ? safeVenues.filter(v => filteredIdSet.has(String(v.id)))
            : safeVenues;

        // Clustering only needs id, position and moment flags. The heatmap
        // weight ('score') goes to the heatmap's own source, so switching the
        // heatmap or a microclimate refresh never re-clusters every venue.
        const geojsonFeatures = clusterSourceFeatures(visibleVenues, (id) => pointMomentMatches(id, sunMomentsById));
        const heatmapData = () => heatmapSourceData(visibleVenues, (venue) => {
            const reading = readingForVenue(microById, venue.id, clusterTodMinutes);
            return markerScoreFromMicroclimate(reading) ?? (
                typeof calculateSunstayScore === 'function' ? calculateSunstayScore(venue) : 75
            );
        });

        const geojsonData = { type: 'FeatureCollection', features: geojsonFeatures };
        // setData makes Mapbox re-cluster and reload every tile, so skip it when
        // the payload is unchanged. Keyed to this source instance: a source
        // re-created after a map restart always gets its data.
        const payloadKey = geojsonPayloadKey(geojsonFeatures);
        clusterVenueIdsRef.current = new Set(visibleVenues.map((v) => String(v.id)));

        if (!map.current.getSource(CLUSTER_SOURCE_ID)) {
            map.current.addSource(CLUSTER_SOURCE_ID, {
                type: 'geojson',
                data: geojsonData,
                cluster: true,
                clusterProperties: CLUSTER_MOMENT_PROPERTIES,
                // Dense CBD streets stay clustered through zoom 16; pins split at 17.
                // At 14, zooming out or flying to a venue briefly made ~800 DOM pins.
                clusterMaxZoom: MAP_CLUSTER_MAX_ZOOM,
                clusterRadius: 50
            });
            
            // Dummy layer required to query rendered features
            map.current.addLayer({
                id: CLUSTER_LAYER_ID,
                type: 'circle',
                source: CLUSTER_SOURCE_ID,
                paint: { 'circle-radius': 0, 'circle-opacity': 0 }
            });
            clusterPayloadRef.current = { source: map.current.getSource(CLUSTER_SOURCE_ID), key: payloadKey };
        } else {
            const source = map.current.getSource(CLUSTER_SOURCE_ID);
            const previous = clusterPayloadRef.current;
            if (!previous || previous.source !== source || previous.key !== payloadKey) {
                source.setData(geojsonData);
                clusterPayloadRef.current = { source, key: payloadKey };
            }
        }

        if (comfortMapOn) {
            if (!map.current.getSource(HEATMAP_SOURCE_ID)) {
                map.current.addSource(HEATMAP_SOURCE_ID, { type: 'geojson', data: heatmapData() });

                const insertBefore = map.current.getLayer(LAYER_INSERT_BEFORE) ? LAYER_INSERT_BEFORE : undefined;
                map.current.addLayer({
                    id:      HEATMAP_LAYER_ID,
                    type:    'heatmap',
                    source:  HEATMAP_SOURCE_ID,
                    maxzoom: 15,
                    paint: {
                        'heatmap-weight':     ['coalesce', ['get', 'score'], 0.75],
                        'heatmap-intensity':  ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
                        'heatmap-color': [
                            'interpolate', ['linear'], ['heatmap-density'],
                            0,    'rgba(0,0,0,0)',
                            0.15, 'rgba(37,99,235,0.25)',
                            0.45, 'rgba(16,185,129,0.40)',
                            0.75, 'rgba(245,158,11,0.55)',
                            1.0,  'rgba(239,68,68,0.65)',
                        ],
                        'heatmap-radius':  ['interpolate', ['linear'], ['zoom'], 0, 3, 15, 55],
                        'heatmap-opacity': 0.45,
                    },
                }, insertBefore);
            } else {
                map.current.getSource(HEATMAP_SOURCE_ID).setData(heatmapData());
            }
            if (map.current.getLayer(HEATMAP_LAYER_ID)) {
                map.current.setLayoutProperty(HEATMAP_LAYER_ID, 'visibility', 'visible');
            }
        } else if (map.current.getLayer(HEATMAP_LAYER_ID)) {
            map.current.setLayoutProperty(HEATMAP_LAYER_ID, 'visibility', 'none');
        }
    }, [mapLoaded, safeVenues, filteredIdSet, comfortMapOn, weather, calculateSunstayScore, microById, clusterTodMinutes, sunMomentsById]);

    // ── fitBounds once ──────────────────────────────────────────────
    useEffect(() => {
        if (!mapLoaded || !map.current || hasFlownToBounds.current) return;
        if (safeVenues.length <= 2) return;

        const [[minLng, minLat], [maxLng, maxLat]] = MAX_BOUNDS;
        const melbourneVenues = safeVenues.filter((venue) => {
            const lng = Number(venue.lng);
            const lat = Number(venue.lat);
            return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
        });

        const bounds = getBoundsFromVenues(melbourneVenues) || getBoundsFromVenues(safeVenues);
        if (!bounds) return;
        try {
            map.current.fitBounds(bounds, {
                padding:   { top: 100, bottom: 200, left: 50, right: 50 },
                duration:  2000,
                essential: false,
            });
            hasFlownToBounds.current = true;
        } catch (e) {
            console.warn('[VenueMap] fitBounds failed:', e?.message);
        }
    }, [mapLoaded, safeVenues]);

    // ── fitBounds when the filtered pin set changes (not on first load) ──
    useEffect(() => {
        if (!mapLoaded || !map.current) return;

        const visibleVenues = filteredIdSet
            ? safeVenues.filter((v) => filteredIdSet.has(String(v.id)))
            : safeVenues;

        // Wait for venues so async first load becomes the baseline, not a filter change.
        if (safeVenues.length === 0) return;

        const nextKey = visibleVenueSetKey(visibleVenues);
        // Move the map only when the user changed a filter or search, not when
        // sun data or the time slider changed which venues the Sunny filter keeps.
        const refit = filterRefitNeeded({
            prevSetKey: filterBoundsKeyRef.current,
            nextSetKey: nextKey,
            prevFilterKey: filterChoiceKeyRef.current,
            nextFilterKey: filterKey,
        });
        filterBoundsKeyRef.current = nextKey;
        filterChoiceKeyRef.current = filterKey;
        if (!refit) return;

        if (visibleVenues.length === 0) return;

        const bounds = getBoundsFromVenues(visibleVenues);
        if (!bounds) return;
        try {
            map.current.fitBounds(bounds, {
                padding:   50,
                duration:  800,
                maxZoom:   16,
                essential: false,
            });
        } catch (e) {
            console.warn('[VenueMap] filter fitBounds failed:', e?.message);
        }
    }, [mapLoaded, safeVenues, filteredIdSet, filterKey]);

    // ── Sync clustered markers for the live map generation ─────────
    useEffect(() => {
        const instance = map.current;
        const generation = mapGenerationRef.current;
        const restoreGate = markerSyncAfterRestore({
            mapReady: mapLoaded === true,
            generation,
            currentGeneration: mapGenerationRef.current,
        });
        if (!instance || !generation || !restoreGate.sync) return undefined;

        const markerSignatureRef = { current: '' };
        const syncMarkers = (trigger = 'effect') => {
            const triggerPlan = markerSyncTriggerPlan(trigger);
            if (!triggerPlan.sync) return;
            const decision = dispatchGenerationCallback(
                cameraGuardRef.current,
                generation,
                'marker-sync',
                () => {},
            );
            cameraGuardRef.current = decision.state;
            if (!decision.ran) return;
            if (mapGenerationRef.current !== generation || map.current !== instance) {
                syncSchedulerRef.current = {
                    ...syncSchedulerRef.current,
                    ignored: syncSchedulerRef.current.ignored + 1,
                };
                return;
            }
            const requested = requestMarkerSync(syncSchedulerRef.current, generation);
            syncSchedulerRef.current = requested.scheduler;
            if (!requested.run) return;
            if (trigger === 'effect') markerSignatureRef.current = '';
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                if (mapGenerationRef.current !== generation || map.current !== instance) {
                    syncSchedulerRef.current = {
                        ...syncSchedulerRef.current,
                        frame: false,
                        ignored: syncSchedulerRef.current.ignored + 1,
                    };
                    return;
                }
                try {
                let sourceLoaded = false;
                try {
                    sourceLoaded = instance.isSourceLoaded(CLUSTER_SOURCE_ID) === true;
                } catch {
                    sourceLoaded = false;
                }
                const decision = markerSyncDecision({ sourceLoaded });
                if (!decision.sync) {
                    syncSchedulerRef.current = noteSourceWait(syncSchedulerRef.current);
                    return;
                }

                const features = featuresForMarkerSync(instance, CLUSTER_SOURCE_ID);
                const selectedId = selectedVenueIdRef.current != null ? String(selectedVenueIdRef.current) : null;
                const signature = `${markerFeatureSignature(features)}|${clusterMomentFeatureSignature(features, activeSunMoment)}|sel:${selectedId ?? ''}`;
                const gate = requiredMarkerGate({
                    sourceLoaded: true,
                    featureCount: features.length,
                });
                if (!gate.ready) {
                    syncSchedulerRef.current = noteSourceWait(syncSchedulerRef.current);
                    return;
                }
                if (trigger !== 'effect' && signature === markerSignatureRef.current) {
                    syncSchedulerRef.current = completeMarkerSync(syncSchedulerRef.current);
                    return;
                }
                markerSignatureRef.current = signature;
                const live = liveVenueFeaturesRef.current;
                const specs = [];

                features.forEach(feature => {
                    const coords = feature.geometry.coordinates;
                    const isCluster = feature.properties.cluster;

                    if (isCluster) {
                        const markerId = `cluster-${feature.properties.cluster_id}`;
                        const count = feature.properties.point_count;
                        const momentView = clusterMomentBadge(feature.properties, activeSunMoment);
                        const clusterPlan = markerCoordinatePlan({
                            id: markerId,
                            lng: coords?.[0],
                            lat: coords?.[1],
                        });
                        if (!clusterPlan.ok) {
                            return;
                        }
                        specs.push({
                            id: markerId,
                            update(existing) {
                                const countChanged = existing.count !== count;
                                syncExistingClusterMarker(existing, clusterPlan.coordinates, count, {
                                    updateCount(record, nextCount) {
                                        updateClusterMarkerEl(record.el, nextCount, momentView);
                                    },
                                });
                                if (!countChanged && (existing.momentBadge !== momentView.badge || existing.matchCount !== momentView.matchCount)) {
                                    updateClusterMarkerEl(existing.el, count, momentView);
                                }
                                existing.momentBadge = momentView.badge;
                                existing.matchCount = momentView.matchCount;
                            },
                            create() {
                                const el = createClusterMarkerEl(count, momentView);
                                el.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    if (mapGenerationRef.current !== generation || map.current !== instance) return;
                                    instance.easeTo({ center: clusterPlan.coordinates, zoom: instance.getZoom() + 2 });
                                });
                                const marker = new mapboxgl.Marker({ element: el, ...MAP_SURFACE_MARKER })
                                    .setLngLat(clusterPlan.coordinates)
                                    .addTo(instance);
                                return { marker, el, count, momentBadge: momentView.badge, matchCount: momentView.matchCount, isCluster: true, generation };
                            },
                        });
                        return;
                    }

                    pushVenueSpec(feature.properties.id);
                });

                // A selected venue inside a cluster (the card's fly-to lands at
                // zoom 15) still gets its own highlighted pin.
                if (selectedId && clusterVenueIdsRef.current.has(selectedId)
                    && !specs.some((spec) => spec.id === `venue-${selectedId}`)) {
                    pushVenueSpec(selectedId);
                }

                function pushVenueSpec(venueId) {
                    const venue = venuesMapRef.current.get(String(venueId));
                    if (!venue) return;
                    const venuePlan = markerCoordinatePlan(venue);
                    if (!venuePlan.ok) {
                        return;
                    }
                    const venueLng = venuePlan.longitude;
                    const venueLat = venuePlan.latitude;

                    const microReading = readingForVenue(microById, venue.id, clusterTodMinutes);
                    const pinKey = getPinStateKey(
                        venue,
                        weather,
                        live,
                        weatherColorFnRef.current,
                        cozyFilterActiveRef.current,
                        microReading,
                        weatherUnavailable || !weather,
                    );
                    const score = markerScoreForVenue(microReading, venue, calculateSunScore);
                    const emoji = venue.emoji ?? null;
                    const iconUrl = clayPinUrlFor(venue, CLAY_PIN_URLS);
                    const selected = String(selectedVenueIdRef.current ?? '') === String(venueId);
                    const highlighted = highlightedVenueIdRef.current != null && highlightedVenueIdRef.current === String(venueId);
                    const momentBadge = mapMomentBadge(venueId, activeSunMoment, sunMomentsById);
                    const venueName = String(venue.venueName || venue.name || venue.title || 'Venue');
                    const night = Boolean(isNightRef.current);
                    const afterDark = Boolean(nightModeRef.current);
                    const view = {
                        ...sunPinView({ pinKey, score, emoji, iconUrl, selected, highlighted, night, nightMode: afterDark }),
                        momentBadge, venueName,
                    };
                    specs.push({
                        id: `venue-${venueId}`,
                        update(existing) {
                            if (existing.pinKey !== pinKey || existing.score !== score
                                || existing.emoji !== emoji || existing.iconUrl !== iconUrl
                                || existing.momentBadge !== momentBadge || existing.venueName !== venueName
                                || existing.selected !== selected || Boolean(existing.highlighted) !== highlighted
                                || Boolean(existing.night) !== night || Boolean(existing.nightMode) !== afterDark) {
                                paintMarkerEl(existing.el, view);
                                existing.pinKey = pinKey;
                                existing.score = score;
                                existing.emoji = emoji;
                                existing.iconUrl = iconUrl;
                                existing.selected = selected;
                                existing.highlighted = highlighted;
                                existing.momentBadge = momentBadge;
                                existing.venueName = venueName;
                                existing.night = night;
                                existing.nightMode = afterDark;
                            }
                        },
                        create() {
                            const el = createMarkerEl(view);
                            el.addEventListener('click', (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (mapGenerationRef.current !== generation) return;
                                onVenueSelectRef.current?.(venue);
                            });
                            // Mouse/pen hover highlights the venue's list row; touch taps select instead.
                            el.addEventListener('pointerenter', (e) => {
                                if (!isHoverPointer(e) || mapGenerationRef.current !== generation) return;
                                pinHoverIdRef.current = String(venueId);
                                onVenueHoverRef.current?.(String(venueId), 'enter');
                            });
                            el.addEventListener('pointerleave', (e) => {
                                if (!isHoverPointer(e) || mapGenerationRef.current !== generation) return;
                                if (pinHoverIdRef.current === String(venueId)) pinHoverIdRef.current = null;
                                onVenueHoverRef.current?.(String(venueId), 'leave');
                            });
                            const marker = new mapboxgl.Marker({ element: el, ...MAP_SURFACE_MARKER })
                                .setLngLat([venueLng, venueLat])
                                .addTo(instance);
                            return { marker, el, pinKey, score, emoji, iconUrl, selected, highlighted, night, nightMode: afterDark, momentBadge, venueName, venueId: String(venueId), isCluster: false, generation };
                        },
                    });
                }

                const synced = syncMarkerLayer(markersRef.current, generation, specs);
                markersRef.current = synced.markers;
                const orphanedHover = orphanedPinHover(pinHoverIdRef.current, synced.markers);
                if (orphanedHover) {
                    pinHoverIdRef.current = null;
                    onVenueHoverRef.current?.(orphanedHover, 'leave');
                }
                const clusterCreated = synced.created.filter((id) => String(id).startsWith('cluster-')).length;
                syncSchedulerRef.current = completeMarkerSync(syncSchedulerRef.current, {
                    created: synced.created.length,
                    reused: synced.reused.length,
                    removed: synced.removed.length,
                    clusterCreated,
                    venueCreated: synced.created.length - clusterCreated,
                });
                const requiredReady = resumeMayGoLive({ requiredMarkersReady: gate.ready });
                if (
                    requiredReady
                    && recoveryRef.current.phase === 'resuming'
                    && recoveryRef.current.generation === generation
                ) {
                    finishResumeRef.current(generation);
                }
                } catch (err) {
                    syncSchedulerRef.current = noteSourceWait(syncSchedulerRef.current);
                    console.warn('[VenueMap] marker sync failed:', err?.message);
                }
            });
        };

        const onSourceData = (event) => {
            if (event?.sourceId && event.sourceId !== CLUSTER_SOURCE_ID) return;
            if (event.isSourceLoaded === false) return;
            if (!markerSyncTriggerPlan('sourcedata').sync) return;
            syncMarkers('sourcedata');
        };
        instance.on('sourcedata', onSourceData);
        syncSchedulerRef.current = noteMarkerListeners(syncSchedulerRef.current, 2);
        const unbind = bindMapGestureListeners(
            instance,
            generation,
            () => mapGenerationRef.current,
            (type) => {
                if (markerSyncTriggerPlan(type).sync) syncMarkers(type);
            },
            MARKER_SYNC_CAMERA_EVENTS,
        );
        syncMarkers('effect');
        syncMarkersRef.current = syncMarkers;

        return () => {
            if (syncMarkersRef.current === syncMarkers) syncMarkersRef.current = null;
            instance.off('sourcedata', onSourceData);
            unbind();
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            syncSchedulerRef.current = releaseMarkerSyncFrame(syncSchedulerRef.current);
            if (map.current !== instance || mapGenerationRef.current !== generation) {
                releaseMarkerRecords(markersRef.current);
                markersRef.current = {};
            }
        };
    }, [mapLoaded, recovery.generation, weather, weatherUnavailable, liveKey, cozyFilterActive, isNight, nightMode, weatherColorFn, calculateSunScore, microById, clusterTodMinutes, activeSunMoment, sunMomentsById]);

    // ── viewport bbox → microclimate fetch ──────────────────────────
    // Reported on settle rather than on every move frame; the hook debounces
    // again and ignores responses from a viewport the user has already left.
    useEffect(() => {
        if (!mapLoaded || !map.current) {
            onCameraSettle?.(null);
            return undefined;
        }
        const instance = map.current;

        const publishBounds = () => {
            if (map.current !== instance || staleGenerationsRef.current.has(mapGenerationRef.current)) return;
            const bounds = readMapBounds(instance);
            if (bounds) setBbox(bounds);
            else console.warn('[VenueMap] could not read viewport bounds; keeping the last bbox');
            const camera = captureMapCamera(instance);
            onCameraSettle?.(camera ? { lat: camera.lat, lng: camera.lng, zoom: camera.zoom } : null);
        };

        publishBounds();
        instance.on('moveend', publishBounds);
        instance.on('zoomend', publishBounds);

        return () => {
            try {
                instance.off('moveend', publishBounds);
                instance.off('zoomend', publishBounds);
            } catch { /* noop */ }
            onCameraSettle?.(null);
        };
    }, [mapLoaded, setBbox, onCameraSettle]);

    // ── "Search this area" pill ─────────────────────────────────────
    // Only a pan or zoom the user made offers it; flyTo, fitBounds and
    // Locate move the camera without an originalEvent and never do.
    const areaBaselineRef = useRef(null);
    const searchedAreaRef = useRef(searchedArea);
    useEffect(() => {
        searchedAreaRef.current = searchedArea;
        areaBaselineRef.current = searchedArea ?? readMapBounds(map.current);
        setAreaPrompt(null);
    }, [searchedArea]);

    useEffect(() => {
        if (!mapLoaded || !map.current || typeof onSearchArea !== 'function') return undefined;
        const instance = map.current;
        let userMove = false;

        const onMoveStart = (e) => { userMove = !!e?.originalEvent; };
        const onMoveEnd = () => {
            if (map.current !== instance) return;
            const bounds = readMapBounds(instance);
            if (!bounds) return;
            if (!userMove) {
                // Programmatic camera moves reset the baseline while the
                // list still shows everything.
                if (!searchedAreaRef.current) areaBaselineRef.current = bounds;
                return;
            }
            userMove = false;
            setAreaPrompt(areaPromptNeeded(areaBaselineRef.current, bounds) ? bounds : null);
        };

        if (!areaBaselineRef.current) areaBaselineRef.current = searchedAreaRef.current ?? readMapBounds(instance);
        instance.on('movestart', onMoveStart);
        instance.on('moveend', onMoveEnd);
        return () => {
            try {
                instance.off('movestart', onMoveStart);
                instance.off('moveend', onMoveEnd);
            } catch { /* noop */ }
        };
    }, [mapLoaded, onSearchArea]);

    const onSearchAreaClick = useCallback((e) => {
        e.stopPropagation();
        if (!areaPrompt || typeof onSearchArea !== 'function') return;
        onSearchArea(areaPrompt);
        setAreaPrompt(null);
    }, [areaPrompt, onSearchArea]);

    // Forecast fetches read this instance to see if flyTo is still running.
    // Registration is not part of map construction or teardown.
    useEffect(() => {
        if (!mapLoaded || !map.current) return undefined;
        return registerMapCamera(map.current);
    }, [mapLoaded]);

    // ── selectedVenue: fly to pin ───────────────────────────────────
    useEffect(() => {
        if (!selectedVenue || !map.current) return;
        const plan = markerCoordinatePlan(selectedVenue);
        if (!plan.ok) return;

        const generation = cameraGuardRef.current.generation;
        const handle = {
            cleared: false,
            id: 0,
            cancel() {
                this.cleared = true;
                clearTimeout(this.id);
            },
        };
        handle.id = setTimeout(() => {
            handle.cleared = true;
            pendingTimersRef.current.delete(handle.id);
            const decision = dispatchGenerationCallback(cameraGuardRef.current, generation, 'flyTo', () => {
                const instance = map.current;
                if (!instance || staleGenerationsRef.current.has(generation) || mapGenerationRef.current !== generation) return;
                instance.flyTo({
                    center:    plan.coordinates,
                    zoom:      15,
                    pitch:     45,
                    duration:  900,
                    essential: false,
                    padding:   FLY_TO_PADDING,
                });
            });
            cameraGuardRef.current = decision.state;
        }, 300);
        pendingTimersRef.current.add(handle.id);
        cameraGuardRef.current = trackCameraTimer(cameraGuardRef.current, handle);

        return () => {
            handle.cancel();
            pendingTimersRef.current.delete(handle.id);
        };
    }, [selectedVenue]);

    // ── Xweather radar visibility ───────────────────────────────────
    useEffect(() => {
        if (!mapLoaded || !map.current || recovery.phase === 'resuming') return undefined;
        if (!showRadar && !controllerRef.current) return undefined;

        const instance = map.current;
        let cancelled = false;

        (async () => {
            try {
                if (showRadar && !controllerRef.current) {
                    if (!XWEATHER_CREDENTIALS) {
                        console.warn('[VenueMap] Rain radar needs VITE_XWEATHER_KEY as ID_SECRET');
                        return;
                    }
                    const { MapboxMapController, Account } = await loadMapsGl();
                    if (cancelled || map.current !== instance) return;
                    controllerRef.current = new MapboxMapController(instance, {
                        account: new Account(XWEATHER_CREDENTIALS.id, XWEATHER_CREDENTIALS.secret),
                    });
                }
                if (!controllerRef.current || cancelled) return;
                if (showRadar && !radarLayerAddedRef.current) {
                    controllerRef.current.addWeatherLayer('radar');
                    radarLayerAddedRef.current = true;
                }
                if (radarLayerAddedRef.current) {
                    controllerRef.current.setWeatherLayerVisibility('radar', showRadar);
                }
            } catch (e) {
                console.warn('[VenueMap] Xweather radar visibility update failed:', e?.message);
            }
        })();

        return () => { cancelled = true; };
    }, [mapLoaded, showRadar, recovery.phase, recovery.generation, recovery.resumeAttempts]);

    const layerOptions = [
        { id: 'radar', icon: 'rain', label: 'Rain radar', on: showRadar, disabled: false, toggle: () => setShowRadar(on => !on) },
        { id: 'comfort', icon: 'thermometer', label: 'Comfort heatmap', on: comfortMapOn, disabled: !mapLoaded, toggle: () => setComfortMapOn(on => !on) },
        ...(WEATHER_API_KEY
            ? [{ id: 'cloud', icon: 'cloud', label: 'Cloud cover', on: cloudOn, disabled: !mapLoaded, toggle: () => setCloudOn(on => !on) }]
            : []),
    ];
    const activeLayerCount = layerOptions.filter(option => option.on).length;

    const recoveryControl = mapRecoveryControl(recovery, cooldownNow);
    const webglRecovery = webglRecoveryView(webglLost ? recovery.phase : 'live', cooldownNow);

    // ── Render ──────────────────────────────────────────────────────
    return (
        <div className="relative h-full w-full max-lg:[&_.mapboxgl-ctrl-top-right]:hidden lg:[&_.mapboxgl-ctrl-bottom-right]:bottom-2 [&_.mapboxgl-ctrl-bottom-right]:bottom-[calc(env(safe-area-inset-bottom)+90px)] [&_.mapboxgl-ctrl-bottom-right]:right-[6.75rem]">
            <div
                ref={mapContainer}
                data-map-webgl-lost={webglLost ? '1' : '0'}
                data-map-recovery={recovery.phase}
                style={{ width: '100%', height: '100%', touchAction: 'none' }}
            />
            {recoveryControl.showResume || recoveryControl.showProgress || recoveryControl.showReload ? (
                <div
                    data-webgl-recovery="1"
                    role="status"
                    aria-live="polite"
                    className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px]"
                >
                    <div className={`flex flex-col items-center gap-3 rounded-2xl px-5 py-3 shadow-lg ${webglRecovery.surfaceClass}`}>
                        <span className="text-sm font-semibold tracking-tight">
                            {recoveryControl.status}
                        </span>
                        {recoveryControl.showResume ? (
                            <button
                                type="button"
                                onClick={onResumeMap}
                                disabled={recoveryControl.disabled}
                                aria-label="Resume map"
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-amber-500 px-4 text-sm font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                                style={{ minWidth: 44, minHeight: 44 }}
                            >
                                Resume map
                            </button>
                        ) : null}
                        {recoveryControl.showReload ? (
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                aria-label="Reload"
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-amber-500 px-4 text-sm font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                                style={{ minWidth: 44, minHeight: 44 }}
                            >
                                Reload
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {/* One Layers button instead of three floating map buttons. Rain
                radar stays reachable while Mapbox loads; the heatmap and cloud
                layers need the loaded map. */}
            {!mapError && (
                <div
                    className="ss-map-layer-controls absolute right-4 top-4 z-50 flex flex-col items-end gap-2 lg:right-14"
                    onTouchEnd={e => e.stopPropagation()}
                >
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLayersOpen(open => !open); }}
                        className={`relative ${CONTROL_BUTTON} rounded-full border border-white/60 bg-white/90 text-slate-800 shadow-[0_6px_24px_-8px_rgba(15,23,42,0.35)] active:bg-white`}
                        style={CONTROL_TOUCH_STYLE}
                        aria-label="Map layers"
                        aria-expanded={layersOpen}
                        aria-controls="map-layers-menu"
                    >
                        <Layers size={19} strokeWidth={2.25} aria-hidden="true" />
                        {activeLayerCount > 0 ? (
                            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-slate-900" aria-hidden="true">
                                {activeLayerCount}
                            </span>
                        ) : null}
                    </button>
                    {layersOpen ? (
                        <div
                            id="map-layers-menu"
                            role="group"
                            aria-label="Map layers"
                            className="w-[208px] overflow-hidden rounded-2xl border border-slate-900/[0.06] bg-white py-1 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.4)]"
                        >
                            {layerOptions.map(option => (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="switch"
                                    aria-checked={option.on}
                                    disabled={option.disabled}
                                    onClick={(e) => { e.stopPropagation(); option.toggle(); }}
                                    className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-[14px] font-semibold text-slate-800 transition-colors active:bg-slate-50 disabled:opacity-40"
                                    style={CONTROL_TOUCH_STYLE}
                                >
                                    <ClayIcon name={option.icon} size={26} />
                                    <span className="flex-1">{option.label}</span>
                                    {option.on ? <Check size={16} strokeWidth={2.5} className="text-amber-600" aria-hidden="true" /> : null}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
            )}

            {areaPrompt && !selectedVenue && !webglLost && mapLoaded && !mapError ? (
                <div className="ss-map-search-area pointer-events-none absolute inset-x-0 top-4 z-50 flex justify-center px-20">
                    <button
                        type="button"
                        onClick={onSearchAreaClick}
                        onTouchEnd={e => e.stopPropagation()}
                        className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-semibold text-slate-900 shadow-[0_6px_24px_-8px_rgba(15,23,42,0.45)] ring-1 ring-inset ring-slate-900/[0.08] transition-colors touch-manipulation active:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                        style={CONTROL_TOUCH_STYLE}
                    >
                        <Search size={16} strokeWidth={2.5} aria-hidden="true" />
                        Search this area
                    </button>
                </div>
            ) : null}

            {/* Bottom-center stack: Filters sits cleanly above the TOD slider */}
            <div className="ss-map-bottom-controls pointer-events-none absolute inset-x-0 z-40 bottom-[calc(env(safe-area-inset-bottom)+90px)] lg:bottom-[46px]">
                <div className="absolute bottom-0 left-4 right-[6.75rem] flex flex-col items-center gap-4">
                    {filtersControl ? (
                        <div className="pointer-events-auto lg:hidden">
                            {filtersControl}
                        </div>
                    ) : null}
                    <TimeOfDayLight mapRef={map} mapLoaded={mapLoaded} generation={recovery.generation}
                        mapGenerationRef={mapGenerationRef} staleGenerationsRef={staleGenerationsRef} nightMode={nightMode}
                        isVenueSelected={!!selectedVenue} todMinutes={todMinutes} />
                </div>
            </div>

            {(!mapLoaded || mapError) && !recovery.sessionLocked && (
                <div className="ss-map-state" style={styles.overlay}>
                    {mapError ? (
                        <div style={{ textAlign: 'center', padding: 24 }}>
                            <ClayIcon name="sun" size={64} className="mx-auto mb-4" />
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600 }}>Map failed to load</p>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center' }}>
                            <ClayIcon name="sun" size={64} className="mx-auto" />
                            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 10, fontSize: 13 }}>Loading map...</p>
                        </div>
                    )}
                </div>
            )}
            {mapLoaded && !mapError && (captionBadge || cozyFilterActive) && (
                <div className="ss-map-caption">
                    <div className="ss-map-caption-inner" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {captionBadge && (
                            <DataBadge
                                kind={captionBadge.kind}
                                updatedAt={captionBadge.updatedAt}
                                source={captionBadge.source}
                                size="sm"
                            />
                        )}
                        {cozyFilterActive && <span className="inline-flex items-center gap-1"><ClayIcon name="indoor-warmth" size={20} />Cozy filter on</span>}
                    </div>
                </div>
            )}
        </div>
    );
});

VenueMap.displayName = 'VenueMap';

const styles = {
    overlay: {
        position: 'absolute', inset: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,15,30,0.95)',
    },
};

export default memo(VenueMap);
