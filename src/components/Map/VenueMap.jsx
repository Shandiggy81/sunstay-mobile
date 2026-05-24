/**
 * VenueMap — HTML Marker emoji pins, performance-optimised
 *
 * Memory & crash fixes (iOS Safari):
 * A. selectedVenue flyTo effect: clearTimeout on cleanup prevents stacked
 *    resize()+flyTo() calls exhausting the WebGL context.
 * B. liveVenueFeatures stabilised via JSON-serialised ref — marker sync effect
 *    only re-runs when live feature VALUES change, not on every parent render.
 * C. Marker sync gated behind requestAnimationFrame so it never runs in the
 *    same microtask flush as fitBounds (prevents dual WebGL thrash on first paint).
 * D. Map cleanup: marker.remove() + map.remove() + null refs on unmount.
 * E. click-only marker interaction — touchend removed, touch-action omitted on
 *    pin elements so Mapbox handles pinch/pan gestures unobstructed.
 * F. sunshineNow pin state — ☀️ with yellow glow, takes precedence over 🔥 heater.
 * G. Outer/inner marker architecture — outer el given to Mapbox for positioning ONLY.
 *    All scale transforms, transitions, and styles applied to inner child so
 *    scale(1.2) never clobbers Mapbox's translate(Xpx, Ypx) on the outer wrapper.
 * H. RainViewer radar overlay — fetches live timestamp from RainViewer public API,
 *    injects XYZ raster tiles below aeroway-polygon (under pins/labels), with a
 *    floating FAB toggle button. Auto-refreshes timestamp every 5 minutes.
 */

import React, {
    useEffect, useMemo, useRef, useState,
    forwardRef, useImperativeHandle, memo,
} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAP_STYLE, INITIAL_VIEW_STATE } from '../../config/mapConfig';
import { useWeather } from '../../context/WeatherContext';

// ── Pin states ──────────────────────────────────────────────────────────
const PIN_STATES = {
    sunshine: { emoji: '☀️',  bg: '#FEF08A', border: '#EAB308' },
    heater:   { emoji: '🔥',  bg: '#ff6b35', border: '#c2410c' },
    rain:     { emoji: '🌦️', bg: '#1e40af', border: '#1e3a8a' },
    cold:     { emoji: '🥶',  bg: '#bfdbfe', border: '#60a5fa' },
    sunny:    { emoji: '😎',  bg: '#fbbf24', border: '#d97706' },
    default:  { emoji: '🌤️', bg: '#60a5fa', border: '#3b82f6' },
};

function getPinStateKey(venue, weather, liveVenueFeatures) {
    const live = liveVenueFeatures?.[venue.id] || {};
    const apparentTemp = weather?.apparentTemp ?? weather?.main?.feels_like ?? weather?.main?.temp ?? 20;
    const precipProb   = weather?.precipProbability ?? 0;
    const cloudCover   = weather?.cloudCoverPct ?? weather?.clouds?.all ?? 0;
    const condition    = (weather?.weather?.[0]?.main || '').toLowerCase();
    const heatersOn    = !!live.heatersOn || !!live.fireplaceOn || !!venue.heatersOn || !!venue.fireplaceOn;
    const sunshineNow  = !!live.sunshineNow || !!venue.sunshineNow;

    if (sunshineNow) return 'sunshine';
    if (heatersOn)   return 'heater';
    if (condition.includes('rain') || condition.includes('drizzle') || precipProb >= 40) return 'rain';
    if (apparentTemp <= 11) return 'cold';
    if (apparentTemp >= 18 && cloudCover <= 35 && precipProb < 20) return 'sunny';
    return 'default';
}

const isFiniteCoord = (v) => Number.isFinite(Number(v));
const isRenderableVenue = (v) => v?.id != null && isFiniteCoord(v.lng) && isFiniteCoord(v.lat);

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
    const { emoji, bg, border } = PIN_STATES[pinKey];

    const el = document.createElement('div');
    el.style.cssText = 'width:40px; height:40px; display:flex; align-items:center; justify-content:center;';

    const inner = document.createElement('div');
    const glow = pinKey === 'sunshine'
        ? 'drop-shadow(0 0 8px rgba(234,179,8,0.9)) drop-shadow(0 0 16px rgba(254,240,138,0.6))'
        : 'none';

    inner.style.cssText = [
        'width:40px', 'height:40px', 'border-radius:50%',
        `background:${bg}`, `border:3px solid ${border}`,
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:20px', 'cursor:pointer',
        'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
        'transition:transform 120ms ease, filter 120ms ease',
        'user-select:none', 'line-height:1',
        'will-change:transform',
        '-webkit-tap-highlight-color:transparent',
        `filter:${glow}`,
    ].join(';');

    inner.textContent = emoji;

    inner.addEventListener('mouseenter', () => { inner.style.transform = 'scale(1.2)'; });
    inner.addEventListener('mouseleave', () => { inner.style.transform = 'scale(1)'; });

    el.appendChild(inner);
    return el;
}

function updateMarkerEl(el, pinKey) {
    const inner = el.querySelector('div');
    if (!inner) return;

    const { emoji, bg, border } = PIN_STATES[pinKey];
    inner.textContent = emoji;
    inner.style.background = bg;
    inner.style.borderColor = border;
    inner.style.filter = pinKey === 'sunshine'
        ? 'drop-shadow(0 0 8px rgba(234,179,8,0.9)) drop-shadow(0 0 16px rgba(254,240,138,0.6))'
        : 'none';
}

// ── RainViewer helpers ──────────────────────────────────────────────────
const RAINVIEWER_META_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const RADAR_SOURCE_ID     = 'rainviewer-radar';
const RADAR_LAYER_ID      = 'rainviewer-radar-layer';
// Insert the radar layer just below road labels and all venue pins
const RADAR_INSERT_BEFORE = 'aeroway-polygon';

async function fetchRadarTimestamp() {
    try {
        const res  = await fetch(RAINVIEWER_META_URL);
        const json = await res.json();
        // Pick the latest available radar frame
        const frames = json?.radar?.past;
        if (!Array.isArray(frames) || frames.length === 0) return null;
        return frames[frames.length - 1].path; // e.g. "/v2/radar/1716520800"
    } catch (e) {
        console.warn('[VenueMap] RainViewer metadata fetch failed:', e?.message);
        return null;
    }
}

function buildRadarTileURL(path) {
    // RainViewer XYZ tile pattern — colour scheme 2 (standard blue-green-red), smooth=1, snow=1
    return `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`;
}

function addOrUpdateRadarLayer(map, tileURL) {
    if (!map) return;
    try {
        if (map.getSource(RADAR_SOURCE_ID)) {
            // Update existing source tiles in-place — no flash/flicker
            map.getSource(RADAR_SOURCE_ID).setTiles([tileURL]);
        } else {
            map.addSource(RADAR_SOURCE_ID, {
                type:     'raster',
                tiles:    [tileURL],
                tileSize: 256,
                attribution: 'RainViewer',
            });
            // Determine a safe insert-before layer — fall back gracefully if
            // the style doesn't have aeroway-polygon (e.g. satellite styles)
            const insertBefore = map.getLayer(RADAR_INSERT_BEFORE)
                ? RADAR_INSERT_BEFORE
                : undefined;
            map.addLayer({
                id:     RADAR_LAYER_ID,
                type:   'raster',
                source: RADAR_SOURCE_ID,
                paint: {
                    'raster-opacity':       0.55,
                    'raster-fade-duration': 150,
                },
            }, insertBefore);
        }
    } catch (e) {
        console.warn('[VenueMap] addOrUpdateRadarLayer error:', e?.message);
    }
}

function removeRadarLayer(map) {
    if (!map) return;
    try {
        if (map.getLayer(RADAR_LAYER_ID))  map.removeLayer(RADAR_LAYER_ID);
        if (map.getSource(RADAR_SOURCE_ID)) map.removeSource(RADAR_SOURCE_ID);
    } catch (e) {
        console.warn('[VenueMap] removeRadarLayer error:', e?.message);
    }
}

// ══════════════════════════════════════════════════════════════════════
const VenueMap = forwardRef(({
    venues = [],
    selectedVenue,
    filteredVenueIds,
    onVenueSelect,
    liveVenueFeatures = {},
}, ref) => {
    const mapContainer     = useRef(null);
    const map              = useRef(null);
    const markersRef       = useRef({});
    const hasFlownToBounds = useRef(false);
    const rafRef           = useRef(null);
    const radarTimerRef    = useRef(null);  // FIX H: interval ref for auto-refresh
    const [mapLoaded,    setMapLoaded]    = useState(false);
    const [mapError,     setMapError]     = useState(false);
    const [radarOn,      setRadarOn]      = useState(false);  // FAB toggle state
    const [radarLoading, setRadarLoading] = useState(false);  // spinner while fetching
    const { weather } = useWeather();

    const safeVenues = useMemo(
        () => (Array.isArray(venues) ? venues.filter(isRenderableVenue) : []),
        [venues]
    );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveKey]);

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
        const loadTimeout = setTimeout(() => { if (!disposed) setMapError(true); }, 15000);

        try {
            map.current = new mapboxgl.Map({
                container:           mapContainer.current,
                style:               MAP_STYLE,
                center:              [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
                zoom:                INITIAL_VIEW_STATE.zoom,
                pitch:               0,
                bearing:             0,
                cooperativeGestures: false,
                fadeDuration:        0,
                maxTileCacheSize:    20,
            });

            map.current.on('load', () => {
                if (disposed || !map.current) return;
                clearTimeout(loadTimeout);
                map.current.dragRotate.disable();
                map.current.touchZoomRotate.disableRotation();
                setMapLoaded(true);
                setMapError(false);
            });

            map.current.on('error', (e) => {
                if (disposed) return;
                const msg = e.error?.message || '';
                // Suppress tile 404s from RainViewer when radar is toggling
                if (msg.includes(RADAR_LAYER_ID) || msg.includes('tilecache.rainviewer')) return;
                if (msg.includes('401') || msg.includes('403') || msg.includes('access token')) {
                    clearTimeout(loadTimeout);
                    setMapError(true);
                }
            });

            map.current.addControl(
                new mapboxgl.NavigationControl({ showCompass: false }),
                'bottom-right'
            );
        } catch {
            clearTimeout(loadTimeout);
            setMapError(true);
        }

        return () => {
            disposed = true;
            clearTimeout(loadTimeout);
            if (rafRef.current)   cancelAnimationFrame(rafRef.current);
            if (radarTimerRef.current) clearInterval(radarTimerRef.current);
            Object.values(markersRef.current).forEach(({ marker }) => marker.remove());
            markersRef.current = {};
            map.current?.remove();
            map.current = null;
        };
    }, []);

    // ── FIX H: Radar toggle effect ──────────────────────────────────
    // Fires when radarOn flips. Fetches the latest RainViewer timestamp,
    // injects/removes the raster layer, and sets up a 5-minute auto-refresh
    // so the radar frame stays current during long browsing sessions.
    useEffect(() => {
        if (!mapLoaded || !map.current) return;

        // Clear any existing refresh timer when toggling
        if (radarTimerRef.current) {
            clearInterval(radarTimerRef.current);
            radarTimerRef.current = null;
        }

        if (!radarOn) {
            removeRadarLayer(map.current);
            return;
        }

        // Fetch + inject immediately
        const loadRadar = async () => {
            setRadarLoading(true);
            const path = await fetchRadarTimestamp();
            setRadarLoading(false);
            if (!path || !map.current) return;
            addOrUpdateRadarLayer(map.current, buildRadarTileURL(path));
        };

        loadRadar();

        // Refresh every 5 minutes to pull the latest radar frame
        radarTimerRef.current = setInterval(loadRadar, 5 * 60 * 1000);

        return () => {
            if (radarTimerRef.current) clearInterval(radarTimerRef.current);
        };
    }, [radarOn, mapLoaded]);

    // ── fitBounds — fires once after venues arrive ──────────────────
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

    // ── Sync markers ────────────────────────────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        rafRef.current = requestAnimationFrame(() => {
            if (!map.current) return;
            const visible  = filteredIdSet;
            const live     = liveVenueFeaturesRef.current;

            safeVenues.forEach(venue => {
                const pinKey   = getPinStateKey(venue, weather, live);
                const existing = markersRef.current[venue.id];
                const show     = !visible || visible.has(String(venue.id));

                if (existing) {
                    existing.el.style.display = show ? 'flex' : 'none';
                    if (show && existing.pinKey !== pinKey) {
                        updateMarkerEl(existing.el, pinKey);
                        existing.pinKey = pinKey;
                    }
                } else if (show) {
                    const el = createMarkerEl(pinKey);
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onVenueSelectRef.current?.(venue);
                    });
                    const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                        .setLngLat([Number(venue.lng), Number(venue.lat)])
                        .addTo(map.current);
                    markersRef.current[venue.id] = { marker, el, pinKey };
                }
            });

            const venueIds = new Set(safeVenues.map(v => String(v.id)));
            Object.keys(markersRef.current).forEach(id => {
                if (!venueIds.has(id)) {
                    markersRef.current[id].marker.remove();
                    delete markersRef.current[id];
                }
            });
        });

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeVenues, weather, liveKey, filteredIdSet, mapLoaded]);

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

    // ── Render ───────────────────────────────────────────────────────
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div
                ref={mapContainer}
                style={{ width: '100%', height: '100%', touchAction: 'none' }}
            />

            {/* ── FIX H: Radar FAB toggle ── */}
            {mapLoaded && !mapError && (
                <button
                    onClick={() => setRadarOn(prev => !prev)}
                    title={radarOn ? 'Hide rain radar' : 'Show rain radar'}
                    style={{
                        position:        'absolute',
                        bottom:          80,
                        right:           12,
                        zIndex:          20,
                        width:           44,
                        height:          44,
                        borderRadius:    '50%',
                        border:          radarOn ? '2px solid #3B82F6' : '2px solid rgba(255,255,255,0.3)',
                        background:      radarOn ? 'rgba(59,130,246,0.9)' : 'rgba(15,15,30,0.85)',
                        backdropFilter:  'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        color:           '#fff',
                        fontSize:        20,
                        cursor:          'pointer',
                        display:         'flex',
                        alignItems:      'center',
                        justifyContent:  'center',
                        boxShadow:       '0 2px 10px rgba(0,0,0,0.4)',
                        transition:      'background 200ms ease, border-color 200ms ease',
                        WebkitTapHighlightColor: 'transparent',
                    }}
                    aria-label={radarOn ? 'Hide rain radar' : 'Show rain radar'}
                    aria-pressed={radarOn}
                >
                    {radarLoading ? '⏳' : '📡'}
                </button>
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
