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
 * H. Internalised layer controls — Radar XYZ raster tiles & native GPU comfort
 *    heatmap are fully self-contained with internal toggle state, no App.jsx props.
 *    Radar: RainViewer timestamp fetched on first toggle, auto-refreshed every 5 min.
 *    Heatmap: GeoJSON point weights derived from calculateSunstayScore with fallback.
 * I. FAB touch fix — FAB wrapper uses touchAction:'auto' + stopPropagation on
 *    touchEnd so the map container's touchAction:'none' never swallows button taps.
 * J. Radar zoom fix — raster source capped at maxzoom:12 (RainViewer hard limit).
 *    Mapbox will never request z=13+ tiles, eliminating "Zoom level not supported".
 *    Error suppression also widened to catch zoom-range messages from radar source.
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
const RADAR_INSERT_BEFORE = 'aeroway-polygon';

// FIX J: RainViewer only serves tiles up to zoom 12.
// Declaring maxzoom:12 on the source tells Mapbox to reuse z=12
// tiles when zoomed beyond that level instead of requesting z=13+
// (which 404s and triggers "Zoom level not supported" canvas errors).
const RADAR_SOURCE_MAXZOOM = 12;

// ── Comfort heatmap constants ───────────────────────────────────────────
const HEATMAP_SOURCE_ID = 'comfort-heatmap-src';
const HEATMAP_LAYER_ID  = 'comfort-heatmap-lyr';

async function fetchRadarTimestamp() {
    try {
        const res  = await fetch(RAINVIEWER_META_URL);
        const json = await res.json();
        const frames = json?.radar?.past;
        if (!Array.isArray(frames) || frames.length === 0) return null;
        return frames[frames.length - 1].path;
    } catch (e) {
        console.warn('[VenueMap] RainViewer metadata fetch failed:', e?.message);
        return null;
    }
}

function buildRadarTileURL(path) {
    return `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`;
}

function addOrUpdateRadarLayer(map, tileURL) {
    if (!map) return;
    try {
        if (map.getSource(RADAR_SOURCE_ID)) {
            map.getSource(RADAR_SOURCE_ID).setTiles([tileURL]);
        } else {
            map.addSource(RADAR_SOURCE_ID, {
                type:     'raster',
                tiles:    [tileURL],
                tileSize: 256,
                // FIX J: cap at RainViewer's hard zoom limit.
                // Mapbox will over-zoom (scale up) the z=12 tile rather
                // than requesting z=13+ tiles that don't exist.
                minzoom:  0,
                maxzoom:  RADAR_SOURCE_MAXZOOM,
                attribution: 'RainViewer',
            });
            const insertBefore = map.getLayer(RADAR_INSERT_BEFORE) ? RADAR_INSERT_BEFORE : undefined;
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
        if (map.getLayer(RADAR_LAYER_ID))   map.removeLayer(RADAR_LAYER_ID);
        if (map.getSource(RADAR_SOURCE_ID)) map.removeSource(RADAR_SOURCE_ID);
    } catch (e) {
        console.warn('[VenueMap] removeRadarLayer error:', e?.message);
    }
}

// ── Error suppression helper ────────────────────────────────────────────
// FIX J (part 2): widen suppression to catch zoom-range errors that
// originate from the radar or heatmap sources. Mapbox formats these as
// "Zoom level X is not supported" or "source maxzoom" variants.
function isSuppressedMapError(msg) {
    if (!msg) return false;
    const lower = msg.toLowerCase();
    return (
        lower.includes(RADAR_LAYER_ID) ||
        lower.includes('tilecache.rainviewer') ||
        lower.includes('zoom level') ||
        lower.includes('not supported') ||
        lower.includes(HEATMAP_SOURCE_ID) ||
        lower.includes(HEATMAP_LAYER_ID)
    );
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
    const radarTimerRef    = useRef(null);

    // ── Internalised layer toggle state ────────────────────────────
    const [radarOn,      setRadarOn]      = useState(false);
    const [comfortMapOn, setComfortMapOn] = useState(false);
    const [radarLoading, setRadarLoading] = useState(false);

    const [mapLoaded,    setMapLoaded]    = useState(false);
    const [mapError,     setMapError]     = useState(false);

    const { weather, calculateSunstayScore } = useWeather();

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

            // FIX J (part 2): suppress zoom-range errors from radar/heatmap
            // sources in addition to the existing token/auth error handling.
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
        } catch {
            clearTimeout(loadTimeout);
            setMapError(true);
        }

        return () => {
            disposed = true;
            clearTimeout(loadTimeout);
            if (rafRef.current)        cancelAnimationFrame(rafRef.current);
            if (radarTimerRef.current) clearInterval(radarTimerRef.current);
            Object.values(markersRef.current).forEach(({ marker }) => marker.remove());
            markersRef.current = {};
            map.current?.remove();
            map.current = null;
        };
    }, []);

    // ── Radar toggle ────────────────────────────────────────────────
    useEffect(() => {
        if (!mapLoaded || !map.current) return;

        if (radarTimerRef.current) {
            clearInterval(radarTimerRef.current);
            radarTimerRef.current = null;
        }

        if (!radarOn) {
            removeRadarLayer(map.current);
            return;
        }

        const loadRadar = async () => {
            setRadarLoading(true);
            const path = await fetchRadarTimestamp();
            setRadarLoading(false);
            if (!path || !map.current) return;
            addOrUpdateRadarLayer(map.current, buildRadarTileURL(path));
        };

        loadRadar();
        radarTimerRef.current = setInterval(loadRadar, 5 * 60 * 1000);

        return () => {
            if (radarTimerRef.current) clearInterval(radarTimerRef.current);
        };
    }, [radarOn, mapLoaded]);

    // ── GPU comfort heatmap ─────────────────────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const geojsonFeatures = safeVenues.map(venue => {
            const rawScore = typeof calculateSunstayScore === 'function'
                ? calculateSunstayScore(venue)
                : 75;
            const weight = Number.isFinite(rawScore) ? Math.min(Math.max(rawScore / 100, 0), 1) : 0.75;
            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [Number(venue.lng), Number(venue.lat)] },
                properties: { score: weight },
            };
        });

        const geojsonData = { type: 'FeatureCollection', features: geojsonFeatures };

        if (!map.current.getSource(HEATMAP_SOURCE_ID)) {
            map.current.addSource(HEATMAP_SOURCE_ID, { type: 'geojson', data: geojsonData });

            const insertBefore = map.current.getLayer(RADAR_INSERT_BEFORE) ? RADAR_INSERT_BEFORE : undefined;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapLoaded, safeVenues, comfortMapOn, weather, calculateSunstayScore]);

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

    // ── Render ──────────────────────────────────────────────────────
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div
                ref={mapContainer}
                style={{ width: '100%', height: '100%', touchAction: 'none' }}
            />

            {/* FAB stack — FIX I: touchAction:'auto' + stopPropagation so the
                map container's touchAction:'none' never swallows button taps */}
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
                    {/* Rain Radar FAB */}
                    <button
                        onClick={() => setRadarOn(prev => !prev)}
                        onTouchEnd={e => { e.stopPropagation(); }}
                        title={radarOn ? 'Hide rain radar' : 'Show rain radar'}
                        style={{
                            width:               44,
                            height:              44,
                            borderRadius:        '50%',
                            border:              radarOn ? '2px solid #3B82F6' : '2px solid rgba(255,255,255,0.3)',
                            background:          radarOn ? 'rgba(59,130,246,0.9)' : 'rgba(15,15,30,0.85)',
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
                        aria-label={radarOn ? 'Hide rain radar' : 'Show rain radar'}
                        aria-pressed={radarOn}
                    >
                        {radarLoading ? '⏳' : '📡'}
                    </button>

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
