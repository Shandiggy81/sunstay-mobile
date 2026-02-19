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

const MapView = forwardRef(({ onVenueSelect, selectedVenue, filteredVenueIds, mapRef, weatherColorFn }, ref) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const markers = useRef([]);
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

    // Expose flyTo method to parent via ref
    useImperativeHandle(mapRef, () => ({
        flyTo: (options) => {
            if (map.current) {
                map.current.flyTo(options);
            }
        }
    }));

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
                console.warn('Map loading timed out after 12 seconds.');
                setMapError(true);
            }
        }, 12000);

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
                addDemoVenueMarkers();
            });

            map.current.on('error', (e) => {
                console.error('Mapbox error:', e.error);
                const errMsg = e.error?.message || e.error?.toString() || '';
                if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('access token') || errMsg.includes('Not Authorized')) {
                    clearTimeout(loadTimeout);
                    setMapError(true);
                }
            });

            // Compact navigation controls
            map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
        } catch (error) {
            console.error('Error initializing map:', error);
            clearTimeout(loadTimeout);
            setMapError(true);
        }

        return () => {
            clearTimeout(loadTimeout);
            markers.current.forEach(m => m.marker.remove());
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

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

    // Update marker visibility when filter changes
    useEffect(() => {
        setIsUpdating(true);

        const timer = setTimeout(() => {
            markers.current.forEach((markerObj, index) => {
                const { marker, venueId } = markerObj;
                const element = marker.getElement();

                // Stagger transition
                const staggerDelay = (index % 10) * 40; // max 400ms delay

                setTimeout(() => {
                    if (filteredVenueIds === null) {
                        element.style.opacity = '1';
                        element.style.transform = 'scale(1)';
                    } else if (filteredVenueIds.includes(venueId)) {
                        element.style.opacity = '1';
                        element.style.transform = 'scale(1.1)';
                    } else {
                        element.style.opacity = '0.15';
                        element.style.transform = 'scale(0.85)';
                    }
                }, staggerDelay);
            });
            setIsUpdating(false);
        }, 150); // Initial delay to show spinner

        return () => clearTimeout(timer);
    }, [filteredVenueIds]);

    // Update marker colors when weather changes
    useEffect(() => {
        if (!weather || !weatherColorFn) return;
        markers.current.forEach(({ marker, venue }) => {
            const el = marker.getElement();
            const pill = el.querySelector('.ss-marker-pill');
            if (!pill) return;
            const color = weatherColorFn(weather, venue);
            pill.className = `ss-marker-pill ss-marker-${color}`;
        });
    }, [weather, weatherColorFn]);

    const addDemoVenueMarkers = () => {
        demoVenues.forEach((venue) => {
            // Get weather color class
            const colorClass = weather && weatherColorFn
                ? `ss-marker-${weatherColorFn(weather, venue)}`
                : 'ss-marker-sunny';

            // Create custom marker element
            const el = document.createElement('div');
            el.className = 'ss-map-marker';
            el.innerHTML = `
                <div class="ss-marker-pill ${colorClass}">
                    <span class="ss-marker-emoji">${venue.emoji}</span>
                </div>
            `;

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                // Prevent any default popups from showing
                const popups = document.getElementsByClassName('mapboxgl-popup');
                for (let p of popups) p.remove();

                onVenueSelect(venue);
            });

            const marker = new mapboxgl.Marker(el)
                .setLngLat([venue.lng, venue.lat])
                .addTo(map.current);

            markers.current.push({ marker, venueId: venue.id, venue });
        });
    };

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
                cold: '#3b82f6', cool: '#60a5fa', mild: '#22c55e',
                warm: '#16a34a', hot: '#f97316', extreme: '#ef4444', unknown: '#9ca3af',
            };
            const bgColor = comfortColors[comfort.level] || '#9ca3af';

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

    // Toggle standard markers visibility based on comfort mode
    useEffect(() => {
        markers.current.forEach(({ marker }) => {
            const el = marker.getElement();
            el.style.display = comfortMode ? 'none' : 'block';
        });
    }, [comfortMode]);

    const isTokenMissing = !MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith('pk.');
    const showOverlay = !mapLoaded || mapError;

    const fmtHour = (h) => {
        if (h === 0 || h === 24) return '12am';
        if (h === 12) return '12pm';
        return h > 12 ? `${h - 12}pm` : `${h}am`;
    };

    return (
        <div className="ss-mapview-root">
            <div ref={mapContainer} className="ss-mapview-canvas" />

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
                <div className="ss-map-overlay-error">
                    <div className="max-w-md p-8 text-center">
                        {(isTokenMissing || mapError) ? (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-4"
                            >
                                <div className="text-5xl mb-4">{mapError && !isTokenMissing ? '⚠️' : '🗺️'}</div>
                                <h3 className="text-xl font-bold text-gray-800">
                                    {mapError && !isTokenMissing ? 'Map Failed to Load' : 'Mapbox Setup Required'}
                                </h3>
                                <p className="text-sm text-gray-600">
                                    {mapError && !isTokenMissing
                                        ? 'Your Mapbox token may be expired or invalid. Please update it in your .env file.'
                                        : 'To see the live venue map, please add your Mapbox token to the .env file in the project root.'
                                    }
                                </p>
                                <div className="bg-amber-50 p-4 rounded-xl text-left border border-amber-100">
                                    <p className="text-xs font-bold text-amber-800 mb-2 uppercase tracking-wider">Quick Instructions:</p>
                                    <ol className="text-xs text-amber-700 space-y-1.5 list-decimal pl-4">
                                        <li>Go to <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener noreferrer" className="underline font-bold">mapbox.com/access-tokens</a></li>
                                        <li>Copy your <b>Default public token</b> (starts with <code className="font-mono">pk.</code>)</li>
                                        <li>Open <code className="font-mono">.env</code> in the project root</li>
                                        <li>Set <code className="font-mono">VITE_MAPBOX_TOKEN=pk.your_token_here</code></li>
                                        <li>Restart the dev server (<code className="font-mono">npm run dev</code>)</li>
                                    </ol>
                                </div>
                                {mapError && !isTokenMissing && (
                                    <button
                                        onClick={() => window.location.reload()}
                                        className="mt-2 px-5 py-2.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all text-sm"
                                    >
                                        🔄 Reload App
                                    </button>
                                )}
                                <p className="text-[10px] text-gray-400 italic">
                                    Tip: You can find detailed steps in <code className="font-mono">API_SETUP.md</code>
                                </p>
                            </motion.div>
                        ) : (
                            <div className="space-y-4">
                                <div className="animate-spin-slow text-6xl mb-4">☀️</div>
                                <p className="text-gray-600 font-semibold italic">Waking up the map...</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

MapView.displayName = 'MapView';

export default MapView;
