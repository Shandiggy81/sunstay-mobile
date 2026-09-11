import React, {
    useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback,
    forwardRef, useImperativeHandle, memo,
} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import SunCalc from 'suncalc';
import { MapboxMapController, Account } from '@xweather/mapsgl';
import { MAPBOX_TOKEN, MAP_STYLE, INITIAL_VIEW_STATE } from '../../config/mapConfig';
import { useWeather } from '../../context/WeatherContext';
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
function getBoundsFromVenues(venues) {
    if (!Array.isArray(venues) || venues.length < 2) return null;
    try {
        let minLng = Infinity,  maxLng = -Infinity;
        let minLat = Infinity,  maxLat = -Infinity;
        for (const v of venues) {
            const lng = Number(v.lng);
            const lat = Number(v.lat);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        }
        if (!Number.isFinite(minLng)) return null;
        return new mapboxgl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
    } catch (e) {
        console.warn('[VenueMap] getBoundsFromVenues error:', e?.message);
        return null;
    }
}

// ── Marker DOM helpers ──────────────────────────────────────────────────
function createMarkerEl(pinKey) {
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
    return el;
}

function updateMarkerEl(el, pinKey) {
    const inner = el.querySelector('div:last-child');
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
const DAY_START_MIN = 6 * 60;   // 6:00 AM
const DAY_END_MIN   = 20 * 60;  // 8:00 PM

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

const MELBOURNE_TZ = 'Australia/Melbourne';

// Build a Date whose Melbourne wall-clock time is today at `minutes`, regardless
// of the viewer's own timezone — the slider represents Melbourne local time, so
// the sun position must be computed for Melbourne (handles AEST/AEDT correctly).
function melbourneDate(minutes) {
    const now = new Date();
    const [y, mo, d] = new Intl.DateTimeFormat('en-CA', {
        timeZone: MELBOURNE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now).split('-').map(Number);

    const guessUTC = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60, 0);
    const asUTC = new Date(guessUTC);
    const melbMs = new Date(asUTC.toLocaleString('en-US', { timeZone: MELBOURNE_TZ })).getTime();
    const utcMs  = new Date(asUTC.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    return new Date(guessUTC - (melbMs - utcMs)); // shift by Melbourne's UTC offset
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

// Floating slider that scrubs the global 3D-building light. During drag, the
// latest minutes live in a ref (no React re-render) and map.setLights is
// coalesced to at most one update per display frame via rAF. The clock label
// is written through a DOM ref. Minutes commit to React state on pointer-up /
// cancel / blur so parent VenueMap re-renders cannot reset a mid-drag value.
function TimeOfDayLight({ mapRef, mapLoaded, isVenueSelected = false }) {
    const [minutes, setMinutes] = useState(13 * 60); // default 1:00 PM — committed
    const minutesRef = useRef(minutes);
    const lightRafRef = useRef(null);
    const clockLabelRef = useRef(null);
    const sliderRef = useRef(null);

    const applyLight = useCallback((mins) => {
        const map = mapRef.current;
        if (!map || typeof map.setLights !== 'function') return;
        if (!map.isStyleLoaded || !map.isStyleLoaded()) return;
        const { direction, color, intensity, ambientIntensity } = computeSunLight(
            mins, INITIAL_VIEW_STATE.latitude, INITIAL_VIEW_STATE.longitude,
        );
        try {
            // Mapbox Standard 3D lighting: a directional "sun" with cast-shadows
            // projects real ground shadows from the native 3D buildings, plus a
            // soft ambient fill. Scrubbing the slider moves the sun and shadows.
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
                        'cast-shadows': true,
                        'shadow-intensity': 1,
                    },
                },
            ]);
        } catch (e) {
            console.warn('[VenueMap] setLights failed:', e?.message);
        }
    }, [mapRef]);

    const cancelPendingLightRaf = useCallback(() => {
        if (lightRafRef.current != null) {
            cancelAnimationFrame(lightRafRef.current);
            lightRafRef.current = null;
        }
    }, []);

    const scheduleLight = useCallback((mins) => {
        minutesRef.current = mins;
        if (lightRafRef.current != null) return;
        lightRafRef.current = requestAnimationFrame(() => {
            lightRafRef.current = null;
            applyLight(minutesRef.current);
        });
    }, [applyLight]);

    const paintClock = (mins) => {
        const label = formatClock(mins);
        if (clockLabelRef.current) clockLabelRef.current.textContent = label;
        if (sliderRef.current) sliderRef.current.setAttribute('aria-valuetext', label);
    };

    // If VenueMap re-renders mid-drag, React would reset the controlled input
    // to the last committed `minutes`. Restore the live ref value (and clock)
    // before paint so the thumb and readout stay with the finger.
    useLayoutEffect(() => {
        const live = minutesRef.current;
        if (sliderRef.current && sliderRef.current.value !== String(live)) {
            sliderRef.current.value = String(live);
        }
        paintClock(live);
    });

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
                cancelPendingLightRaf();
                try { map.off('idle', reapply); } catch { /* noop */ }
            };
        }
        return () => { cancelPendingLightRaf(); };
        // Only (re)apply the baseline light when the map finishes loading.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapLoaded, applyLight, cancelPendingLightRaf]);

    useEffect(() => () => { cancelPendingLightRaf(); }, [cancelPendingLightRaf]);

    const handleScrub = (e) => {
        const v = Number(e.target.value);
        minutesRef.current = v;
        paintClock(v);
        scheduleLight(v);
    };

    const commitMinutes = () => {
        const v = minutesRef.current;
        setMinutes((prev) => (prev === v ? prev : v));
        paintClock(v);
    };

    return (
        <motion.div
            className={`absolute left-1/2 bottom-[46px] z-40 w-[min(88vw,340px)] ${
                isVenueSelected ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
            initial={false}
            animate={isVenueSelected
                ? { x: '-50%', y: 180, opacity: 0 }
                : { x: '-50%', y: 0, opacity: 1 }
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
                            ref={clockLabelRef}
                            aria-live="polite"
                            className="text-xs font-bold tabular-nums text-slate-800"
                        >
                            {formatClock(minutes)}
                        </span>
                    </div>
                    <input
                        ref={sliderRef}
                        id="tod-slider"
                        type="range"
                        min={DAY_START_MIN}
                        max={DAY_END_MIN}
                        step={5}
                        value={minutes}
                        onChange={handleScrub}
                        onInput={handleScrub}
                        onPointerUp={commitMinutes}
                        onPointerCancel={commitMinutes}
                        onBlur={commitMinutes}
                        onKeyUp={commitMinutes}
                        aria-label="Time of day for 3D building shadows"
                        aria-valuetext={formatClock(minutes)}
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
}, ref) => {
    const mapContainer     = useRef(null);
    const map              = useRef(null);
    const controllerRef    = useRef(null);
    const radarLayerAddedRef = useRef(false);
    const markersRef       = useRef({});
    const hasFlownToBounds = useRef(false);
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

        getMap: () => map.current,
    }));

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
                'bottom-right'
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
        const bounds = getBoundsFromVenues(safeVenues);
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
                            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
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
                        let existing = markersRef.current[markerId];

                        if (existing) {
                            if (existing.pinKey !== pinKey) {
                                existing.marker.remove();
                                const el = createMarkerEl(pinKey);
                                el.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onVenueSelectRef.current?.(venue);
                                });
                                existing.marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                                    .setLngLat([venueLng, venueLat])
                                    .addTo(map.current);
                                existing.el = el;
                                existing.pinKey = pinKey;
                            }
                        } else {
                            const el = createMarkerEl(pinKey);
                            el.addEventListener('click', (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onVenueSelectRef.current?.(venue);
                            });
                            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                                .setLngLat([venueLng, venueLat])
                                .addTo(map.current);
                            existing = { marker, el, pinKey, isCluster: false };
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
    }, [mapLoaded, weather, liveKey, cozyFilterActive, weatherColorFn]);

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
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div
                ref={mapContainer}
                style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}
            />

            {/* Prominent live radar toggle */}
            {mapLoaded && !mapError && (
                <button
                    onClick={(e) => { e.stopPropagation(); setShowRadar(!showRadar); }}
                    className={`absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg font-bold text-sm backdrop-blur-md transition-all ${
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

            {/* Time-of-day light scrubber — casts dynamic shadows across 3D buildings */}
            {mapLoaded && !mapError && (
                <TimeOfDayLight mapRef={map} mapLoaded={mapLoaded} isVenueSelected={!!selectedVenue} />
            )}

            {/* FAB stack */}
            {mapLoaded && !mapError && (
                <div
                    style={{
                        position:        'absolute',
                        bottom:          80,
                        right:           12,
                        zIndex:          20,
                        display:         'flex',
                        flexDirection:   'column',
                        gap:             8,
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
