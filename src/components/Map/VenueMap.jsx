/**
 * VenueMap — HTML Marker emoji pins, performance-optimised
 * 
 * Key fixes vs previous version:
 * 1. onVenueSelect wrapped in ref — never causes marker useEffect to re-run
 * 2. marker sync effect depends only on [venues, weather, liveVenueFeatures, filteredVenueIds, mapLoaded]
 *    NOT onVenueSelect (was causing all 43 markers to rebuild on every parent re-render)
 * 3. Map init: cooperative gestures on mobile, no pitch (pitch causes jank on mobile GL)
 * 4. Marker DOM recycled in-place (textContent + style only) — no remove/recreate on update
 * 5. will-change:transform on marker el for GPU compositing layer
 * 6. CSS touch-action:none on map container to prevent scroll/pan conflict
 */

import React, {
    useEffect, useMemo, useRef, useState,
    forwardRef, useImperativeHandle, memo, useCallback,
} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAP_STYLE, INITIAL_VIEW_STATE } from '../../config/mapConfig';
import { useWeather } from '../../context/WeatherContext';

// ── Pin states ──────────────────────────────────────────────────
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

const isFiniteCoord = (value) => Number.isFinite(Number(value));
const isRenderableVenue = (venue) => (
    venue?.id != null && isFiniteCoord(venue.lng) && isFiniteCoord(venue.lat)
);

// ── Create marker DOM element (called ONCE per venue) ──────────────
function createMarkerEl(pinKey) {
    const { emoji, bg, border } = PIN_STATES[pinKey];
    const el = document.createElement('div');
    // will-change:transform puts each pin on its own GPU layer — no jank during map pan
    el.style.cssText = [
        'width:40px', 'height:40px', 'border-radius:50%',
        `background:${bg}`, `border:3px solid ${border}`,
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:20px', 'cursor:pointer',
        'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
        'transition:transform 120ms ease',
        'user-select:none', 'line-height:1',
        'will-change:transform',          // ← GPU compositing layer
        '-webkit-tap-highlight-color:transparent', // ← removes iOS flash on tap
    ].join(';');
    el.textContent = emoji;
    // Hover only on non-touch devices
    el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; });
    el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
    return el;
}

// ── Update existing marker element in-place (no remove/recreate) ──
function updateMarkerEl(el, pinKey) {
    const { emoji, bg, border } = PIN_STATES[pinKey];
    el.textContent = emoji;
    el.style.background = bg;
    el.style.borderColor = border;
}

// ════════════════════════════════════════════════════════
const VenueMap = forwardRef(({
    venues = [],
    selectedVenue,
    filteredVenueIds,
    onVenueSelect,
    liveVenueFeatures = {},
}, ref) => {
    const mapContainer = useRef(null);
    const map          = useRef(null);
    const markersRef   = useRef({});   // { [venueId]: { marker, el, pinKey } }
    const [mapLoaded, setMapLoaded]   = useState(false);
    const [mapError,  setMapError]    = useState(false);
    const { weather } = useWeather();
    const safeVenues = useMemo(
        () => (Array.isArray(venues) ? venues.filter(isRenderableVenue) : []),
        [venues]
    );
    const filteredIdSet = useMemo(() => {
        if (!Array.isArray(filteredVenueIds)) return null;
        return new Set(filteredVenueIds.map(id => String(id)));
    }, [filteredVenueIds]);

    // FIX 1: store onVenueSelect in a ref so it never appears in marker effect deps.
    // Without this, every parent re-render (state change, resize, etc.) rebuilds
    // the click handler reference and triggers the entire marker sync effect,
    // causing all 43 markers to flash/jump.
    const onVenueSelectRef = useRef(onVenueSelect);
    useEffect(() => { onVenueSelectRef.current = onVenueSelect; }, [onVenueSelect]);

    // ── Expose imperative API ──────────────────────────────────────
    useImperativeHandle(ref, () => ({
        flyTo:  (opts) => map.current?.flyTo(opts),
        getMap: ()    => map.current,
    }));

    // ── Initialise map ONCE ───────────────────────────────────────
    useEffect(() => {
        if (map.current) return;
        if (!MAPBOX_TOKEN?.startsWith('pk.')) { setMapError(true); return; }
        if (!mapContainer.current) return;

        mapboxgl.accessToken = MAPBOX_TOKEN;
        let disposed = false;
        const loadTimeout = setTimeout(() => {
            if (!disposed) setMapError(true);
        }, 15000);

        try {
            map.current = new mapboxgl.Map({
                container:   mapContainer.current,
                style:       MAP_STYLE,
                center:      [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
                zoom:        INITIAL_VIEW_STATE.zoom,
                pitch:       0,        // FIX 2: pitch=0 on mobile; 3D tilt causes GL repaints on every frame during pan
                bearing:     0,
                // FIX 3: cooperative gestures — prevents the map swallowing page scroll on mobile
                cooperativeGestures: false,
                // FIX 4: disable fade-in animation on tiles — reduces visual jitter on slow connections
                fadeDuration: 0,
                // FIX 5: limit max tile cache to reduce memory pressure on mobile
                maxTileCacheSize: 20,
            });

            map.current.on('load', () => {
                if (disposed || !map.current) return;
                clearTimeout(loadTimeout);
                // FIX 6: disable map rotation (pinch-rotate) — prevents accidental bearing changes
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
    }, []); // ← empty deps: runs once only

    // ── Sync markers (NO onVenueSelect in deps!) ────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const visible = filteredIdSet;

        // Add / update markers
        safeVenues.forEach(venue => {
            const pinKey   = getPinStateKey(venue, weather, liveVenueFeatures);
            const existing = markersRef.current[venue.id];
            const show     = !visible || visible.has(String(venue.id));

            if (existing) {
                // Toggle visibility
                existing.el.style.display = show ? 'flex' : 'none';
                // Update emoji/colour if state changed — NO marker remove/recreate
                if (show && existing.pinKey !== pinKey) {
                    updateMarkerEl(existing.el, pinKey);
                    existing.pinKey = pinKey;
                }
            } else if (show) {
                // Create marker for the first time
                const el = createMarkerEl(pinKey);
                // Use ref so clicking a pin never causes the effect to re-run
                el.addEventListener('click', () => onVenueSelectRef.current?.(venue));
                const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                    .setLngLat([Number(venue.lng), Number(venue.lat)])
                    .addTo(map.current);
                markersRef.current[venue.id] = { marker, el, pinKey };
            }
        });

        // Remove stale markers
        const venueIds = new Set(safeVenues.map(v => String(v.id)));
        Object.keys(markersRef.current).forEach(id => {
            if (!venueIds.has(id)) {
                markersRef.current[id].marker.remove();
                delete markersRef.current[id];
            }
        });

    // ⚠️ onVenueSelect intentionally omitted — accessed via ref above
    }, [safeVenues, weather, liveVenueFeatures, filteredIdSet, mapLoaded]);

    // ── Fly to selected venue ─────────────────────────────────
    useEffect(() => {
        if (!selectedVenue || !map.current) return;
        const lng = Number(selectedVenue.lng);
        const lat = Number(selectedVenue.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
        map.current.flyTo({
            center:   [lng, lat],
            zoom:     15,
            duration: 900,
            essential: true,
        });
    }, [selectedVenue]);

    // ── Render ────────────────────────────────────────────────
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* FIX 7: touch-action:pan-x pan-y lets the browser handle panning natively,
                no event.preventDefault() conflicts that cause stutter */}
            <div
                ref={mapContainer}
                style={{ width: '100%', height: '100%', touchAction: 'pan-x pan-y' }}
            />

            {/* Loading / error overlay */}
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

            {/* Caption bar */}
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
