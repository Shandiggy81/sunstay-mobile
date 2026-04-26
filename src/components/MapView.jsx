import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import FiltersSheet from './FiltersSheet';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAP_STYLE, INITIAL_VIEW_STATE, MAX_BOUNDS } from '../config/mapConfig';
import { demoVenues } from '../data/demoVenues';
import { venues as realVenues } from '../data/venues';
import { motion, AnimatePresence } from 'framer-motion';
import { useWeather } from '../context/WeatherContext';
import {
    generateHourlyForecast,
} from '../data/windIntelligence';
import { getSunPositionForMap, toMapboxSkyValues, getMapboxLightPreset } from '../util/sunPosition';
import SunCalc from 'suncalc';

// ── Build a venue lookup for click handlers ──────────────────────
const venueById = Object.fromEntries(demoVenues.map(v => [v.id, v]));

// venue pin emoji logic moved inside MapView for prop access

// ── Convert venues to GeoJSON FeatureCollection ──────────────────
function buildGeoJSON(venues, weatherData) {
    return {
        type: 'FeatureCollection',
        features: venues.map(v => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
            properties: {
                id: v.id,
                // Emoji is derived dynamically at render time in updateDOMMarkers
                name: v.venueName,
                venueName: v.venueName,
            }
        }))
    };
}

const MapView = forwardRef(({ onVenueSelect, selectedVenue, filteredVenueIds, liveVenueFeatures, mapRef, weatherColorFn, cozyWeatherActive, cozyFilterActive, isExpanded }, ref) => {
    // ── Dynamic venue emoji logic: Dashboard-reactive ─────────
    const getVenuePinEmoji = useCallback((venue) => {
        const liveState = liveVenueFeatures?.[venue.id] || {};
        
        // Dashboard overrides: if heaters, fireplace, or roof closed are active -> FIRE!
        if (liveState.hasFireplace || liveState.hasHeaters || liveState.fireplaceOn || liveState.heatersOn || liveState.roofClosed) {
            return '🔥';
        }

        // Current temperature fallback if not provided
        const currentTemp = venue.currentTemp ?? 20;

        // Default Fire pin (static data): venue has fireplace or heated outdoor AND current temp is under 18°C
        if ((venue.heating === 'fireplace' || venue.heating === 'heated outdoor') && currentTemp < 18) {
            return '🔥';
        }

        // Weather-driven: use current weather condition for the venue
        const condition = (venue.weatherCondition || venue.condition || '').toLowerCase();
        
        if (condition.includes('cloud') || condition.includes('overcast')) {
            return '⛅';
        }
        if (condition.includes('rain')) {
            return '🌧️';
        }
        
        // Default: sunny
        return '☀️';
    }, [liveVenueFeatures]);
    const mapContainer = useRef(null);
    const map = useRef(null);
    const markersRef = useRef([]);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState({ vibe: [], sun: [], features: [] });
    
    const venues = useMemo(() => {
        return demoVenues.map(dv => {
            const match = realVenues.find(rv => 
                (dv.venueName || '').toLowerCase().includes((rv.name || '').toLowerCase())
            );
            return match && match.happyHour ? { ...dv, happyHour: match.happyHour } : dv;
        });
    }, []);

    const toggleFilter = (section, value) => {
      setActiveFilters(prev => {
        const current = prev[section] || [];
        const exists = current.includes(value);
        const next = exists ? current.filter(v => v !== value) : [...current, value];
        return { ...prev, [section]: next };
      });
    };

    const clearAllFilters = () => {
      setActiveFilters({ vibe: [], sun: [], features: [] });
    };

    const filteredVenues = useMemo(() => {
      if (!venues) return [];
      return venues.filter((venue) => {
        const tags = venue.tags || venue.vibes || venue.features || [];
        const { vibe = [], sun = [], features = [] } = activeFilters || {};
        const noFilters = !vibe.length && !sun.length && !features.length;
        if (noFilters) return true;
        return (
          (!vibe.length || vibe.some(v => tags.includes(v))) &&
          (!sun.length || sun.some(v => tags.includes(v))) &&
          (!features.length || features.some(v => tags.includes(v)))
        );
      });
    }, [venues, activeFilters]);

    const comfortEls = useRef([]);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(false);
    const [activeLayer, setActiveLayer] = useState(null);
    const [comfortHour, setComfortHour] = useState(new Date().getHours());
    const comfortMode = activeLayer === 'comfort';
    const uvMode = activeLayer === 'uv';
    const radarMode = activeLayer === 'radar';
    const toggleLayer = (layer) => setActiveLayer(prev => prev === layer ? null : layer);
    const [isUpdating, setIsUpdating] = useState(false);
    const onVenueSelectRef = useRef(onVenueSelect);
    useEffect(() => { onVenueSelectRef.current = onVenueSelect; }, [onVenueSelect]);
    const isMobileViewport = () => window.innerWidth < 768;
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

    // ── Callbacks and Memoized Functions (Must be defined before use in effects) ────

    // ── Safe Resize helper ──────────────────────────────────────────
    const safeResize = useCallback(() => {
        if (!map.current || !mapContainer.current) return;
        const { clientWidth, clientHeight } = mapContainer.current;
        if (clientWidth === 0 || clientHeight === 0) return;
        map.current.resize();
    }, []);

    const [selectedMarkerId, setSelectedMarkerId] = useState(null);

    // ── Cluster-Aware HTML Marker Sync ───────────────────────────
    const updateDOMMarkers = useCallback(() => {
        if (!map.current || !mapLoaded) return;

        // 1. Get IDs of features that are currently unclustered in the viewport
        const features = map.current.queryRenderedFeatures({ layers: ['unclustered-point'] });
        const currentFeatureIds = new Set(features.map(f => f.properties.id));

        // 2. Remove markers that are no longer unclustered or are off-screen
        markersRef.current = markersRef.current.filter(m => {
            if (!currentFeatureIds.has(m._venueId)) {
                m.remove();
                return false;
            }
            return true;
        });

        // 3. Add markers for new unclustered features
        const existingIds = new Set(markersRef.current.map(m => m._venueId));
        
        features.forEach((feature) => {
            const venueId = feature.properties.id;
            if (existingIds.has(venueId)) return;

            const venue = demoVenues.find(v => v.id === venueId);
            if (!venue) return;

            const el = document.createElement('div');
            const emoji = getVenuePinEmoji(venue);
            const isSelected = venue.id === selectedVenue?.id;
            const isCozy = cozyWeatherActive && (
                venue.tags?.includes('Fireplace') ||
                venue.tags?.includes('Heaters') ||
                venue.heating
            );
            el.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                width: ${isSelected ? '48px' : '38px'};
                height: ${isSelected ? '48px' : '38px'};
                border-radius: 50%;
                background: ${isSelected ? '#fff' : 'rgba(255,255,255,0.95)'};
                box-shadow: ${isSelected
                    ? '0 4px 20px rgba(0,0,0,0.22), 0 0 0 3px #F59E0B'
                    : isCozy
                        ? '0 2px 12px rgba(0,0,0,0.14), 0 0 0 2px rgba(251,146,60,0.6)'
                        : '0 2px 8px rgba(0,0,0,0.12), 0 0 0 1.5px rgba(0,0,0,0.06)'};
                font-size: ${isSelected ? '22px' : '18px'};
                cursor: pointer;
                transition: all 0.18s ease;
                transform: ${isSelected ? 'translateY(-4px) scale(1.08)' : 'translateY(0) scale(1)'};
                will-change: transform;
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
            `;
            el.textContent = emoji;

            let startTouches = 0;
            el.addEventListener('touchstart', (e) => { startTouches = e.touches.length; });
            el.addEventListener('click', () => {
              if (startTouches > 1) return;
              onVenueSelectRef.current?.(venue, isMobileViewport());
              // Use direct venue object to avoid stale state/null crash during async update
              if (map.current) {
                map.current.flyTo({
                  center: [venue.lng, venue.lat],
                  zoom: 15,
                  duration: 1200,
                  essential: true
                });
              }
            });

            const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat([venue.lng, venue.lat])
                .addTo(map.current);

            marker._venueId = venueId;
            marker._element = el; // Store element for easy updates
            markersRef.current.push(marker);
        });

        // 4. Update styles of existing markers to reflect current selection/cozy state
        markersRef.current.forEach(marker => {
            const venue = demoVenues.find(v => v.id === marker._venueId);
            if (!venue || !marker._element) return;

            const isSelected = venue.id === selectedVenue?.id;
            const isCozy = cozyWeatherActive && (
                venue.tags?.includes('Fireplace') ||
                venue.tags?.includes('Heaters') ||
                venue.heating
            );

            // Only update if properties changed to minimize DOM thrashing
            marker._element.style.width = isSelected ? '48px' : '38px';
            marker._element.style.height = isSelected ? '48px' : '38px';
            marker._element.style.background = isSelected ? '#fff' : 'rgba(255,255,255,0.95)';
            marker._element.style.boxShadow = isSelected
                ? '0 4px 20px rgba(0,0,0,0.22), 0 0 0 3px #F59E0B'
                : isCozy
                    ? '0 2px 12px rgba(0,0,0,0.14), 0 0 0 2px rgba(251,146,60,0.6)'
                    : '0 2px 8px rgba(0,0,0,0.12), 0 0 0 1.5px rgba(0,0,0,0.06)';
            marker._element.style.fontSize = isSelected ? '22px' : '18px';
            marker._element.style.transform = isSelected ? 'translateY(-4px) scale(1.08)' : 'translateY(0) scale(1)';
        });
    }, [mapLoaded, selectedVenue, cozyWeatherActive, liveVenueFeatures, getVenuePinEmoji]);

    // ── Setup GeoJSON cluster source + layers ──────────────────────
    const setupClusterSource = useCallback(() => {
        if (!map.current) return;

        const weatherData = {
            min_temp: weather?.rawWeather?.minTemp,
            weatherCode: weather?.rawWeather?.weatherCode,
            cloud_cover: weather?.clouds?.all
        };

        const geojson = buildGeoJSON(filteredVenues, weatherData);

        // Add GeoJSON source with clustering
        map.current.addSource('venues', {
            type: 'geojson',
            data: geojson,
            cluster: true,
            clusterRadius: 50,
            clusterMaxZoom: 14, // Zoom level where clustering stops
        });

        // ── Clusters circle layer ──────────────────────────────
        map.current.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'venues',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': [
                    'step',
                    ['get', 'point_count'],
                    '#FBBF24',   // amber — small clusters
                    10, '#F97316', // orange — medium clusters
                    30, '#EF4444'  // red — large clusters
                ],
                'circle-radius': [
                    'step',
                    ['get', 'point_count'],
                    18,
                    10, 26,
                    30, 34
                ],
                'circle-stroke-width': 3,
                'circle-stroke-color': 'rgba(255,255,255,0.9)',
                'circle-opacity': 0.92,
                'circle-blur': 0,
            }
        });

        // ── CLUSTER NUMBERS fix ────────────────────────────────
        map.current.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'venues',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                'text-size': 14,
            },
            paint: { 'text-color': '#ffffff' }
        });

        // ── Unclustered points layer (for hit testing and sync) ──
        map.current.addLayer({
            id: 'unclustered-point',
            type: 'circle',
            source: 'venues',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-radius': 0, // Keep invisible, markers handle visuals
                'circle-opacity': 0
            }
        });

        // ── Unclustered points (Emoji Pins) moved to useEffect for performance ──

        // ── Click on cluster → zoom in ───────────────────────────
        map.current.on('click', 'clusters', (e) => {
            if (!map.current || !map.current.isSourceLoaded('venues')) return;
            const features = map.current.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            if (!features.length) return;
            const clusterId = features[0].properties.cluster_id;
            map.current.getSource('venues').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err || !map.current || !map.current.isSourceLoaded('venues')) return;
                map.current.easeTo({
                    center: features[0].geometry.coordinates,
                    zoom: zoom,
                    duration: 500,
                });
            });
        });

        // ── Click on individual pin → open card ────────────────────
        map.current.on('click', 'unclustered-point', (e) => {
            if (!map.current || !map.current.isSourceLoaded('venues')) return;
            const features = map.current.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] });
            if (!features.length) return;
            const venueId = features[0].properties.id;
            const fullVenue = demoVenues.find(v => v.id === venueId);
            if (fullVenue) {
                onVenueSelect(fullVenue);
                // Use local object immediately to avoid stale state ReferenceError
                map.current.flyTo({
                    center: [fullVenue.lng, fullVenue.lat],
                    zoom: 15,
                    duration: 1200,
                    essential: true
                });
            }
        });

        // ── Hover effects ──────────────────────────────────────────
        map.current.on('mouseenter', 'clusters', () => {
            if (!map.current || !map.current.isSourceLoaded('venues')) return;
            map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'clusters', () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
        });

        map.current.on('mouseenter', 'unclustered-point', () => {
            if (!map.current || !map.current.isSourceLoaded('venues')) return;
            map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'unclustered-point', () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
        });
        
        // Initial marker draw via sync event
        map.current.on('moveend', () => updateDOMMarkers());

        // Background click listener to deselect venue
        map.current.on('click', (e) => {
            if (!map.current) return;
            const features = map.current.queryRenderedFeatures(e.point, {
                layers: ['clusters', 'unclustered-point']
            });
            if (!features.length) {
                onVenueSelectRef.current?.(null);
            }
        });
    }, [onVenueSelect, updateDOMMarkers]);

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

    // ── Custom Layer Markers ─────────────────────────────────
    const updateLayerMarkers = useCallback(() => {
        comfortEls.current.forEach(m => m.remove());
        comfortEls.current = [];

        if (!activeLayer || !weather || !map.current) return;

        const temp = weather.main?.temp || 0;

        const windSpeed = weather.wind?.speed || 0;
        const humidity = weather.main?.humidity || 50;

        filteredVenues.forEach((venue) => {
            const el = document.createElement('div');
            el.className = 'layer-map-marker';
            el.style.pointerEvents = 'none';

            if (activeLayer === 'comfort') {
                const forecast = generateHourlyForecast(temp, windSpeed, humidity, venue);
                const currentH = new Date().getHours();
                const offset = (comfortHour - currentH + 24) % 24;
                const hourData = forecast[offset] || forecast[0];
                const comfortColors = { cold: '#3b82f6', cool: '#60a5fa', mild: '#22c55e', warm: '#16a34a', hot: '#f97316', extreme: '#ef4444', unknown: '#9ca3af' };
                const bgColor = comfortColors[hourData.comfort.level] || comfortColors.unknown;

                el.innerHTML = `
                    <div class="comfort-map-pill" style="background:${bgColor}; pointer-events: none;">
                        <span class="comfort-map-temp" style="pointer-events: none;">${hourData.feelsLike}°</span>
                        <span class="comfort-map-icon" style="pointer-events: none;">${hourData.comfort.icon}</span>
                    </div>
                `;
            } else if (activeLayer === 'uv') {
                const uvColor = uvIndex <= 2 ? '#22c55e' : uvIndex <= 5 ? '#eab308' : uvIndex <= 7 ? '#f9731e' : uvIndex <= 10 ? '#ef4444' : '#a855f7';
                const modifiedUv = Math.max(0, uvIndex + (venue.tags?.includes('Rooftop') ? 1 : 0) - (venue.tags?.includes('Indoor Warmth') ? 5 : 0));
                
                el.innerHTML = `
                    <div class="uv-map-pill" style="background:${uvColor}; pointer-events: none;">
                        <span class="uv-map-num" style="pointer-events: none;">UV ${modifiedUv.toFixed(1)}</span>
                    </div>
                `;
            } else if (activeLayer === 'radar') {
                return; // Do not render map markers for radar, rely on the RainViewer overlay tiles natively.
            }

            const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat([venue.lng, venue.lat])
                .addTo(map.current);

            comfortEls.current.push(marker);
        });
    }, [activeLayer, comfortHour, weather, uvIndex, onVenueSelect]);

    // ── Effects ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (map.current) {
            // Safety: If the ref exists but the DOM container changed (e.g., during HMR), re-initialize
            if (mapContainer.current && map.current.getContainer() !== mapContainer.current) {
                map.current.remove();
                map.current = null;
            } else {
                return;
            }
        }

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
                minZoom: 0,
                maxZoom: 22,
                maxBounds: MAX_BOUNDS,
                padding: { top: 60, bottom: 120, left: 16, right: 16 },
            });

            map.current.on('load', () => {
                clearTimeout(loadTimeout);
                setMapLoaded(true);
                setMapError(false);
                
                // Add 3D buildings before clusters
                if (!map.current.getLayer('3d-buildings')) {
                  map.current.addLayer({
                    id: '3d-buildings',
                    source: 'composite',
                    'source-layer': 'building',
                    filter: ['==', 'extrude', 'true'],
                    type: 'fill-extrusion',
                    minzoom: 14,
                    paint: {
                      'fill-extrusion-color': '#e8ddd0',
                      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'],
                        14, 0, 14.05, ['to-number', ['get', 'height'], 0]],
                      'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'],
                        14, 0, 14.05, ['to-number', ['get', 'min_height'], 0]],
                      'fill-extrusion-opacity': 0.85
                    }
                  });
                }

                setupClusterSource();
                applySunSkyLayer();
                map.current.setFog({
                    'color': 'rgb(246, 245, 243)',
                    'high-color': 'rgb(200, 210, 220)',
                    'horizon-blend': 0.04,
                    'space-color': 'rgb(180, 195, 210)',
                    'star-intensity': 0.1,
                });

                // Real-time sun position via SunCalc
                const updateSunLight = () => {
                  if (!map.current) return;
                  const now = new Date();
                  const sun = SunCalc.getPosition(now, INITIAL_VIEW_STATE.latitude, INITIAL_VIEW_STATE.longitude);
                  const azimuthDeg = (sun.azimuth * 180 / Math.PI) + 180;
                  const altitudeDeg = Math.max(0, sun.altitude * 180 / Math.PI);

                  map.current.setLight({
                    anchor: 'map',
                    color: altitudeDeg < 15 ? '#ffaa44' : '#fff8e7', // warm at golden hour
                    intensity: Math.max(0, Math.min(0.8, (altitudeDeg || 0) / 60 + 0.2)),
                    position: [1.5, azimuthDeg || 180, altitudeDeg || 0]
                  });
                };

                updateSunLight();
                map.current._sunLightInterval = setInterval(updateSunLight, 60000); // update every minute

                // Ensure map.resize() on load
                map.current.resize();

                // Fix: Pins vanish on zoom
                map.current.on('zoomend', () => {
                    if (map.current) map.current.resize();
                });
                map.current.on('moveend', () => {
                    // Marker resize if needed, though layer handles most visibility
                    if (map.current) map.current.resize();
                });
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
            if (map.current?._sunLightInterval) {
                clearInterval(map.current._sunLightInterval);
            }
            markersRef.current.forEach(m => m.remove());
            comfortEls.current.forEach(m => m.remove());
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);








    // ── Safe Resize helper ──────────────────────────────────────────


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

    // Fly to venue when selected from external sources (Search, Recenter, etc.)
    useEffect(() => {
        // If the map isn't currently moving to this venue, trigger a flyTo
        // This handles selection from outside the MapView (like the Sidebar or Search)
        if (selectedVenue && map.current) {
            const center = map.current.getCenter();
            const isAtVenue = Math.abs(center.lng - selectedVenue.lng) < 0.0001 && 
                             Math.abs(center.lat - selectedVenue.lat) < 0.0001;
            
            if (!isAtVenue) {
                map.current.flyTo({
                    center: [selectedVenue.lng, selectedVenue.lat],
                    zoom: 15,
                    duration: 1200,
                    essential: true,
                });
            }
        }
    }, [selectedVenue]);

    // ── Update GeoJSON source when filter changes ─────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const source = map.current.getSource('venues');
        if (!source) return;

        setIsUpdating(true);

        const weatherData = {
            min_temp: weather?.rawWeather?.minTemp,
            weatherCode: weather?.rawWeather?.weatherCode,
            cloud_cover: weather?.clouds?.all
        };

        source.setData(buildGeoJSON(filteredVenues, weatherData));

        setTimeout(() => setIsUpdating(false), 200);
    }, [filteredVenueIds, mapLoaded, weather]);


    // ── Efficient Marker Management ─────────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // Perform initial sync
        if (map.current && map.current.isSourceLoaded('venues')) {
            updateDOMMarkers();
        }

        // Attach listeners for dynamic updates
        const mapInstance = map.current;
        const handleSync = () => updateDOMMarkers();
        const handleSourceData = (e) => {
            if (e.sourceId === 'venues' && e.isSourceLoaded) {
                updateDOMMarkers();
            }
        };

        mapInstance.on('moveend', handleSync);
        mapInstance.on('zoomend', handleSync);
        mapInstance.on('sourcedata', handleSourceData);

        return () => {
            mapInstance.off('moveend', handleSync);
            mapInstance.off('zoomend', handleSync);
            mapInstance.off('sourcedata', handleSourceData);
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];
        };
    }, [mapLoaded, updateDOMMarkers]);

    useEffect(() => {
        // Re-calculate emojis if cozy filters change, without recreating all markers
        // This is a lightweight update
        if (map.current) {
            // Force re-render of marker content if needed, or we could just let the above useEffect handle it if we add dependencies
        }
    }, [cozyFilterActive, cozyWeatherActive]);

    // ── Interaction sync (simplified) ──────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const resizeMap = () => {
            if (map.current) map.current.resize();
        };
        map.current.on('idle', resizeMap);
        return () => {
            map.current?.off('idle', resizeMap);
        };
    }, [mapLoaded]);

    // ── RainViewer Radar Sync ──────────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        if (activeLayer === 'radar') {
            fetch(`https://api.rainviewer.com/public/weather-maps.json?_c=${Date.now()}`)
                .then(res => res.json())
                .then(data => {
                    if (!map.current) return;
                    const past = data.radar.past;
                    const pastItem = past[past.length - 1];
                    const path = pastItem.path; // e.g. "/v2/radar/1691234560/256"
                    const time = pastItem.time;
                    const sourceId = 'rainviewer-source';
                    const layerId = 'rainviewer-layer';
                    
                    if (map.current.getSource(sourceId)) {
                        map.current.removeLayer(layerId);
                        map.current.removeSource(sourceId);
                    }
                    
                    map.current.addSource(sourceId, {
                        type: 'raster',
                        tiles: [`https://tilecache.rainviewer.com${path}/{z}/{x}/{y}/2/1_1.png?time=${time}`],
                        tileSize: 256,
                        minzoom: 0,
                        maxzoom: 6
                    });
                    
                    map.current.addLayer({
                        id: layerId,
                        type: 'raster',
                        source: sourceId,
                        paint: { 'raster-opacity': 0.6 }
                    });
                })
                .catch(err => console.error('RainViewer error:', err));
        } else {
            if (map.current.getLayer('rainviewer-layer')) {
               map.current.removeLayer('rainviewer-layer');
            }
            if (map.current.getSource('rainviewer-source')) {
               map.current.removeSource('rainviewer-source');
            }
        }
    }, [activeLayer, mapLoaded]);

    // ── Custom Layer Markers ─────────────────────────────────



    const fmtHour = (h) => {
        if (h === 0 || h === 24) return '12am';
        if (h === 12) return '12pm';
        return h > 12 ? `${h - 12}pm` : `${h}am`;
    };


    return (
        <div className={`ss-mapview-root ${(isTokenMissing || mapError) ? 'ssr-map-fallback-active' : ''}`}>
            <div ref={mapContainer} className="ss-mapview-canvas bg-slate-100" />

            {/* Comfort Green Tint */}
            {comfortMode && <div className="comfort-map-overlay" />}

            {/* UV Index Layer */}
            {uvMode && (
                <div className={`uv-map-overlay ${uvIndex <= 2 ? 'uv-overlay-low' :
                    uvIndex <= 5 ? 'uv-overlay-moderate' :
                        uvIndex <= 7 ? 'uv-overlay-high' :
                            uvIndex <= 10 ? 'uv-overlay-veryhigh' : 'uv-overlay-extreme'
                    }`} />
            )}



            {showControls && (
                <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-2">
                    {[
                        { key: 'comfort', icon: '🌡️', label: 'Comfort' },
                        { key: 'uv',      icon: '☀️', label: 'UV Index' },
                        { key: 'radar',   icon: '🌧️', label: 'Radar' },
                    ].map(({ key, icon, label }) => (
                        <button
                            key={key}
                            onClick={() => toggleLayer(key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold shadow-md transition-all backdrop-blur-sm border ${
                                activeLayer === key
                                    ? 'bg-gray-900 text-white border-gray-900 shadow-lg scale-105'
                                    : 'bg-white/90 text-gray-700 border-white/60 hover:bg-white'
                            }`}
                        >
                            <span className="text-[13px]">{icon}</span>
                            <span>{label}</span>
                        </button>
                    ))}
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
                <div className="absolute inset-0 z-[40] flex items-center justify-center">
                    {!mapLoaded && !mapError && !isTokenMissing ? (
                        <div className="absolute inset-0 bg-blue-50 animate-pulse flex flex-col items-center justify-center">
                            <div className="text-4xl mb-4">☀️</div>
                            <h2 className="text-xl font-bold text-blue-900">Loading Live Map...</h2>
                        </div>
                    ) : (
                        <div className="ss-map-overlay-error bg-orange-50/80 backdrop-blur-sm w-full h-full">
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
                                        {filteredVenues.map((venue) => {
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
                                                        // Direct flyTo for fallback UI interaction safety
                                                        if (map.current) {
                                                            map.current.flyTo({
                                                                center: [venue.lng, venue.lat],
                                                                zoom: 15,
                                                                duration: 1200,
                                                                essential: true
                                                            });
                                                        }
                                                    }}
                                                >
                                                    <div className={`ss-marker-pill ss-marker-${weather && weatherColorFn ? weatherColorFn(weather, venue) : 'sunny'} shadow-xl border-2 border-white/30 ${(venue.hasCozy && cozyWeatherActive && cozyFilterActive) ? 'ss-marker-cozy-glow' : ''}`}>
                                                        <span className="ss-marker-emoji">{getVenuePinEmoji({
                                                            ...venue,
                                                            weatherCondition: weather?.weather?.[0]?.main || '',
                                                            currentTemp: weather?.main?.temp ?? 20
                                                        })}</span>
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
                                <div className="space-y-4 flex flex-col items-center justify-center h-full">
                                    <div className="animate-spin-slow text-6xl mb-4">☀️</div>
                                    <p className="text-gray-400 font-semibold italic">Waking up the map...</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {/* Cozy Mode warm tint overlay */}
            {cozyFilterActive && (
                <div 
                    className="ss-cozy-overlay" 
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: 'rgba(255, 140, 0, 0.08)',
                        pointerEvents: 'none',
                        zIndex: 10,
                        mixBlendMode: 'overlay',
                        borderRadius: '24px'
                    }} 
                />
            )}
            {isFiltersOpen && (
              <FiltersSheet
                onClose={() => setIsFiltersOpen(false)}
                venueCount={filteredVenues.length}
                activeFilters={activeFilters}
                onToggleFilter={toggleFilter}
                onClearAll={clearAllFilters}
              />
            )}
        </div>
    );
});

MapView.displayName = 'MapView';

export default MapView;
