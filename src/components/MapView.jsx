import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAP_STYLE, INITIAL_VIEW_STATE } from '../config/mapConfig';
import { demoVenues } from '../data/demoVenues';
import { motion } from 'framer-motion';
import { useWeather } from '../context/WeatherContext';

const MapView = forwardRef(({ onVenueSelect, selectedVenue, filteredVenueIds, mapRef, weatherColorFn, cozyMode }, ref) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const markers = useRef([]);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(false);
    const { weather } = useWeather();

    const isTokenMissing = !MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith('pk.');
    const isFallbackMode = isTokenMissing || mapError;

    // stable ref for latest callback props — avoids recreating markers on prop changes
    const onVenueSelectRef = useRef(onVenueSelect);
    const weatherColorFnRef = useRef(weatherColorFn);
    const filteredVenueIdsRef = useRef(filteredVenueIds);
    const cozyModeRef = useRef(cozyMode);
    const weatherRef = useRef(weather);

    useEffect(() => { onVenueSelectRef.current = onVenueSelect; }, [onVenueSelect]);
    useEffect(() => { weatherColorFnRef.current = weatherColorFn; }, [weatherColorFn]);
    useEffect(() => { filteredVenueIdsRef.current = filteredVenueIds; }, [filteredVenueIds]);
    useEffect(() => { cozyModeRef.current = cozyMode; }, [cozyMode]);
    useEffect(() => { weatherRef.current = weather; }, [weather]);

    useImperativeHandle(mapRef, () => ({
        flyTo: (options) => { if (map.current) map.current.flyTo(options); },
        resize: () => { if (map.current) map.current.resize(); }
    }));

    // ── Create all markers ONCE after map loads ──────────────
    const createMarkersOnce = useCallback(() => {
        markers.current.forEach(m => m.marker.remove());
        markers.current = [];

        demoVenues.forEach(venue => {
            const el = document.createElement('div');
            el.className = 'ss-map-marker';
            el.setAttribute('data-venue-id', venue.id);

            const pill = document.createElement('div');
            pill.className = 'ss-marker-pill ss-marker-sunny';

            const emoji = document.createElement('span');
            emoji.className = 'ss-marker-emoji';
            emoji.textContent = venue.emoji;

            pill.appendChild(emoji);
            el.appendChild(pill);

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.mapboxgl-popup').forEach(p => p.remove());
                onVenueSelectRef.current(venue);
            });

            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                .setLngLat([venue.lng, venue.lat])
                .addTo(map.current);

            markers.current.push({ marker, el, pill, venue });
        });

        // Apply initial state immediately after creation
        applyVisibility();
        applyWeatherColors();
        applyCozyGlow();
    }, []);

    // ── Imperative patch functions (no marker recreation) ────
    const applyVisibility = useCallback(() => {
        const ids = filteredVenueIdsRef.current;
        markers.current.forEach(({ el, venue }) => {
            const visible = ids === null || ids.includes(venue.id);
            el.style.opacity = visible ? '1' : '0.12';
            el.style.transform = visible ? 'scale(1)' : 'scale(0.65)';
            el.style.pointerEvents = visible ? 'auto' : 'none';
        });
    }, []);

    const applyWeatherColors = useCallback(() => {
        const w = weatherRef.current;
        const fn = weatherColorFnRef.current;
        if (!fn) return;
        markers.current.forEach(({ pill, venue }) => {
            const color = w ? fn(w, venue) : 'sunny';
            pill.className = pill.className.replace(/ss-marker-(sunny|cloudy|windy|rainy)/g, '');
            pill.classList.add(`ss-marker-${color}`);
        });
    }, []);

    const applyCozyGlow = useCallback(() => {
        const cozy = cozyModeRef.current;
        markers.current.forEach(({ pill, venue }) => {
            const isCozy = (venue.tags || []).some(t => ['Fireplace', 'Heaters', 'Indoor Warmth'].includes(t));
            pill.classList.toggle('ss-marker-cozy-glow', cozy && isCozy);
        });
    }, []);

    // ── Map init (runs once) ──────────────────────────────────
    useEffect(() => {
        if (map.current || !MAPBOX_TOKEN?.startsWith('pk.') || !mapContainer.current) {
            if (!MAPBOX_TOKEN?.startsWith('pk.')) setMapError(true);
            return;
        }

        mapboxgl.accessToken = MAPBOX_TOKEN;
        const timeout = setTimeout(() => { if (!map.current?.loaded()) setMapError(true); }, 12000);

        try {
            map.current = new mapboxgl.Map({
                container: mapContainer.current,
                style: MAP_STYLE,
                center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
                zoom: INITIAL_VIEW_STATE.zoom,
                pitch: INITIAL_VIEW_STATE.pitch,
                bearing: INITIAL_VIEW_STATE.bearing,
                antialias: true,
            });

            map.current.on('load', () => {
                clearTimeout(timeout);

                // 3D buildings
                map.current.addLayer({
                    id: '3d-buildings',
                    source: 'composite',
                    'source-layer': 'building',
                    filter: ['==', 'extrude', 'true'],
                    type: 'fill-extrusion',
                    minzoom: 12,
                    paint: {
                        'fill-extrusion-color': [
                            'interpolate', ['linear'], ['get', 'height'],
                            0, '#1a1a2e', 50, '#16213e', 100, '#0f3460', 200, '#533483',
                        ],
                        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, ['get', 'height']],
                        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, ['get', 'min_height']],
                        'fill-extrusion-opacity': 0.85,
                    }
                });

                // Atmosphere
                map.current.setFog({
                    color: 'rgb(10, 10, 20)',
                    'high-color': 'rgb(30, 40, 80)',
                    'horizon-blend': 0.08,
                    'space-color': 'rgb(5, 5, 15)',
                    'star-intensity': 0.6,
                });

                setMapLoaded(true);
                setMapError(false);
                createMarkersOnce();
            });

            map.current.on('error', (e) => {
                const status = e?.error?.status;
                const msg = String(e?.error?.message || '');
                if (status === 401 || status === 403 || /access token|unauthorized|style.*not found/i.test(msg)) {
                    clearTimeout(timeout);
                    setMapError(true);
                }
            });
        } catch (err) {
            clearTimeout(timeout);
            setMapError(true);
        }

        const ro = new ResizeObserver(() => { if (map.current) map.current.resize(); });
        if (mapContainer.current) ro.observe(mapContainer.current);
        window.addEventListener('resize', () => { if (map.current) map.current.resize(); }, { passive: true });

        return () => {
            clearTimeout(timeout);
            ro.disconnect();
            markers.current.forEach(m => m.marker.remove());
            markers.current = [];
            if (map.current) { map.current.remove(); map.current = null; }
        };
    }, [createMarkersOnce]);

    // ── React to filter changes — patch only visibility ───────
    useEffect(() => {
        if (!mapLoaded) return;
        applyVisibility();
    }, [filteredVenueIds, mapLoaded, applyVisibility]);

    // ── React to weather — patch only color classes ──────────
    useEffect(() => {
        if (!mapLoaded) return;
        applyWeatherColors();
    }, [weather, mapLoaded, applyWeatherColors]);

    // ── React to cozy mode — patch only glow class ───────────
    useEffect(() => {
        if (!mapLoaded) return;
        applyCozyGlow();
    }, [cozyMode, mapLoaded, applyCozyGlow]);

    // ── Fly to selected venue ────────────────────────────────
    useEffect(() => {
        if (selectedVenue && map.current) {
            map.current.flyTo({
                center: [selectedVenue.lng, selectedVenue.lat],
                zoom: 15.5, pitch: 60, bearing: -15, duration: 1600, essential: true,
            });
        }
    }, [selectedVenue]);

    return (
        <div className="absolute inset-0 w-full h-full">
            <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

            {/* Fallback canvas when map token unavailable */}
            {isFallbackMode && (
                <div className="absolute inset-0 bg-[#0a0a1e]">
                    <div className="absolute inset-0 opacity-15"
                        style={{ backgroundImage: 'radial-gradient(rgba(251,191,36,0.5) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 via-transparent to-blue-900/20" />
                    {demoVenues.map((venue) => {
                        const isFiltered = filteredVenueIds === null || filteredVenueIds.includes(venue.id);
                        if (!isFiltered) return null;
                        const left = ((venue.lng - INITIAL_VIEW_STATE.longitude + 0.1) / 0.2) * 100;
                        const top = ((-venue.lat + INITIAL_VIEW_STATE.latitude + 0.08) / 0.16) * 100;
                        return (
                            <motion.div
                                key={venue.id}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="absolute cursor-pointer -translate-x-1/2 -translate-y-1/2 group"
                                style={{ left: `${left}%`, top: `${top}%` }}
                                onClick={() => onVenueSelect(venue)}
                            >
                                <div className={`ss-marker-pill ss-marker-${weather && weatherColorFn ? weatherColorFn(weather, venue) : 'sunny'}`}>
                                    <span className="ss-marker-emoji">{venue.emoji}</span>
                                </div>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-black/85 text-white text-[10px] px-2.5 py-1 rounded-full pointer-events-none z-10 shadow-lg">
                                    {venue.venueName}
                                </div>
                            </motion.div>
                        );
                    })}
                    <motion.div
                        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1 }}
                        className="absolute bottom-40 left-1/2 -translate-x-1/2 glass-ui px-4 py-2 rounded-2xl border border-white/10 flex items-center gap-2"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-[11px] font-semibold text-white/60 uppercase tracking-widest">Demo Mode · Add Mapbox key to enable 3D</span>
                    </motion.div>
                </div>
            )}

        </div>
    );
});

MapView.displayName = 'MapView';
export default MapView;
