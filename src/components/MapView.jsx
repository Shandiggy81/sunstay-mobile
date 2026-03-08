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

    const createMarkersOnce = useCallback(() => {
        markers.current.forEach(m => m.marker.remove());
        markers.current = [];

        demoVenues.forEach(venue => {
            const el = document.createElement('div');
            el.className = 'ss-map-marker';
            el.setAttribute('data-venue-id', venue.id);
            el.style.touchAction = 'none';
            el.style.cursor = 'pointer';

            const pill = document.createElement('div');
            pill.className = 'ss-marker-pill ss-marker-sunny';

            const emoji = document.createElement('span');
            emoji.className = 'ss-marker-emoji';
            emoji.textContent = venue.emoji;

            pill.appendChild(emoji);
            el.appendChild(pill);

            const handleSelect = (e) => {
                e.stopPropagation();
                e.preventDefault();
                document.querySelectorAll('.mapboxgl-popup').forEach(p => p.remove());
                onVenueSelectRef.current(venue);
            };
            el.addEventListener('click', handleSelect);
            el.addEventListener('touchend', handleSelect, { passive: false });

            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                .setLngLat([venue.lng, venue.lat])
                .addTo(map.current);

            markers.current.push({ marker, el, pill, venue });
        });

        applyVisibility();
        applyWeatherColors();
        applyCozyGlow();
    }, []);

    const applyVisibility = useCallback(() => {
        const ids = filteredVenueIdsRef.current;
        markers.current.forEach(({ el, venue }) => {
            const visible = ids === null || ids.includes(venue.id);
            el.style.opacity = visible ? '1' : '0.15';
            el.style.transform = visible ? 'scale(1)' : 'scale(0.6)';
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

        return () => {
            clearTimeout(timeout);
            ro.disconnect();
            markers.current.forEach(m => m.marker.remove());
            markers.current = [];
            if (map.current) { map.current.remove(); map.current = null; }
        };
    }, [createMarkersOnce]);

    useEffect(() => {
        if (!mapLoaded) return;
        applyVisibility();
    }, [filteredVenueIds, mapLoaded, applyVisibility]);

    useEffect(() => {
        if (!mapLoaded) return;
        applyWeatherColors();
    }, [weather, mapLoaded, applyWeatherColors]);

    useEffect(() => {
        if (!mapLoaded) return;
        applyCozyGlow();
    }, [cozyMode, mapLoaded, applyCozyGlow]);

    useEffect(() => {
        if (selectedVenue && map.current) {
            map.current.flyTo({
                center: [selectedVenue.lng, selectedVenue.lat],
                zoom: 15.5,
                pitch: 45,
                bearing: -8,
                duration: 1400,
                essential: true,
            });
        }
    }, [selectedVenue]);

    return (
        <div className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
            <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

            {isFallbackMode && (
                <div className="absolute inset-0 bg-[#f0ece4]">
                    <div className="absolute inset-0 opacity-20"
                        style={{ backgroundImage: 'linear-gradient(rgba(100,100,100,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(100,100,100,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-100/30 via-transparent to-amber-100/20" />
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
                                style={{ left: `${left}%`, top: `${top}%`, zIndex: 1 }}
                                onClick={() => onVenueSelect(venue)}
                            >
                                <div className={`ss-marker-pill ss-marker-${weather && weatherColorFn ? weatherColorFn(weather, venue) : 'sunny'}`}>
                                    <span className="ss-marker-emoji">{venue.emoji}</span>
                                </div>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-gray-900/85 text-white text-[10px] px-2.5 py-1 rounded-full pointer-events-none z-10 shadow-lg">
                                    {venue.venueName}
                                </div>
                            </motion.div>
                        );
                    })}
                    <motion.div
                        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1 }}
                        className="absolute top-24 left-1/2 -translate-x-1/2 bg-white/90 px-4 py-2 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-2"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Demo · Add Mapbox key for live map</span>
                    </motion.div>
                </div>
            )}
        </div>
    );
});

MapView.displayName = 'MapView';
export default MapView;
