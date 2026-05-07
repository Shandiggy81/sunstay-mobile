/**
 * VenueMap — HTML Marker-based emoji pins (Mapbox GL symbol layers can't render emoji on desktop)
 * States: 😎 sunny | 🌤️ cloudy | 🌦️ rain | 🥶 cold | 🔥 heater override
 * @module components/Map/VenueMap
 */

import React, {
    useEffect, useRef, useState,
    useMemo, forwardRef, useImperativeHandle, memo,
} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAP_STYLE, INITIAL_VIEW_STATE } from '../../config/mapConfig';
import { useWeather } from '../../context/WeatherContext';
import { calculateLiveSunScore } from '../../utils/sunScore';

// ── Pin colour palette — 5 visually distinct states ────────────
const PIN_STATES = {
    heater:  { emoji: '🔥', bg: '#ff6b35', border: '#c2410c' },
    rain:    { emoji: '🌦️', bg: '#1e40af', border: '#1e3a8a' },
    cold:    { emoji: '🥶', bg: '#e0f2fe', border: '#7dd3fc' },
    sunny:   { emoji: '😎', bg: '#fbbf24', border: '#d97706' },
    default: { emoji: '🌤️', bg: '#60a5fa', border: '#3b82f6' },
};

/**
 * Returns pin state key based on live weather + venue heating state.
 * Priority: heater > rain > cold > sunny > default
 */
function getPinStateKey(venue, weather, liveVenueFeatures = {}) {
    const live = liveVenueFeatures?.[venue.id] || {};

    const apparentTemp = weather?.apparentTemp ?? weather?.main?.feels_like ?? weather?.main?.temp ?? 20;
    const precipProb   = weather?.precipProbability ?? 0;
    const cloudCover   = weather?.cloudCoverPct ?? weather?.clouds?.all ?? 0;
    const condition    = (weather?.weather?.[0]?.main || '').toLowerCase();

    // Heater override — key names aligned: heatersOn / fireplaceOn
    const heatersOn =
        !!live.heatersOn || !!live.fireplaceOn ||
        !!venue.heatersOn || !!venue.fireplaceOn;

    if (heatersOn) return 'heater';
    if (condition.includes('rain') || condition.includes('drizzle') || precipProb >= 40) return 'rain';
    if (apparentTemp <= 11) return 'cold';
    if (apparentTemp >= 18 && cloudCover <= 35 && precipProb < 20) return 'sunny';
    return 'default';
}

// ── Create a single HTML marker element ─────────────────────────
function createMarkerEl(pinKey) {
    const { emoji, bg, border } = PIN_STATES[pinKey];
    const el = document.createElement('div');
    el.style.cssText = [
        'width:40px', 'height:40px', 'border-radius:50%',
        `background:${bg}`, `border:3px solid ${border}`,
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:20px', 'cursor:pointer',
        'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
        'transition:transform 150ms ease',
        'user-select:none',
        'line-height:1',
    ].join(';');
    el.textContent = emoji;
    el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.15)'; });
    el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
    return el;
}


// ── VenueMap Component ──────────────────────────────────────────

const VenueMap = forwardRef(({
    venues = [],
    selectedVenue,
    filteredVenueIds,
    onVenueSelect,
    weatherColorFn,
    liveVenueFeatures = {},
}, ref) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const markersRef = useRef({});  // { venueId: { marker, el, pinKey } }
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(false);
    const { weather } = useWeather();

    // ── Expose flyTo via ref ──────────────────────────────────
    useImperativeHandle(ref, () => ({
        flyTo: (options) => { if (map.current) map.current.flyTo(options); },
        getMap: () => map.current,
    }));

    // ── Initialize Map ────────────────────────────────────────
    useEffect(() => {
        if (map.current) return;

        const isTokenValid = MAPBOX_TOKEN && MAPBOX_TOKEN.startsWith('pk.');
        if (!isTokenValid) { setMapError(true); return; }
        if (!mapContainer.current) return;

        mapboxgl.accessToken = MAPBOX_TOKEN;

        const loadTimeout = setTimeout(() => setMapError(true), 12000);

        try {
            map.current = new mapboxgl.Map({
                container: mapContainer.current,
                style: MAP_STYLE,
                center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
                zoom: INITIAL_VIEW_STATE.zoom,
                pitch: INITIAL_VIEW_STATE.pitch || 0,
                bearing: INITIAL_VIEW_STATE.bearing || 0,
            });

            map.current.on('load', () => {
                clearTimeout(loadTimeout);
                setMapLoaded(true);
                setMapError(false);
            });

            map.current.on('error', (e) => {
                const msg = e.error?.message || '';
                if (msg.includes('401') || msg.includes('403') || msg.includes('access token')) {
                    clearTimeout(loadTimeout);
                    setMapError(true);
                }
            });

            map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

        } catch (err) {
            clearTimeout(loadTimeout);
            setMapError(true);
        }

        return () => {
            clearTimeout(loadTimeout);
            Object.values(markersRef.current).forEach(({ marker }) => marker.remove());
            markersRef.current = {};
            if (map.current) { map.current.remove(); map.current = null; }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Sync HTML markers when map/venues/weather/filters change ─
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const visible = new Set(
            filteredVenueIds === null ? venues.map(v => v.id) : filteredVenueIds
        );

        venues.forEach(venue => {
            const pinKey = getPinStateKey(venue, weather, liveVenueFeatures);
            const existing = markersRef.current[venue.id];

            if (!visible.has(venue.id)) {
                // Hide marker
                if (existing) {
                    existing.marker.getElement().style.display = 'none';
                }
                return;
            }

            if (existing) {
                // Show it
                existing.marker.getElement().style.display = 'flex';
                // Update colours/emoji if state changed
                if (existing.pinKey !== pinKey) {
                    const { emoji, bg, border } = PIN_STATES[pinKey];
                    existing.el.textContent = emoji;
                    existing.el.style.background = bg;
                    existing.el.style.borderColor = border;
                    existing.pinKey = pinKey;
                }
            } else {
                // Create new marker
                const el = createMarkerEl(pinKey);
                el.addEventListener('click', () => onVenueSelect(venue));
                const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                    .setLngLat([venue.lng, venue.lat])
                    .addTo(map.current);
                markersRef.current[venue.id] = { marker, el, pinKey };
            }
        });

        // Remove markers for venues no longer in list
        Object.keys(markersRef.current).forEach(id => {
            if (!venues.find(v => String(v.id) === String(id))) {
                markersRef.current[id].marker.remove();
                delete markersRef.current[id];
            }
        });

    }, [venues, weather, liveVenueFeatures, filteredVenueIds, mapLoaded, onVenueSelect]);

    // ── Fly to selected venue ─────────────────────────────────
    useEffect(() => {
        if (selectedVenue && map.current) {
            map.current.flyTo({
                center: [selectedVenue.lng, selectedVenue.lat],
                zoom: 15, duration: 1200, essential: true,
            });
        }
    }, [selectedVenue]);

    // ── Render ────────────────────────────────────────────────
    const isTokenMissing = !MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith('pk.');

    return (
        <div className="ss-mapview-root" style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

            {(mapError || !mapLoaded) && (
                <div style={overlayStyles.container}>
                    {(isTokenMissing || mapError) ? (
                        <div style={overlayStyles.errorContent}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗺️</div>
                            <p style={overlayStyles.errorText}>
                                {isTokenMissing ? 'Mapbox token required for map rendering' : 'Map failed to load — using fallback mode'}
                            </p>
                            <div style={overlayStyles.badge}>
                                <div style={overlayStyles.pulseDot} />
                                <span>VenueMap GL • Weather-Reactive Pins</span>
                            </div>
                        </div>
                    ) : (
                        <div style={overlayStyles.loadingContent}>
                            <div style={{ fontSize: '48px', animation: 'spin 2s linear infinite' }}>☀️</div>
                            <p style={overlayStyles.loadingText}>Loading optimized map...</p>
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

const overlayStyles = {
    container: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,15,30,0.95)', zIndex: 10 },
    errorContent: { textAlign: 'center', padding: '24px' },
    errorText: { color: 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: '600' },
    badge: { display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.4)', padding: '8px 16px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', marginTop: '16px', fontSize: '10px', fontWeight: '700', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '1px' },
    pulseDot: { width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24', animation: 'pulse 2s infinite' },
    loadingContent: { textAlign: 'center' },
    loadingText: { color: 'rgba(255,255,255,0.5)', fontWeight: '600', fontStyle: 'italic', marginTop: '12px' },
};

export default memo(VenueMap);
