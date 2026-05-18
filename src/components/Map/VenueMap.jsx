/**
 * VenueMap — HTML Marker emoji pins, performance-optimised
 *
 * Fixes in this version:
 * 1. anchor:'bottom' — pin tip sits on the coordinate
 * 2. resizeAndFly() — waits 300 ms for BottomSheet animation, calls map.resize(),
 *    then flyTo with simple balanced padding so the pin centres correctly
 * 3. FLY_TO_PADDING kept minimal — no more massive bottom offset fighting the layout
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
    heater:  { emoji: '🔥', bg: '#ff6b35', border: '#c2410c' },
    rain:    { emoji: '🌦️', bg: '#1e40af', border: '#1e3a8a' },
    cold:    { emoji: '🥶', bg: '#bfdbfe', border: '#60a5fa' },
    sunny:   { emoji: '😎', bg: '#fbbf24', border: '#d97706' },
    default: { emoji: '🌤️', bg: '#60a5fa', border: '#3b82f6' },
};

function getPinStateKey(venue, weather, liveVenueFeatures) {
    const live = liveVenueFeatures?.[venue.id] || {};
    const apparentTemp = weather?.apparentTemp ?? weather?.main?.feels_like ?? weather?.main?.temp ?? 20;
    const precipProb   = weather?.precipProbability ?? 0;
    const cloudCover   = weather?.cloudCoverPct ?? weather?.clouds?.all ?? 0;
    const condition    = (weather?.weather?.[0]?.main || '').toLowerCase();
    const heatersOn    = !!live.heatersOn || !!live.fireplaceOn || !!venue.heatersOn || !!venue.fireplaceOn;

    if (heatersOn) return 'heater';
    if (condition.includes('rain') || condition.includes('drizzle') || precipProb >= 40) return 'rain';
    if (apparentTemp <= 11) return 'cold';
    if (apparentTemp >= 18 && cloudCover <= 35 && precipProb < 20) return 'sunny';
    return 'default';
}

const isFiniteCoord = (v) => Number.isFinite(Number(v));
const isRenderableVenue = (v) => v?.id != null && isFiniteCoord(v.lng) && isFiniteCoord(v.lat);

// Simple, balanced padding — no more huge bottom offset.
// map.resize() is called before flyTo so the viewport is already correct.
const FLY_TO_PADDING = { top: 50, bottom: 50, left: 0, right: 0 };

// ── Marker DOM helpers ──────────────────────────────────────────────────
function createMarkerEl(pinKey) {
    const { emoji, bg, border } = PIN_STATES[pinKey];
    const el = document.createElement('div');
    el.style.cssText = [
        'width:40px', 'height:40px', 'border-radius:50%',
        `background:${bg}`, `border:3px solid ${border}`,
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:20px', 'cursor:pointer',
        'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
        'transition:transform 120ms ease',
        'user-select:none', 'line-height:1',
        'will-change:transform',
        '-webkit-tap-highlight-color:transparent',
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
}

// ══════════════════════════════════════════════════════════════════════
const VenueMap = forwardRef(({
    venues = [],
    selectedVenue,
    filteredVenueIds,
    onVenueSelect,
    liveVenueFeatures = {},
}, ref) => {
    const mapContainer = useRef(null);
    const map          = useRef(null);
    const markersRef   = useRef({});
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

    // ── Imperative API ──────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        // Legacy direct flyTo (used by recenter button etc.)
        flyTo: (opts) => map.current?.flyTo(opts),

        // resizeAndFly — the correct path when a venue is selected:
        // 1. Wait 300 ms for the VenueCard / BottomSheet animation to complete
        //    so the map container has its final painted size.
        // 2. Call map.resize() so Mapbox recalculates the viewport dimensions.
        // 3. Then flyTo — the centre is now computed against the true viewport,
        //    so the pin lands in the middle of the visible area, not top-left.
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

        return () => {
            disposed = true;
            clearTimeout(loadTimeout);
            Object.values(markersRef.current).forEach(({ marker }) => marker.remove());
            markersRef.current = {};
            map.current?.remove();
            map.current = null;
        };
    }, []);

    // ── Sync markers ────────────────────────────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const visible = filteredIdSet;
        safeVenues.forEach(venue => {
            const pinKey   = getPinStateKey(venue, weather, liveVenueFeatures);
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
                el.addEventListener('click', () => onVenueSelectRef.current?.(venue));
                // anchor:'bottom' — bottom edge of circle sits on the coordinate
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
    }, [safeVenues, weather, liveVenueFeatures, filteredIdSet, mapLoaded]);

    // ── selectedVenue change: delegate to resizeAndFly ──────────────
    // NOTE: App.jsx calls resizeAndFly directly on pin tap.
    // This effect handles the case where selectedVenue is set programmatically
    // (e.g. deep-link, chat widget) without going through handleVenueSelect.
    useEffect(() => {
        if (!selectedVenue || !map.current) return;
        const lng = Number(selectedVenue.lng);
        const lat = Number(selectedVenue.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
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
                            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 10, fontSize: 13 }}>Loading map…</p>
                        </div>
                    )}
                </div>
            )}
            {mapLoaded && !mapError && (
                <div className="ss-map-caption">
                    <div className="ss-map-caption-inner">
                        📍 Live Weather Pins • {venues.length} venues
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
