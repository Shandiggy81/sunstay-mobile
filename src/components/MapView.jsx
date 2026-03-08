import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAP_STYLE, INITIAL_VIEW_STATE } from '../config/mapConfig';
import { demoVenues } from '../data/demoVenues';
import { motion, AnimatePresence } from 'framer-motion';
import { useWeather } from '../context/WeatherContext';
import {
    generateHourlyForecast,
} from '../data/windIntelligence';
import { getSunPositionForMap, toMapboxSkyValues, getMapboxLightPreset } from '../util/sunPosition';

// ── Build a venue lookup for click handlers ──────────────────────
const venueById = Object.fromEntries(demoVenues.map(v => [v.id, v]));

// ── Convert venues to GeoJSON FeatureCollection ──────────────────
function buildGeoJSON(venues) {
    return {
        type: 'FeatureCollection',
        features: venues.map(v => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
            properties: {
                id: v.id,
                emoji: v.emoji,
                venueName: v.venueName,
            }
        }))
    };
}

const MapView = forwardRef(({ onVenueSelect, selectedVenue, filteredVenueIds, mapRef, weatherColorFn, cozyMode, isExpanded }, ref) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const unclusteredMarkers = useRef([]);
    const comfortEls = useRef([]);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(false);
    const [comfortMode, setComfortMode] = useState(false);
    const [comfortHour, setComfortHour] = useState(new Date().getHours());
    const [uvMode, setUvMode] = useState(false);
    const [radarMode, setRadarMode] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const { weather, getUVIndex } = useWeather();
    const uvIndex = getUVIndex();

    // Derived State
    const isTokenMissing = !MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith('pk.');
    const isFallbackMode = isTokenMissing || mapError;
    const showOverlay = !mapLoaded || mapError;
    const showControls = mapLoaded && !mapError && !comfortMode;

    // Expose flyTo and resize methods to parent via ref
    useImperativeHandle(mapRef, () => ({
        flyTo: (options) => {
            if (map.current) {
                map.current.flyTo(options);
            }
        },
        resize: () => {
            if (map.current) {
                map.current.resize();
            }
        }
    }));

    // ── Initialize Map ──────────────────────────────────────────────
    useEffect(() => {
        if (map.current) return;

        const isTokenValid = MAPBOX_TOKEN && MAPBOX_TOKEN.startsWith('pk.');
        if (!isTokenValid) {
            console.warn('Mapbox Token is missing or invalid. Map rendering is disabled.');
            setMapError(true);
            return;
        }

        if (!mapContainer.current) {
            console.warn('Map container not ready.');
            return;
        }

        mapboxgl.accessToken = MAPBOX_TOKEN;

        const loadTimeout = setTimeout(() => {
            if (!map.current || !mapLoaded) {
                console.warn('Map loading timed out after 8 seconds.');
                setMapError(true);
            }
        }, 8000);

        try {
            map.current = new mapboxgl.Map({
                container: mapContainer.current,
                style: MAP_STYLE,
                center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
                zoom: INITIAL_VIEW_STATE.zoom,
                pitch: INITIAL_VIEW_STATE.pitch,
                bearing: INITIAL_VIEW_STATE.bearing,
            });

            map.current.on('load', () => {
                clearTimeout(loadTimeout);
                setMapLoaded(true);
                setMapError(false);
                setupClusterSource();
                applySunSkyLayer();
            });

            map.current.on('error', (e) => {
                const status = e?.error?.status;
                const msg = String(e?.error?.message || '');
                const fatal = status === 401 || status === 403 || /access token|unauthorized|style.*not found/i.test(msg);
                if (fatal) {
                    console.error('Fatal Mapbox error:', e.error);
                    clearTimeout(loadTimeout);
                    setMapError(true);
                } else {
                    console.warn('Non-fatal Mapbox error:', e.error);
                }
            });

            if (!isFallbackMode) {
                map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
            }
        } catch (error) {
            console.error('Error initializing map:', error);
            clearTimeout(loadTimeout);
            setMapError(true);
        }

        // ResizeObserver — automatically resize Mapbox canvas when container dimensions change
        const containerEl = mapContainer.current;
        const ro = new ResizeObserver(() => {
            if (map.current) map.current.resize();
        });
        if (containerEl) ro.observe(containerEl);

        return () => {
            clearTimeout(loadTimeout);
            ro.disconnect();
            unclusteredMarkers.current.forEach(m => m.marker.remove());
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

    // ── Apply SunCalc-driven sky layer to the map ─────────────────
    const applySunSkyLayer = useCallback(() => {
        if (!map.current) return;

        const updateSky = () => {
            if (!map.current) return;
            try {
                const sunPos = getSunPositionForMap(
                    INITIAL_VIEW_STATE.latitude,
                    INITIAL_VIEW_STATE.longitude
                );
                const skyValues = toMapboxSkyValues(sunPos);
                const lightPreset = getMapboxLightPreset(sunPos);

                // Add or update sky layer
                if (map.current.getLayer('sky-layer')) {
                    map.current.setPaintProperty('sky-layer', 'sky-atmosphere-sun', skyValues.sunPosition);
                    map.current.setPaintProperty('sky-layer', 'sky-atmosphere-sun-intensity', skyValues.sunIntensity);
                } else {
                    map.current.addLayer({
                        id: 'sky-layer',
                        type: 'sky',
                        paint: {
                            'sky-type': 'atmosphere',
                            'sky-atmosphere-sun': skyValues.sunPosition,
                            'sky-atmosphere-sun-intensity': skyValues.sunIntensity,
                            'sky-atmosphere-color': skyValues.atmosphereColor,
                        }
                    });
                }

                // Apply directional light
                map.current.setLight({
                    anchor: lightPreset.anchor,
                    color: lightPreset.color,
                    intensity: lightPreset.intensity,
                });
            } catch (e) {
                // Sky layer is cosmetic — don't break the map if it fails
                console.warn('[MapView] Sky layer update failed (non-fatal):', e.message);
            }
        };

        // Apply immediately on load
        updateSky();

        // Update every 60 seconds so sky shifts through the day
        const skyInterval = setInterval(updateSky, 60000);
        // Store interval ID for cleanup
        map.current._sunSkyInterval = skyInterval;
    }, []);

    // Cleanup sky interval on unmount
    useEffect(() => {
        return () => {
            if (map.current?._sunSkyInterval) {
                clearInterval(map.current._sunSkyInterval);
            }
        };
    }, []);

    // ── Setup GeoJSON cluster source + layers ──────────────────────
    const setupClusterSource = useCallback(() => {
        if (!map.current) return;

        const geojson = buildGeoJSON(demoVenues);

        // Add GeoJSON source with clustering
        map.current.addSource('venues', {
            type: 'geojson',
            data: geojson,
            cluster: true,
            clusterRadius: 42,
            clusterMaxZoom: 13,
        });

        // ── Cluster circles ─────────────────────────────────────
        map.current.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'venues',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': [
                    'step', ['get', 'point_count'],
                    '#fbbf24',   // amber-400 for small clusters
                    5, '#f59e0b', // amber-500 for medium
                    10, '#d97706', // amber-600 for large
                    20, '#b45309'  // amber-700 for very large
                ],
                'circle-radius': [
                    'step', ['get', 'point_count'],
                    18,    // small
                    5, 22,  // medium
                    10, 28, // large
                    20, 34  // very large
                ],
                'circle-stroke-width': 3,
                'circle-stroke-color': 'rgba(255,255,255,0.7)',
                'circle-opacity': 0.9,
            }
        });

        // ── Cluster count labels ─────────────────────────────────
        map.current.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'venues',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': 13,
                'text-allow-overlap': true,
            },
            paint: {
                'text-color': '#ffffff',
            }
        });

        // ── Click on cluster → zoom in ───────────────────────────
        map.current.on('click', 'clusters', (e) => {
            const features = map.current.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const clusterId = features[0].properties.cluster_id;
            map.current.getSource('venues').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                map.current.easeTo({
                    center: features[0].geometry.coordinates,
                    zoom: zoom,
                    duration: 500,
                });
            });
        });

        // ── Render venue markers directly from data ──────────────────
        // Instead of relying on querySourceFeatures (which is unreliable),
        // create DOM markers for all venues and show/hide based on zoom
        const createAllMarkers = () => {
            // Remove existing markers
            unclusteredMarkers.current.forEach(m => m.marker.remove());
            unclusteredMarkers.current = [];

            demoVenues.forEach(venue => {
                // Check if filtered
                const isVisible = filteredVenueIds === null || (Array.isArray(filteredVenueIds) && filteredVenueIds.includes(venue.id));

                // Get weather color
                const colorClass = weather && weatherColorFn
                    ? `ss-marker-${weatherColorFn(weather, venue)}`
                    : 'ss-marker-sunny';

                // Check cozy
                const isCozy = cozyMode && (venue.tags || []).some(t =>
                    ['Fireplace', 'Heaters', 'Indoor Warmth'].includes(t)
                );

                const el = document.createElement('div');
                el.className = 'ss-map-marker';
                el.style.pointerEvents = 'auto';
                el.style.touchAction = 'manipulation';
                el.style.opacity = isVisible ? '1' : '0.15';
                el.style.transform = isVisible ? 'scale(1)' : 'scale(0.85)';
                el.innerHTML = `
                    <div class="ss-marker-pill ${colorClass} ${isCozy ? 'ss-marker-cozy-glow' : ''}">
                        <span class="ss-marker-emoji">${venue.emoji}</span>
                    </div>
                `;

                if (comfortMode) {
                    el.style.display = 'none';
                }

                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const popups = document.getElementsByClassName('mapboxgl-popup');
                    for (let p of popups) p.remove();
                    onVenueSelect(venue);
                });

                const marker = new mapboxgl.Marker(el)
                    .setLngLat([venue.lng, venue.lat])
                    .addTo(map.current);

                unclusteredMarkers.current.push({ marker, venueId: venue.id, venue });
            });
        };

        // Hide cluster layers since we're using DOM markers directly
        // This avoids double-rendering (cluster circles + individual pins)
        try {
            if (map.current.getLayer('clusters')) {
                map.current.setLayoutProperty('clusters', 'visibility', 'none');
            }
            if (map.current.getLayer('cluster-count')) {
                map.current.setLayoutProperty('cluster-count', 'visibility', 'none');
            }
        } catch (e) { /* layers might not be ready */ }

        // Create markers immediately
        createAllMarkers();
    }, []);

    // ── Safe Resize helper ──────────────────────────────────────────
    const safeResize = useCallback(() => {
        if (!map.current || !mapContainer.current) return;
        const { clientWidth, clientHeight } = mapContainer.current;
        if (clientWidth === 0 || clientHeight === 0) return;
        map.current.resize();
    }, []);

    // ── Map Resize Handling (ResizeObserver) ─────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded || !mapContainer.current) return;
        let t1, t2, t3;
        let raf = 0;
        const scheduleResize = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                safeResize();
                t1 = setTimeout(safeResize, 120);
                t2 = setTimeout(safeResize, 260);
                t3 = setTimeout(safeResize, 420);
            });
        };
        const ro = new ResizeObserver(scheduleResize);
        ro.observe(mapContainer.current);
        window.addEventListener('resize', scheduleResize, { passive: true });
        window.addEventListener('orientationchange', scheduleResize);
        mapContainer.current.addEventListener('transitionend', scheduleResize);
        scheduleResize();
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', scheduleResize);
            window.removeEventListener('orientationchange', scheduleResize);
            mapContainer.current?.removeEventListener('transitionend', scheduleResize);
            cancelAnimationFrame(raf);
            clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
        };
    }, [mapLoaded, isExpanded, safeResize]);

    // Fly to venue when selected
    useEffect(() => {
        if (selectedVenue && map.current) {
            map.current.flyTo({
                center: [selectedVenue.lng, selectedVenue.lat],
                zoom: 15,
                duration: 1200,
                essential: true,
            });
        }
    }, [selectedVenue]);

    // ── Update GeoJSON source when filter changes ─────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const source = map.current.getSource('venues');
        if (!source) return;

        setIsUpdating(true);

        // Rebuild GeoJSON with only filtered venues for clustering
        const filtered = filteredVenueIds === null
            ? demoVenues
            : demoVenues.filter(v => filteredVenueIds.includes(v.id));

        source.setData(buildGeoJSON(filtered));

        // Update marker visibility based on new filters
        unclusteredMarkers.current.forEach(({ marker, venueId }) => {
            const el = marker.getElement();
            const isVisible = filteredVenueIds === null || (Array.isArray(filteredVenueIds) && filteredVenueIds.includes(venueId));
            el.style.opacity = isVisible ? '1' : '0.15';
            el.style.transform = isVisible ? 'scale(1)' : 'scale(0.85)';
        });

        setTimeout(() => setIsUpdating(false), 200);
    }, [filteredVenueIds, mapLoaded]);

    // ── Update marker weather colors when weather changes ─────────
    useEffect(() => {
        if (!weather || !weatherColorFn) return;
        unclusteredMarkers.current.forEach(({ marker, venue }) => {
            const el = marker.getElement();
            const pill = el.querySelector('.ss-marker-pill');
            if (!pill) return;
            const color = weatherColorFn(weather, venue);
            // Remove old color classes and add new one
            pill.className = pill.className.replace(/ss-marker-(sunny|cloudy|windy)/g, '');
            pill.classList.add(`ss-marker-${color}`);
        });
    }, [weather, weatherColorFn]);

    // ── Handle Cozy Mode Glow ─────────────────────────────────────
    useEffect(() => {
        unclusteredMarkers.current.forEach(({ marker, venue }) => {
            const el = marker.getElement();
            const pill = el.querySelector('.ss-marker-pill');
            if (!pill) return;

            const isCozy = (venue.tags || []).some(tag =>
                ['Fireplace', 'Heaters', 'Indoor Warmth'].includes(tag)
            );

            if (cozyMode && isCozy) {
                pill.classList.add('ss-marker-cozy-glow');
            } else {
                pill.classList.remove('ss-marker-cozy-glow');
            }
        });
    }, [cozyMode]);

    // ── Sync cluster vs pin visibility based on zoom & comfortMode ──
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const syncClusterVsPins = () => {
            const zoom = map.current.getZoom();
            const showClusters = !comfortMode && zoom < 13;
            ['clusters', 'cluster-count'].forEach((id) => {
                if (map.current.getLayer(id)) {
                    map.current.setLayoutProperty(id, 'visibility', showClusters ? 'visible' : 'none');
                }
            });
            unclusteredMarkers.current.forEach(({ marker }) => {
                marker.getElement().style.display = (comfortMode || showClusters) ? 'none' : 'block';
            });
        };
        syncClusterVsPins();
        map.current.on('zoomend', syncClusterVsPins);
        return () => {
            map.current?.off('zoomend', syncClusterVsPins);
        };
    }, [mapLoaded, comfortMode]);

    // ── Comfort overlay markers ──────────────────────────────
    const updateComfortOverlay = useCallback(() => {
        comfortEls.current.forEach(m => m.remove());
        comfortEls.current = [];

        if (!comfortMode || !weather || !map.current) return;

        const temp = weather.main?.temp;
        const windSpeed = weather.wind?.speed;
        const humidity = weather.main?.humidity;

        demoVenues.forEach((venue) => {
            const forecast = generateHourlyForecast(temp, windSpeed, humidity, venue);
            const currentH = new Date().getHours();
            const offset = (comfortHour - currentH + 24) % 24;
            const hourData = forecast[offset] || forecast[0];

            const feelsLike = hourData.feelsLike;
            const comfort = hourData.comfort;

            const comfortColors = {
                cold: '#3b82f6',
                cool: '#60a5fa',
                mild: '#22c55e',
                warm: '#16a34a',
                hot: '#f97316',
                extreme: '#ef4444',
                unknown: '#9ca3af'
            };
            const bgColor = comfortColors[comfort.level] || comfortColors.unknown;

            const el = document.createElement('div');
            el.className = 'comfort-map-marker';
            el.innerHTML = `
                <div class="comfort-map-pill" style="background:${bgColor};">
                    <span class="comfort-map-temp">${feelsLike}°</span>
                    <span class="comfort-map-icon">${comfort.icon}</span>
                </div>
                <div class="comfort-map-label">${venue.venueName.length > 14 ? venue.venueName.slice(0, 13) + '…' : venue.venueName}</div>
            `;

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const popups = document.getElementsByClassName('mapboxgl-popup');
                for (let p of popups) p.remove();
                onVenueSelect(venue);
            });

            const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat([venue.lng, venue.lat])
                .addTo(map.current);

            comfortEls.current.push(marker);
        });
    }, [comfortMode, comfortHour, weather, onVenueSelect]);

    useEffect(() => {
        updateComfortOverlay();
    }, [updateComfortOverlay]);

    const fmtHour = (h) => {
        if (h === 0 || h === 24) return '12am';
        if (h === 12) return '12pm';
        return h > 12 ? `${h - 12}pm` : `${h}am`;
    };

    return (
        <div className={`ss-mapview-root ${(isTokenMissing || mapError) ? 'ssr-map-fallback-active' : ''}`}>
            <div ref={mapContainer} className="ss-mapview-canvas bg-slate-100" />

            {/* UV Index Layer */}
            {uvMode && (
                <div className={`uv-map-overlay ${uvIndex <= 2 ? 'uv-overlay-low' :
                    uvIndex <= 5 ? 'uv-overlay-moderate' :
                        uvIndex <= 7 ? 'uv-overlay-high' :
                            uvIndex <= 10 ? 'uv-overlay-veryhigh' : 'uv-overlay-extreme'
                    }`} />
            )}

            {radarMode && (
                <div className="radar-map-overlay">
                    <div className="radar-storm-cell cell-1" />
                    <div className="radar-storm-cell cell-2" />
                    <div className="radar-storm-cell cell-3" />
                </div>
            )}

            {/* Comfort Map Toggle & Time Slider */}
            {mapLoaded && !mapError && (
                <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
                    <button
                        onClick={() => setComfortMode(!comfortMode)}
                        className={`comfort-toggle-btn ${comfortMode ? 'comfort-toggle-active' : ''}`}
                        id="comfort-map-toggle"
                    >
                        <span>{comfortMode ? '🌡️' : '🗺️'}</span>
                        <span>{comfortMode ? 'Comfort Map' : 'Show Comfort'}</span>
                    </button>

                    <button
                        onClick={() => setUvMode(!uvMode)}
                        className={`comfort-toggle-btn ${uvMode ? 'comfort-toggle-active' : ''}`}
                        id="uv-map-toggle"
                    >
                        <span>{uvMode ? '🧴' : '☀️'}</span>
                        <span>{uvMode ? 'UV Active' : 'Show UV'}</span>
                    </button>

                    <button
                        onClick={() => setRadarMode(!radarMode)}
                        className={`comfort-toggle-btn ${radarMode ? 'comfort-toggle-active' : ''}`}
                        id="radar-map-toggle"
                    >
                        <span>{radarMode ? '🌧️' : '⛈️'}</span>
                        <span>{radarMode ? 'Radar Active' : 'Rain Radar'}</span>
                    </button>

                    <AnimatePresence>
                        {radarMode && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="radar-legend-card"
                            >
                                <div className="radar-legend-title">Rain Intensity</div>
                                <div className="radar-legend-label">
                                    <span>Light</span>
                                    <span>Storm</span>
                                </div>
                                <div className="radar-legend-scale">
                                    <div className="radar-step-light" />
                                    <div className="radar-step-mod" />
                                    <div className="radar-step-heavy" />
                                    <div className="radar-step-storm" />
                                </div>
                                <div className="text-[9px] text-gray-400 mt-1 font-medium">BOM Style Radar • Moving North-East</div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {uvMode && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="uv-legend-card"
                            >
                                <div className="uv-legend-title">UV Index Scale</div>
                                <div className="uv-legend-label">
                                    <span>Low</span>
                                    <span>Extreme</span>
                                </div>
                                <div className="uv-legend-scale">
                                    <div className="uv-scale-step uv-step-low" />
                                    <div className="uv-scale-step uv-step-mod" />
                                    <div className="uv-scale-step uv-step-high" />
                                    <div className="uv-scale-step uv-step-vh" />
                                    <div className="uv-scale-step uv-step-ext" />
                                </div>
                                <div className="text-[9px] text-gray-400 mt-1 font-medium">Real-time OpenWeather data</div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {comfortMode && (
                            <motion.div
                                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                className="comfort-time-slider"
                            >
                                <div className="comfort-slider-header">
                                    <span className="comfort-slider-label">Time: {fmtHour(comfortHour)}</span>
                                    <span className="comfort-slider-hint">Drag to explore</span>
                                </div>
                                <input
                                    type="range"
                                    min="6"
                                    max="23"
                                    value={comfortHour}
                                    onChange={(e) => setComfortHour(parseInt(e.target.value))}
                                    className="comfort-slider-input"
                                    id="comfort-hour-slider"
                                />
                                <div className="comfort-slider-times">
                                    <span>6am</span>
                                    <span>12pm</span>
                                    <span>6pm</span>
                                    <span>11pm</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            <AnimatePresence>
                {isUpdating && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="ss-updating-spinner"
                    >
                        <div className="ss-spinner-dots">
                            <div className="ss-spinner-dot" />
                            <div className="ss-spinner-dot" />
                            <div className="ss-spinner-dot" />
                        </div>
                        <span className="text-xs font-black text-gray-700 uppercase tracking-widest">Updating venues...</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bottom caption */}
            {mapLoaded && !mapError && (
                <div className="ss-map-caption">
                    <div className="ss-map-caption-inner">
                        {comfortMode
                            ? `🌡️ Feels-like temperature at ${fmtHour(comfortHour)}`
                            : '📍 Tap a pin to see venue details'
                        }
                    </div>
                </div>
            )}

            {/* Overlay for Loading, Error, or Missing Token */}
            {showOverlay && (
                <div className="ss-map-overlay-error bg-orange-50/80 backdrop-blur-sm">
                    {/* High-Fidelity Fallback UI: Sun Intelligence Heatmap */}
                    {(isTokenMissing || mapError) ? (
                        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                            {/* Heatmap Background - High quality aerial */}
                            <img
                                src="https://images.unsplash.com/photo-1549443542-99086fd59379?auto=format&fit=crop&q=80&w=2000"
                                alt="Melbourne Aerial View"
                                className="absolute inset-0 w-full h-full object-cover opacity-15 mix-blend-multiply grayscale-[20%]"
                                onError={(e) => {
                                    e.target.src = 'https://images.unsplash.com/photo-1518173946687-a4c8a9833d8e?auto=format&fit=crop&q=80&w=2000';
                                }}
                            />

                            {/* Map UI Shield / Pattern - Warm Sunny Gradients */}
                            <div className="absolute inset-0 bg-gradient-to-br from-amber-200/30 via-transparent to-amber-100/20" />
                            <div className="absolute inset-0 pointer-events-none opacity-50" style={{ backgroundImage: 'radial-gradient(rgb(245, 158, 11) 0.6px, transparent 0.6px)', backgroundSize: '30px 30px' }} />

                            {/* Fallback Search/Marker Layer (Interactive) */}
                            <div className="relative z-10 w-full h-full">
                                {demoVenues.map((venue) => {
                                    const isFiltered = filteredVenueIds === null || filteredVenueIds.includes(venue.id);
                                    if (!isFiltered) return null;

                                    {/* Manual projection for Melbourne CBD focused heatmap */ }
                                    const left = ((venue.lng - INITIAL_VIEW_STATE.longitude + 0.1) / 0.2) * 100;
                                    const top = ((-venue.lat + INITIAL_VIEW_STATE.latitude + 0.08) / 0.16) * 100;

                                    return (
                                        <motion.div
                                            key={venue.id}
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className="absolute cursor-pointer transform -translate-x-1/2 -translate-y-1/2 group"
                                            style={{ left: `${left}%`, top: `${top}%` }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onVenueSelect(venue);
                                            }}
                                        >
                                            <div className={`ss-marker-pill ss-marker-${weather && weatherColorFn ? weatherColorFn(weather, venue) : 'sunny'} shadow-xl border-2 border-white/30 ${(cozyMode && (venue.tags || []).some(t => ['Fireplace', 'Heaters', 'Indoor Warmth'].includes(t))) ? 'ss-marker-cozy-glow' : ''}`}>
                                                <span className="ss-marker-emoji">{venue.emoji}</span>
                                            </div>
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-black/80 text-white text-[10px] px-2 py-1 rounded-full pointer-events-none">
                                                {venue.venueName}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>

                            {/* Bottom Fallback Info Chip */}
                            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20">
                                <motion.div
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 flex items-center gap-2"
                                >
                                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">Demo Mode: Sun Intelligence Static Overlay</span>
                                </motion.div>
                            </div>

                            {/* Token Missing Warning Banner (Discreet) */}
                            {!mapLoaded && (isTokenMissing || mapError) && (
                                <div className="absolute top-6 right-6 z-20">
                                    <button
                                        onClick={() => setMapError(false)}
                                        className="bg-amber-400/20 hover:bg-amber-400/40 text-amber-200 text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm border border-amber-400/20 transition-all"
                                    >
                                        Map Setup Info
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="animate-spin-slow text-6xl mb-4">☀️</div>
                            <p className="text-gray-400 font-semibold italic">Waking up the map...</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

MapView.displayName = 'MapView';

export default MapView;
