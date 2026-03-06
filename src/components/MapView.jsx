import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAP_STYLE, INITIAL_VIEW_STATE } from '../config/mapConfig';
import { demoVenues } from '../data/demoVenues';
import { motion, AnimatePresence } from 'framer-motion';
import { useWeather } from '../context/WeatherContext';
import { generateHourlyForecast } from '../data/windIntelligence';

const venueById = Object.fromEntries(demoVenues.map(v => [v.id, v]));

function buildGeoJSON(venues) {
    return {
        type: 'FeatureCollection',
        features: venues.map(v => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
            properties: { id: v.id, emoji: v.emoji, venueName: v.venueName }
        }))
    };
}

const fmtHour = (h) => {
    if (h === 0 || h === 24) return '12am';
    if (h === 12) return '12pm';
    return h > 12 ? `${h - 12}pm` : `${h}am`;
};

const HOUR_LABELS = [6, 9, 12, 15, 18, 21];

const MapView = forwardRef(({ onVenueSelect, selectedVenue, filteredVenueIds, mapRef, weatherColorFn, cozyMode, isExpanded }, ref) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const unclusteredMarkers = useRef([]);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(false);
    const [scrubHour, setScrubHour] = useState(new Date().getHours());
    const [scrubbing, setScrubbing] = useState(false);
    const { weather } = useWeather();

    const isTokenMissing = !MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith('pk.');
    const isFallbackMode = isTokenMissing || mapError;

    useImperativeHandle(mapRef, () => ({
        flyTo: (options) => { if (map.current) map.current.flyTo(options); },
        resize: () => { if (map.current) map.current.resize(); }
    }));

    useEffect(() => {
        if (map.current) return;
        if (!MAPBOX_TOKEN?.startsWith('pk.')) { setMapError(true); return; }
        if (!mapContainer.current) return;

        mapboxgl.accessToken = MAPBOX_TOKEN;

        const timeout = setTimeout(() => { if (!mapLoaded) setMapError(true); }, 10000);

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
                            0, '#1a1a2e',
                            50, '#16213e',
                            100, '#0f3460',
                            200, '#533483',
                        ],
                        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, ['get', 'height']],
                        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, ['get', 'min_height']],
                        'fill-extrusion-opacity': 0.85,
                    }
                });

                map.current.setFog({
                    color: 'rgb(10, 10, 20)',
                    'high-color': 'rgb(30, 40, 80)',
                    'horizon-blend': 0.08,
                    'space-color': 'rgb(5, 5, 15)',
                    'star-intensity': 0.6,
                });

                setMapLoaded(true);
                setMapError(false);
                createAllMarkers();
            });

            map.current.on('error', (e) => {
                const status = e?.error?.status;
                const msg = String(e?.error?.message || '');
                const fatal = status === 401 || status === 403 || /access token|unauthorized|style.*not found/i.test(msg);
                if (fatal) { clearTimeout(timeout); setMapError(true); }
            });
        } catch (err) {
            clearTimeout(timeout);
            setMapError(true);
        }

        const containerEl = mapContainer.current;
        const ro = new ResizeObserver(() => { if (map.current) map.current.resize(); });
        if (containerEl) ro.observe(containerEl);

        return () => {
            clearTimeout(timeout);
            ro.disconnect();
            unclusteredMarkers.current.forEach(m => m.marker.remove());
            if (map.current) { map.current.remove(); map.current = null; }
        };
    }, []);

    const createAllMarkers = useCallback(() => {
        unclusteredMarkers.current.forEach(m => m.marker.remove());
        unclusteredMarkers.current = [];

        demoVenues.forEach(venue => {
            const isVisible = filteredVenueIds === null || (Array.isArray(filteredVenueIds) && filteredVenueIds.includes(venue.id));
            const colorClass = weather && weatherColorFn ? `ss-marker-${weatherColorFn(weather, venue)}` : 'ss-marker-sunny';
            const isCozy = cozyMode && (venue.tags || []).some(t => ['Fireplace', 'Heaters', 'Indoor Warmth'].includes(t));

            const el = document.createElement('div');
            el.className = 'ss-map-marker';
            el.style.opacity = isVisible ? '1' : '0.1';
            el.style.transform = isVisible ? 'scale(1)' : 'scale(0.7)';
            el.innerHTML = `<div class="ss-marker-pill ${colorClass} ${isCozy ? 'ss-marker-cozy-glow' : ''}"><span class="ss-marker-emoji">${venue.emoji}</span></div>`;

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.mapboxgl-popup').forEach(p => p.remove());
                onVenueSelect(venue);
            });

            const marker = new mapboxgl.Marker(el).setLngLat([venue.lng, venue.lat]).addTo(map.current);
            unclusteredMarkers.current.push({ marker, venueId: venue.id, venue });
        });
    }, [filteredVenueIds, weather, weatherColorFn, cozyMode, onVenueSelect]);

    useEffect(() => {
        if (!mapLoaded) return;
        createAllMarkers();
    }, [mapLoaded, createAllMarkers]);

    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const safeResize = () => { if (map.current) map.current.resize(); };
        const ro = new ResizeObserver(safeResize);
        if (mapContainer.current) ro.observe(mapContainer.current);
        window.addEventListener('resize', safeResize, { passive: true });
        return () => { ro.disconnect(); window.removeEventListener('resize', safeResize); };
    }, [mapLoaded, isExpanded]);

    useEffect(() => {
        if (selectedVenue && map.current) {
            map.current.flyTo({
                center: [selectedVenue.lng, selectedVenue.lat],
                zoom: 15.5,
                pitch: 60,
                bearing: -15,
                duration: 1600,
                essential: true,
            });
        }
    }, [selectedVenue]);

    useEffect(() => {
        if (!mapLoaded) return;
        unclusteredMarkers.current.forEach(({ marker, venueId }) => {
            const el = marker.getElement();
            const isVisible = filteredVenueIds === null || filteredVenueIds.includes(venueId);
            el.style.opacity = isVisible ? '1' : '0.1';
            el.style.transform = isVisible ? 'scale(1)' : 'scale(0.7)';
        });
    }, [filteredVenueIds, mapLoaded]);

    useEffect(() => {
        if (!weather || !weatherColorFn) return;
        unclusteredMarkers.current.forEach(({ marker, venue }) => {
            const el = marker.getElement();
            const pill = el.querySelector('.ss-marker-pill');
            if (!pill) return;
            const color = weatherColorFn(weather, venue);
            pill.className = pill.className.replace(/ss-marker-(sunny|cloudy|windy)/g, '');
            pill.classList.add(`ss-marker-${color}`);
        });
    }, [weather, weatherColorFn]);

    useEffect(() => {
        unclusteredMarkers.current.forEach(({ marker, venue }) => {
            const pill = marker.getElement().querySelector('.ss-marker-pill');
            if (!pill) return;
            const isCozy = (venue.tags || []).some(t => ['Fireplace', 'Heaters', 'Indoor Warmth'].includes(t));
            pill.classList.toggle('ss-marker-cozy-glow', cozyMode && isCozy);
        });
    }, [cozyMode]);

    const sunPosition = ((scrubHour - 6) / 15) * 100;
    const isDaytime = scrubHour >= 6 && scrubHour <= 20;
    const isGoldenHour = (scrubHour >= 6 && scrubHour <= 8) || (scrubHour >= 17 && scrubHour <= 20);

    return (
        <div className="fixed inset-0 w-full h-full">
            <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

            {isFallbackMode && (
                <div className="absolute inset-0 bg-[#0a0a1e]">
                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(rgba(251,191,36,0.4) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
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
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-black/80 text-white text-[10px] px-2 py-1 rounded-full pointer-events-none z-10">
                                    {venue.venueName}
                                </div>
                            </motion.div>
                        );
                    })}
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 1 }}
                        className="absolute bottom-40 left-1/2 -translate-x-1/2 glass-dark px-4 py-2 rounded-2xl flex items-center gap-2"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-widest">Demo Mode</span>
                    </motion.div>
                </div>
            )}

            {/* Sun-Scrubber */}
            <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.8, type: 'spring', damping: 22, stiffness: 180 }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(520px,90vw)]"
            >
                <div className="glass-dark rounded-2xl px-5 pt-4 pb-5 shadow-2xl border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <motion.span
                                animate={{ scale: scrubbing ? 1.2 : 1 }}
                                className="text-lg"
                            >
                                {isGoldenHour ? '🌅' : isDaytime ? '☀️' : '🌙'}
                            </motion.span>
                            <span className="text-white font-semibold text-sm">Sun Scrubber</span>
                        </div>
                        <motion.div
                            key={scrubHour}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-1.5"
                        >
                            <span className={`text-sm font-bold ${isGoldenHour ? 'text-amber-400' : isDaytime ? 'text-yellow-300' : 'text-blue-300'}`}>
                                {fmtHour(scrubHour)}
                            </span>
                            {isDaytime && (
                                <span className="text-[10px] text-white/40 font-medium">
                                    {isGoldenHour ? 'Golden Hour' : scrubHour < 12 ? 'Morning' : scrubHour < 17 ? 'Afternoon' : 'Evening'}
                                </span>
                            )}
                        </motion.div>
                    </div>

                    <div className="relative">
                        <div className="h-1.5 rounded-full bg-white/10 relative overflow-visible mb-1">
                            <div
                                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-150 ${isGoldenHour ? 'bg-gradient-to-r from-orange-500 to-amber-400' : isDaytime ? 'bg-gradient-to-r from-amber-500 to-yellow-300' : 'bg-gradient-to-r from-blue-700 to-blue-500'}`}
                                style={{ width: `${Math.max(0, Math.min(100, ((scrubHour - 6) / 15) * 100))}%` }}
                            />
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={23}
                            value={scrubHour}
                            onChange={e => setScrubHour(parseInt(e.target.value))}
                            onMouseDown={() => setScrubbing(true)}
                            onMouseUp={() => setScrubbing(false)}
                            onTouchStart={() => setScrubbing(true)}
                            onTouchEnd={() => setScrubbing(false)}
                            className="sun-scrubber-input"
                        />
                    </div>

                    <div className="flex justify-between mt-2 px-0.5">
                        {HOUR_LABELS.map(h => (
                            <button
                                key={h}
                                onClick={() => setScrubHour(h)}
                                className={`text-[10px] font-semibold transition-colors ${scrubHour === h ? 'text-amber-400' : 'text-white/30 hover:text-white/60'}`}
                            >
                                {fmtHour(h)}
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>
        </div>
    );
});

MapView.displayName = 'MapView';

export default MapView;
