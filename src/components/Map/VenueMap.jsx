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
    const glow = pinKey === 'sunshine'
        ? 'drop-shadow(0 0 8px rgba(234,179,8,0.9)) drop-shadow(0 0 16px rgba(254,240,138,0.6))'
        : 'none';
    el.style.cssText = [
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
    el.textContent = emoji;
    el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; });
    el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
    return el;
}

function updateMarkerEl(el, pinKey) {
    const { emoji, bg, border } = PIN_STATES[pinKey];
    el.textContent = emoji;
    el.style.background = bg;
    el.style.borderColor = border;
    el.style.filter = pinKey === 'sunshine'
        ? 'drop-shadow(0 0 8px rgba(234,179,8,0.9)) drop-shadow(0 0 16px rgba(254,240,138,0.6))'
        : 'none';
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
    const rafRef           = useRef(null);   // FIX C: tracks pending rAF for marker sync
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError,  setMapError]  = useState(false);
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

    // FIX B: Stabilise liveVenueFeatures — serialise to JSON so the marker
    // sync effect only re-runs when the actual values change, not on every
    // parent render that produces a new object reference.
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

        // FIX D: Full cleanup — cancel rAF, remove all markers, destroy WebGL context
        return () => {
            disposed = true;
            clearTimeout(loadTimeout);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            Object.values(markersRef.current).forEach(({ marker }) => marker.remove());
            markersRef.current = {};
            map.current?.remove();
            map.current = null;
        };
    }, []);

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
    // FIX C: Wrapped in rAF so this never runs in the same microtask flush
    // as fitBounds (prevents dual WebGL thrash on first paint in iOS Safari).
    // FIX B: Keyed on liveKey (serialised) rather than the live object reference.
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // Cancel any pending rAF from a previous rapid render
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
                    // click ONLY — synthesised by browser only on a clean tap,
                    // never on a drag/pinch, so map gestures are fully preserved.
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

            // Remove markers for venues no longer in safeVenues
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
    // liveKey is the serialised dependency — stable until values actually change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeVenues, weather, liveKey, filteredIdSet, mapLoaded]);

    // ── selectedVenue: fly to pin ───────────────────────────────────
    // FIX A: clearTimeout in cleanup cancels any stacked timers from rapid
    // selectedVenue changes, preventing multiple simultaneous resize()+flyTo()
    // calls that exhaust the iOS Safari WebGL context budget.
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

        return () => clearTimeout(t);   // FIX A: cancel stale timer
    }, [selectedVenue]);

    // ── Render ───────────────────────────────────────────────────────
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div
                ref={mapContainer}
                style={{ width: '100%', height: '100%', touchAction: 'none' }}
            />
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
