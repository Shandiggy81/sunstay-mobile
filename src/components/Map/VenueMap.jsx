import React, {
    useEffect, useMemo, useRef, useState, useCallback,
    forwardRef, useImperativeHandle, memo,
} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import SunCalc from 'suncalc';
import { MapboxMapController, Account } from '@xweather/mapsgl';
import { MAPBOX_TOKEN, MAP_STYLE, INITIAL_VIEW_STATE, MAX_BOUNDS } from '../../config/mapConfig';
import { useWeather } from '../../context/WeatherContext';
import { melbourneDate } from '../../utils/sunPosition';
import {
    TOD_DAY_START_MIN as DAY_START_MIN,
    TOD_DAY_END_MIN as DAY_END_MIN,
    TOD_SLIDER_STEP_MIN,
    localTimeToSliderMinutes,
} from '../../utils/todMinutes';
import { motion } from 'framer-motion';

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

function getPinStateKey(venue, weather, liveVenueFeatures, weatherColorFn, cozyFilterActive) {
    // If a custom weatherColorFn is provided, let it take priority
    if (typeof weatherColorFn === 'function') {
        const fnResult = weatherColorFn(weather, venue);
        if (fnResult && PIN_STATES[fnResult]) return fnResult;
    }

    // Cozy filter active: highlight cozy venues differently
    if (cozyFilterActive) {
        const live = liveVenueFeatures?.[venue.id] || {};
        if (live.fireplaceOn || venue.fireplaceOn) return 'heater';
        if (live.heatersOn || live.roofClosed || venue.hasCozy) return 'cozy';
    }

    const live = liveVenueFeatures?.[venue.id] || {};
    const apparentTemp = weather?.apparentTemp ?? weather?.main?.feels_like ?? weather?.main?.temp ?? 20;
    const precipProb   = weather?.precipProbability ?? 0;
    const cloudCover   = weather?.cloudCoverPct ?? weather?.clouds?.all ?? 0;
    const condition    = (weather?.weather?.[0]?.main || '').toLowerCase();
    const heatersOn    = !!live.heatersOn || !!live.fireplaceOn || !!venue.heatersOn || !!venue.fireplaceOn;
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

const isFiniteCoord = (v) => Number.isFinite(Number(v));
const isRenderableVenue = (v) => {
    if (v?.id == null) return false;
    const lng = Number(v.lng);
    const lat = Number(v.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
    // Swap guard: catch Supabase lat/lng column transpositions early.
    // Valid world coords: lat ∈ [-90, 90], lng ∈ [-180, 180].
    if (lat > 90 || lat < -90 || lng < -180 || lng > 180) {
        console.warn(`[VenueMap] Possible lat/lng swap for venue ${v.id}: lat=${lat}, lng=${lng}`);
        return false;
    }
    return true;
};

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

// ── Mini Sunstay Score badge (mirrors the list card + detail sheet ramp) ──
const SCORE_BADGE_TIERS = [
    { min: 75, bg: '#059669' }, // emerald — prime conditions
    { min: 50, bg: '#D97706' }, // amber — good conditions
    { min: 0,  bg: '#0284C7' }, // sky — worth a look
];

function getScoreBadgeColor(score) {
    return (SCORE_BADGE_TIERS.find(t => score >= t.min) || SCORE_BADGE_TIERS[SCORE_BADGE_TIERS.length - 1]).bg;
}

function createScoreBadgeEl(score) {
    const badge = document.createElement('div');
    badge.className = 'ss-pin-score-badge';
    badge.style.cssText = [
        'position:absolute', 'top:-3px', 'right:-3px',
        'min-width:18px', 'height:18px', 'padding:0 3px',
        'border-radius:9px', 'border:2px solid #fff',
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:9px', 'font-weight:800', 'color:#fff',
        'box-shadow:0 1px 3px rgba(0,0,0,0.35)',
        'pointer-events:none', 'line-height:1', 'z-index:20',
        `background:${getScoreBadgeColor(score)}`,
    ].join(';');
    badge.textContent = String(score);
    return badge;
}

function syncScoreBadge(el, score) {
    let badge = el.querySelector('.ss-pin-score-badge');
    if (Number.isFinite(score)) {
        if (!badge) {
            el.appendChild(createScoreBadgeEl(score));
        } else {
            badge.textContent = String(score);
            badge.style.background = getScoreBadgeColor(score);
        }
    } else if (badge) {
        badge.remove();
    }
}

// ── Marker DOM helpers ──────────────────────────────────────────────────
function createMarkerEl(pinKey, score) {
    const { emoji, bg, border, color } = PIN_STATES[pinKey] || PIN_STATES.default;

    const el = document.createElement('div');
    el.style.cssText = 'width:40px; height:40px; display:flex; align-items:center; justify-content:center; position:relative;';

    const isSunny = pinKey === 'sunshine' || pinKey === 'sunny';

    if (isSunny) {
        const ring = document.createElement('div');
        ring.className = 'absolute inset-0 rounded-full animate-ping';
        ring.style.cssText = 'background: rgba(245, 158, 11, 0.4); opacity: 0.75; animation-duration: 2s; pointer-events: none;';
        el.appendChild(ring);
    }

    const inner = document.createElement('div');
    inner.className = 'ss-pin-inner';

    inner.style.cssText = [
        'width:40px', 'height:40px', 'border-radius:50%',
        `background:${bg}`, `border:2px solid ${border}`, `color:${color || '#0f172a'}`,
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:20px', 'cursor:pointer',
        'box-shadow:0 2px 8px rgba(0,0,0,0.15)',
        'transition:transform 120ms ease, filter 120ms ease',
        'user-select:none', 'line-height:1',
        'will-change:transform',
        '-webkit-tap-highlight-color:transparent',
        'position:relative', 'z-index:10'
    ].join(';');

    inner.textContent = emoji;

    inner.addEventListener('mouseenter', () => { inner.style.transform = 'scale(1.15)'; });
    inner.addEventListener('mouseleave', () => { inner.style.transform = 'scale(1)'; });

    el.appendChild(inner);
    syncScoreBadge(el, score);
    return el;
}

function updateMarkerEl(el, pinKey, score) {
    const inner = el.querySelector('.ss-pin-inner');
    if (!inner) return;

    const { emoji, bg, border, color } = PIN_STATES[pinKey] || PIN_STATES.default;
    inner.textContent = emoji;
    inner.style.background = bg;
    inner.style.borderColor = border;
    inner.style.color = color || '#0f172a';

    const isSunny = pinKey === 'sunshine' || pinKey === 'sunny';
    const existingRing = el.querySelector('.animate-ping');

    if (isSunny && !existingRing) {
        const ring = document.createElement('div');
        ring.className = 'absolute inset-0 rounded-full animate-ping';
        ring.style.cssText = 'background: rgba(245, 158, 11, 0.4); opacity: 0.75; animation-duration: 2s; pointer-events: none;';
        el.insertBefore(ring, inner);
    } else if (!isSunny && existingRing) {
        existingRing.remove();
    }

    syncScoreBadge(el, score);
}

function createClusterMarkerEl(count) {
    const el = document.createElement('div');
    el.style.cssText = 'width:40px; height:40px; display:flex; align-items:center; justify-content:center;';
    
    const inner = document.createElement('div');
    inner.style.cssText = [
        'width:40px', 'height:40px', 'border-radius:50%',
        'background:#3B82F6', 'border:3px solid #1D4ED8',
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:16px', 'font-weight:bold', 'color:white',
        'cursor:pointer', 'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
        'transition:transform 120ms ease', 'user-select:none',
        'will-change:transform', '-webkit-tap-highlight-color:transparent'
    ].join(';');

    inner.textContent = count;

    inner.addEventListener('mouseenter', () => { inner.style.transform = 'scale(1.1)'; });
    inner.addEventListener('mouseleave', () => { inner.style.transform = 'scale(1)'; });

    el.appendChild(inner);
    return el;
}

function updateClusterMarkerEl(el, count) {
    const inner = el.querySelector('div');
    if (inner) inner.textContent = count;
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
const XWEATHER_KEY = (import.meta.env.VITE_XWEATHER_KEY || '').trim();
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

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function lerpColor(a, b, t) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// Translate a minutes-of-day value into Mapbox v3 3D-lighting parameters using
// the real Melbourne sun position from suncalc (computed for today's date).
function computeSunLight(minutes, lat, lng) {
    const { azimuth, altitude } = SunCalc.getPosition(melbourneDate(minutes), lat, lng);
    const azDeg  = rad2deg(azimuth);   // suncalc: 0 = due south, positive toward west
    const altDeg = rad2deg(altitude);  // suncalc: 0 = horizon, 90 = zenith

    // Mapbox directional-light azimuth: 0 = due north, proceeding clockwise.
    const azimuthal = (azDeg + 180 + 360) % 360;
    // Mapbox directional-light polar angle: 0 = straight overhead (short shadows),
    // 90 = at the horizon (long, raking shadows). Clamp so the sun stays above
    // ground even at dawn/dusk, keeping shadows long instead of disappearing.
    const polar = Math.max(5, Math.min(89, 90 - altDeg));

    // Daylight factor: 0 when the sun is at/below the horizon, 1 when it is high.
    const dayFactor = Math.max(0, Math.min(1, altDeg / 45));
    const color = lerpColor('#ffedd5', '#ffffff', dayFactor); // warm golden → crisp white
    const intensity = 0.5 + 0.5 * dayFactor;                  // dim at dawn/dusk → peak midday
    const ambientIntensity = 0.25 + 0.15 * dayFactor;         // low fill so shadows read strongly

    return { direction: [azimuthal, polar], color, intensity, ambientIntensity };
}

// Floating slider that scrubs the global 3D-building light. Local React
// state drives the thumb + clock while dragging so the UI stays at input
// rate. During scrub, map.setLights is throttled (~100ms) with cast-shadows
// off so the pitched Standard map stays interactive. A full lights+shadows
// pass runs once on settle. Score preview commits only on pointer-up /
// cancel / blur / keyup — never the live scrub path.
function TimeOfDayLight({ mapRef, mapLoaded, isVenueSelected = false }) {
    const { setScorePreviewMinutes } = useWeather();
    const [sliderMinutes, setSliderMinutes] = useState(() => localTimeToSliderMinutes());
    const minutesRef = useRef(sliderMinutes);
    const lightTimerRef = useRef(null);
    const lastLightApplyAtRef = useRef(0);
    const panPausedRef = useRef(false);

    const applyLight = useCallback((mins, { castShadows = true } = {}) => {
        const map = mapRef.current;
        if (!map || typeof map.setLights !== 'function') return;
        if (!map.isStyleLoaded || !map.isStyleLoaded()) return;
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
                        'cast-shadows': castShadows,
                        'shadow-intensity': castShadows ? 1 : 0,
                    },
                },
            ]);
        } catch (e) {
            console.warn('[VenueMap] setLights failed:', e?.message);
        }
    }, [mapRef]);

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
        if (!mapLoaded) return undefined;
        const map = mapRef.current;
        applyLight(minutesRef.current);
        // Mapbox Standard finishes wiring its own style/config lights shortly
        // after 'load'; re-apply once the map settles so our sun isn't overwritten.
        if (map && typeof map.once === 'function') {
            const reapply = () => applyLight(minutesRef.current);
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
        // Only (re)apply the baseline light when the map finishes loading.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapLoaded, applyLight, cancelPendingLight, resumeMapPan]);

    useEffect(() => () => {
        cancelPendingLight();
        resumeMapPan();
    }, [cancelPendingLight, resumeMapPan]);

    const handleScrub = (e) => {
        const v = Number(e.target.value);
        minutesRef.current = v;
        setSliderMinutes(v);
        scheduleScrubLight(v);
    };

    const settleScrub = () => {
        cancelPendingLight();
        const v = minutesRef.current;
        setSliderMinutes((prev) => (prev === v ? prev : v));
        lastLightApplyAtRef.current = performance.now();
        applyLight(v, { castShadows: true });
        // Score uses settled minutes only — never the live scrub path.
        if (typeof setScorePreviewMinutes === 'function') {
            setScorePreviewMinutes(v);
        }
    };

    const handleRangePointerDown = (e) => {
        pauseMapPan();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    };

    const handleRangeRelease = () => {
        settleScrub();
        resumeMapPan();
    };

    const clock = formatClock(sliderMinutes);

    return (
        <motion.div
            className={`relative z-40 w-full max-w-[340px] ${
                isVenueSelected ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
            initial={false}
            animate={isVenueSelected
                ? { y: 180, opacity: 0 }
                : { y: 0, opacity: 1 }
            }
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            aria-hidden={isVenueSelected}
            inert={isVenueSelected || undefined}
        >
            <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/85 px-4 py-2.5 shadow-lg backdrop-blur-md">
                <span className="select-none text-xl leading-none" aria-hidden="true">🌇</span>
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between">
                        <label htmlFor="tod-slider" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Time of day
                        </label>
                        <span
                            aria-live="polite"
                            className="text-xs font-bold tabular-nums text-slate-800"
                        >
                            {clock}
                        </span>
                    </div>
                    <input
                        id="tod-slider"
                        type="range"
                        min={DAY_START_MIN}
                        max={DAY_END_MIN}
                        step={TOD_SLIDER_STEP_MIN}
                        value={sliderMinutes}
                        onChange={handleScrub}
                        onPointerDown={handleRangePointerDown}
                        onFocus={pauseMapPan}
                        onPointerUp={handleRangeRelease}
                        onPointerCancel={handleRangeRelease}
                        onBlur={handleRangeRelease}
                        onKeyUp={settleScrub}
                        aria-label="Time of day for 3D building shadows"
                        aria-valuetext={clock}
                        className="h-6 w-full cursor-pointer accent-amber-500 touch-pan-x"
                    />
                </div>
            </div>
        </motion.div>
    );
}

// ══════════════════════════════════════════════════════════════════════
const VenueMap = forwardRef(({
    venues = [],
    selectedVenue,
    filteredVenueIds,
    onVenueSelect,
    liveVenueFeatures = {},
    // ── NEW: props wired from App.jsx ──────────────────────────────
    weatherColorFn    = null,   // (weather, venue) => pinKey string
    cozyWeatherActive = false,  // true when weather is cold/rainy
    cozyFilterActive  = false,  // true when user has 'Cozy' filter selected
    filtersControl    = null,   // Filters FAB — stacked above TOD, layout only
}, ref) => {
    const mapContainer     = useRef(null);
    const map              = useRef(null);
    const controllerRef    = useRef(null);
    const radarLayerAddedRef = useRef(false);
    const markersRef       = useRef({});
    const userMarkerRef    = useRef(null);
    const hasFlownToBounds = useRef(false);
    const filterBoundsKeyRef = useRef(null);
    const rafRef           = useRef(null);

    const [comfortMapOn, setComfortMapOn] = useState(false);
    const [cloudOn,      setCloudOn]      = useState(false);
    const [showRadar,    setShowRadar]    = useState(false);

    const [mapLoaded,    setMapLoaded]    = useState(false);
    const [mapError,     setMapError]     = useState(false);

    const { weather, calculateSunstayScore } = useWeather();

    const safeVenues = useMemo(
        () => (Array.isArray(venues) ? venues.filter(isRenderableVenue) : []),
        [venues]
    );
    const venuesMapRef = useRef(new Map());
    useEffect(() => {
        venuesMapRef.current = new Map(safeVenues.map(v => [String(v.id), v]));
    }, [safeVenues]);

    const filteredIdSet = useMemo(() => {
        if (!Array.isArray(filteredVenueIds)) return null;
        return new Set(filteredVenueIds.map(id => String(id)));
    }, [filteredVenueIds]);

    const onVenueSelectRef = useRef(onVenueSelect);
    useEffect(() => { onVenueSelectRef.current = onVenueSelect; }, [onVenueSelect]);

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

        resizeAndFly: ([lng, lat]) => {
            if (!map.current) return;
            setTimeout(() => {
                map.current?.resize();
                map.current?.flyTo({
                    center:    [lng, lat],
                    zoom:      15,
                    pitch:     45,
                    duration:  900,
                    essential: false,
                    padding:   FLY_TO_PADDING,
                });
            }, 300);
        },

        locateUser: ({ lng, lat, zoom = 14, duration = 1100 } = {}) => {
            const nLng = Number(lng);
            const nLat = Number(lat);
            if (!map.current || !Number.isFinite(nLng) || !Number.isFinite(nLat)) return;
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

    // ── Initialise map ONCE ─────────────────────────────────────────
    useEffect(() => {
        if (map.current) return;
        if (!MAPBOX_TOKEN?.startsWith('pk.')) { setMapError(true); return; }
        if (!mapContainer.current) return;

        mapboxgl.accessToken = MAPBOX_TOKEN;
        let disposed = false;
        let resizeObserver;
        const loadTimeout = setTimeout(() => { if (!disposed) setMapError(true); }, 15000);

        // Detect touch/mobile devices up front. MSAA antialiasing sharpens the
        // 3D building edges but raises GPU memory pressure, which is a known
        // trigger for WebGL context loss on iOS Safari — so it stays desktop-only
        // to preserve the existing mobile stability work.
        const isMobileDevice = typeof navigator !== 'undefined'
            && (navigator.maxTouchPoints > 0 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));

        try {
            map.current = new mapboxgl.Map({
                container:           mapContainer.current,
                style:               MAP_STYLE,
                center:              [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
                zoom:                INITIAL_VIEW_STATE.zoom,
                minZoom:             3,
                maxZoom:             18,
                pitch:               45,
                bearing:             -17.6,
                antialias:           !isMobileDevice,
                cooperativeGestures: false,
                fadeDuration:        0,
                maxTileCacheSize:    20,
            });

            resizeObserver = new ResizeObserver(() => {
                requestAnimationFrame(() => map.current?.resize());
            });
            resizeObserver.observe(mapContainer.current);

            map.current.on('load', () => {
                if (disposed || !map.current) return;
                clearTimeout(loadTimeout);
                // Hide Mapbox Standard's default POI labels so they don't compete
                // with our custom venue markers. (Standard exposes basemap config
                // properties instead of individual symbol layers.)
                try {
                    map.current.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
                } catch (e) {
                    console.warn('[VenueMap] hide POI labels failed:', e?.message);
                }
                const initializeWeatherController = () => {
                    if (controllerRef.current) return;
                    if (!XWEATHER_KEY) return;
                    try {
                        const account = new Account(XWEATHER_KEY);
                        const controller = new MapboxMapController(map.current, { account });
                        controllerRef.current = controller;
                        if (!isMobileDevice) {
                            controller.addWeatherLayer('radar');
                            controller.setWeatherLayerVisibility('radar', false);
                            radarLayerAddedRef.current = true;
                        }
                    } catch (e) {
                        console.warn('[VenueMap] Xweather radar setup failed:', e?.message);
                    }
                };
                initializeWeatherController();
                // Global 3D lighting (and its cast shadows) is owned by the
                // TimeOfDayLight slider, which applies map.setLights() as soon as
                // the map reports loaded — no legacy setLight() needed here.
                map.current.dragRotate.disable();
                map.current.touchZoomRotate.disableRotation();
                setMapLoaded(true);
                setMapError(false);
            });

            map.current.on('error', (e) => {
                if (disposed) return;
                const msg = e.error?.message || e.message || '';
                if (isSuppressedMapError(msg)) return;
                if (msg.includes('401') || msg.includes('403') || msg.includes('access token')) {
                    clearTimeout(loadTimeout);
                    setMapError(true);
                }
            });

            map.current.addControl(
                new mapboxgl.NavigationControl({ showCompass: false }),
                'top-right'
            );
            const canvas = map.current.getCanvas();
            const handleWebglContextLost = (event) => event.preventDefault();
            canvas.addEventListener('webglcontextlost', handleWebglContextLost, false);
            map.current._sunstayWebglContextLostHandler = handleWebglContextLost;
        } catch {
            clearTimeout(loadTimeout);
            setMapError(true);
        }

        return () => {
            disposed = true;
            clearTimeout(loadTimeout);
            resizeObserver?.disconnect();
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            const canvas = map.current?.getCanvas();
            const contextLostHandler = map.current?._sunstayWebglContextLostHandler;
            if (canvas && contextLostHandler) {
                canvas.removeEventListener('webglcontextlost', contextLostHandler, false);
            }
            Object.values(markersRef.current).forEach(({ marker }) => marker.remove());
            markersRef.current = {};
            if (userMarkerRef.current) {
                try { userMarkerRef.current.remove(); } catch { /* noop */ }
                userMarkerRef.current = null;
            }

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
            if (map.current) {
                if (map.current.isStyleLoaded && map.current.isStyleLoaded()) {
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
                map.current.remove();
                map.current = null;
            }
        };
    }, []);



    // ── Cloud toggle ────────────────────────────────────────────────
    useEffect(() => {
        if (!mapLoaded || !map.current) return;

        if (cloudOn) {
            addOrUpdateCloudLayer(map.current);
        } else {
            removeCloudLayer(map.current);
        }
    }, [cloudOn, mapLoaded]);

    // ── Cluster source + GPU comfort heatmap ─────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const visibleVenues = filteredIdSet 
            ? safeVenues.filter(v => filteredIdSet.has(String(v.id)))
            : safeVenues;

        const geojsonFeatures = visibleVenues.map(venue => {
            const rawScore = typeof calculateSunstayScore === 'function'
                ? calculateSunstayScore(venue)
                : 75;
            const weight = Number.isFinite(rawScore) ? Math.min(Math.max(rawScore / 100, 0), 1) : 0.75;
            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [Number(venue.lng), Number(venue.lat)] },
                properties: { id: venue.id, score: weight },
            };
        });

        const geojsonData = { type: 'FeatureCollection', features: geojsonFeatures };

        if (!map.current.getSource(CLUSTER_SOURCE_ID)) {
            map.current.addSource(CLUSTER_SOURCE_ID, {
                type: 'geojson',
                data: geojsonData,
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50
            });
            
            // Dummy layer required to query rendered features
            map.current.addLayer({
                id: CLUSTER_LAYER_ID,
                type: 'circle',
                source: CLUSTER_SOURCE_ID,
                paint: { 'circle-radius': 0, 'circle-opacity': 0 }
            });
        } else {
            map.current.getSource(CLUSTER_SOURCE_ID).setData(geojsonData);
        }

        if (!map.current.getSource(HEATMAP_SOURCE_ID)) {
            map.current.addSource(HEATMAP_SOURCE_ID, { type: 'geojson', data: geojsonData });

            const insertBefore = map.current.getLayer(LAYER_INSERT_BEFORE) ? LAYER_INSERT_BEFORE : undefined;
            map.current.addLayer({
                id:      HEATMAP_LAYER_ID,
                type:    'heatmap',
                source:  HEATMAP_SOURCE_ID,
                maxzoom: 15,
                paint: {
                    'heatmap-weight':     ['get', 'score'],
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
            map.current.getSource(HEATMAP_SOURCE_ID).setData(geojsonData);
        }

        if (map.current.getLayer(HEATMAP_LAYER_ID)) {
            map.current.setLayoutProperty(
                HEATMAP_LAYER_ID,
                'visibility',
                comfortMapOn ? 'visible' : 'none'
            );
        }
    }, [mapLoaded, safeVenues, filteredIdSet, comfortMapOn, weather, calculateSunstayScore]);

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
        if (filterBoundsKeyRef.current === null) {
            filterBoundsKeyRef.current = nextKey;
            return;
        }
        if (nextKey === filterBoundsKeyRef.current) return;
        filterBoundsKeyRef.current = nextKey;

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
    }, [mapLoaded, safeVenues, filteredIdSet]);

    // ── Sync clustered markers ───────────────────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const syncMarkers = () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                if (!map.current || !map.current.isSourceLoaded(CLUSTER_SOURCE_ID)) return;
                
                const features = map.current.queryRenderedFeatures({ layers: [CLUSTER_LAYER_ID] });
                const newMarkers = {};
                const live = liveVenueFeaturesRef.current;

                features.forEach(feature => {
                    const coords = feature.geometry.coordinates;
                    const isCluster = feature.properties.cluster;
                    let markerId = '';

                    if (isCluster) {
                        markerId = `cluster-${feature.properties.cluster_id}`;
                        const count = feature.properties.point_count;
                        let existing = markersRef.current[markerId];

                        if (existing) {
                            if (existing.count !== count) {
                                updateClusterMarkerEl(existing.el, count);
                                existing.count = count;
                            }
                        } else {
                            const el = createClusterMarkerEl(count);
                            el.addEventListener('click', (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                map.current.easeTo({ center: coords, zoom: map.current.getZoom() + 2 });
                            });
                            const marker = new mapboxgl.Marker({ element: el, ...MAP_SURFACE_MARKER })
                                .setLngLat(coords)
                                .addTo(map.current);
                            existing = { marker, el, count, isCluster: true };
                        }
                        newMarkers[markerId] = existing;
                    } else {
                        const venueId = feature.properties.id;
                        markerId = `venue-${venueId}`;
                        const venue = venuesMapRef.current.get(String(venueId));
                        if (!venue) return;

                        // FIX: Use the canonical venue coordinate, NOT feature.geometry.coordinates.
                        const venueLng = Number(venue.lng);
                        const venueLat = Number(venue.lat);
                        if (!Number.isFinite(venueLng) || !Number.isFinite(venueLat)) return;

                        const pinKey = getPinStateKey(
                            venue,
                            weather,
                            live,
                            weatherColorFnRef.current,
                            cozyFilterActiveRef.current,
                        );
                        const rawScore = typeof calculateSunstayScore === 'function'
                            ? calculateSunstayScore(venue)
                            : null;
                        const score = Number.isFinite(rawScore) ? Math.round(rawScore) : null;

                        let existing = markersRef.current[markerId];

                        if (existing) {
                            if (existing.pinKey !== pinKey) {
                                updateMarkerEl(existing.el, pinKey, score);
                                existing.pinKey = pinKey;
                                existing.score = score;
                            } else if (existing.score !== score) {
                                // Score-only change — cheap in-place DOM update, no marker recreation.
                                updateMarkerEl(existing.el, pinKey, score);
                                existing.score = score;
                            }
                        } else {
                            const el = createMarkerEl(pinKey, score);
                            el.addEventListener('click', (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onVenueSelectRef.current?.(venue);
                            });
                            const marker = new mapboxgl.Marker({ element: el, ...MAP_SURFACE_MARKER })
                                .setLngLat([venueLng, venueLat])
                                .addTo(map.current);
                            existing = { marker, el, pinKey, score, isCluster: false };
                        }
                        newMarkers[markerId] = existing;
                    }
                });

                Object.keys(markersRef.current).forEach(id => {
                    if (!newMarkers[id]) {
                        markersRef.current[id].marker.remove();
                    }
                });
                markersRef.current = newMarkers;
            });
        };

        syncMarkers();

        map.current.on('idle', syncMarkers);
        map.current.on('moveend', syncMarkers);

        return () => {
            if (map.current) {
                map.current.off('idle', syncMarkers);
                map.current.off('moveend', syncMarkers);
            }
        };
    }, [mapLoaded, weather, liveKey, cozyFilterActive, weatherColorFn, calculateSunstayScore]);

    // ── selectedVenue: fly to pin ───────────────────────────────────
    useEffect(() => {
        if (!selectedVenue || !map.current) return;
        const lng = Number(selectedVenue.lng);
        const lat = Number(selectedVenue.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

        const t = setTimeout(() => {
            map.current?.resize();
            map.current?.flyTo({
                center:    [lng, lat],
                zoom:      15,
                pitch:     45,
                duration:  900,
                essential: false,
                padding:   FLY_TO_PADDING,
            });
        }, 300);

        return () => clearTimeout(t);
    }, [selectedVenue]);

    // ── Xweather radar visibility ───────────────────────────────────
    useEffect(() => {
        if (!mapLoaded || !controllerRef.current) return;

        try {
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
    }, [mapLoaded, showRadar]);

    // ── Render ──────────────────────────────────────────────────────
    return (
        <div className="relative h-full w-full max-lg:[&_.mapboxgl-ctrl-top-right]:hidden lg:[&_.mapboxgl-ctrl-bottom-right]:bottom-2 [&_.mapboxgl-ctrl-bottom-right]:bottom-[calc(env(safe-area-inset-bottom)+90px)] [&_.mapboxgl-ctrl-bottom-right]:right-[6.75rem]">
            <div
                ref={mapContainer}
                style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}
            />

            {/* Dedicated rain-radar overlay toggle (on/off). lg:right-14 clears native Mapbox zoom. */}
            {mapLoaded && !mapError && (
                <button
                    onClick={(e) => { e.stopPropagation(); setShowRadar(!showRadar); }}
                    className={`absolute top-4 right-4 z-50 flex min-h-11 items-center gap-2 px-4 py-2.5 rounded-full shadow-lg font-bold text-sm backdrop-blur-md transition-all lg:right-14 ${
                        showRadar
                            ? 'bg-blue-600/95 text-white border-2 border-blue-400'
                            : 'bg-white/95 text-gray-800 border border-gray-200/80 hover:bg-gray-50'
                    }`}
                    aria-label={showRadar ? 'Hide rain radar' : 'Show rain radar'}
                    aria-pressed={showRadar}
                >
                    <span>🌧️</span>
                    <span>{showRadar ? 'Radar Active' : 'Live Radar'}</span>
                </button>
            )}

            {/* Bottom-center stack: Filters sits cleanly above the TOD slider */}
            <div className="pointer-events-none absolute inset-x-0 z-40 bottom-[calc(env(safe-area-inset-bottom)+90px)] lg:bottom-[46px]">
                <div className="absolute bottom-0 left-4 right-[6.75rem] flex flex-col items-center gap-4">
                    {filtersControl ? (
                        <div className="pointer-events-auto lg:hidden">
                            {filtersControl}
                        </div>
                    ) : null}
                    {mapLoaded && !mapError ? (
                        <TimeOfDayLight mapRef={map} mapLoaded={mapLoaded} isVenueSelected={!!selectedVenue} />
                    ) : null}
                </div>
            </div>

            {/* FAB stack */}
            {mapLoaded && !mapError && (
                <div
                    className="absolute top-20 right-4 z-20 flex flex-col gap-2"
                    style={{
                        touchAction:     'auto',
                        pointerEvents:   'auto',
                    }}
                    onTouchEnd={e => e.stopPropagation()}
                >

                    {/* Comfort Heatmap FAB */}
                    <button
                        onClick={() => setComfortMapOn(prev => !prev)}
                        onTouchEnd={e => { e.stopPropagation(); }}
                        title={comfortMapOn ? 'Hide comfort heatmap' : 'Show comfort heatmap'}
                        style={{
                            width:               44,
                            height:              44,
                            borderRadius:        '50%',
                            border:              comfortMapOn ? '2px solid #D97706' : '2px solid rgba(255,255,255,0.3)',
                            background:          comfortMapOn ? 'rgba(217,119,6,0.9)' : 'rgba(15,15,30,0.85)',
                            backdropFilter:      'blur(8px)',
                            WebkitBackdropFilter:'blur(8px)',
                            color:               '#fff',
                            fontSize:            20,
                            cursor:              'pointer',
                            display:             'flex',
                            alignItems:          'center',
                            justifyContent:      'center',
                            boxShadow:           '0 2px 10px rgba(0,0,0,0.4)',
                            transition:          'background 200ms ease, border-color 200ms ease',
                            WebkitTapHighlightColor: 'transparent',
                            touchAction:         'auto',
                        }}
                        aria-label={comfortMapOn ? 'Hide comfort heatmap' : 'Show comfort heatmap'}
                        aria-pressed={comfortMapOn}
                    >
                        🔥
                    </button>

                    {/* Cloud Cover FAB */}
                    {WEATHER_API_KEY && (
                        <button
                            onClick={() => setCloudOn(prev => !prev)}
                            onTouchEnd={e => { e.stopPropagation(); }}
                            title={cloudOn ? 'Hide cloud cover' : 'Show cloud cover'}
                            style={{
                                width:               44,
                                height:              44,
                                borderRadius:        '50%',
                                border:              cloudOn ? '2px solid #9CA3AF' : '2px solid rgba(255,255,255,0.3)',
                                background:          cloudOn ? 'rgba(156,163,175,0.9)' : 'rgba(15,15,30,0.85)',
                                backdropFilter:      'blur(8px)',
                                WebkitBackdropFilter:'blur(8px)',
                                color:               '#fff',
                                fontSize:            20,
                                cursor:              'pointer',
                                display:             'flex',
                                alignItems:          'center',
                                justifyContent:      'center',
                                boxShadow:           '0 2px 10px rgba(0,0,0,0.4)',
                                transition:          'background 200ms ease, border-color 200ms ease',
                                WebkitTapHighlightColor: 'transparent',
                                touchAction:         'auto',
                            }}
                            aria-label={cloudOn ? 'Hide cloud cover' : 'Show cloud cover'}
                            aria-pressed={cloudOn}
                        >
                            ☁️
                        </button>
                    )}

                    {/* Cozy weather indicator — shows when cozyWeatherActive */}
                    {cozyWeatherActive && (
                        <div
                            title="Cozy weather conditions active"
                            style={{
                                width:               44,
                                height:              44,
                                borderRadius:        '50%',
                                border:              '2px solid #F59E0B',
                                background:          'rgba(251,191,36,0.15)',
                                backdropFilter:      'blur(8px)',
                                WebkitBackdropFilter:'blur(8px)',
                                display:             'flex',
                                alignItems:          'center',
                                justifyContent:      'center',
                                fontSize:            20,
                                boxShadow:           '0 2px 10px rgba(0,0,0,0.3)',
                                pointerEvents:       'none',
                            }}
                            aria-label="Cozy weather active"
                        >
                            🧥
                        </div>
                    )}
                </div>
            )}

            {(!mapLoaded || mapError) && (
                <div style={styles.overlay}>
                    {mapError ? (
                        <div style={{ textAlign: 'center', padding: 24 }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600 }}>Map failed to load</p>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 40 }}>☀️</div>
                            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 10, fontSize: 13 }}>Loading map...</p>
                        </div>
                    )}
                </div>
            )}
            {mapLoaded && !mapError && (
                <div className="ss-map-caption">
                    <div className="ss-map-caption-inner">
                        📍 Live Weather Pins &bull; {venues.length} venues
                        {cozyFilterActive && <span style={{ marginLeft: 6 }}>· 🛋️ Cozy filter on</span>}
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
