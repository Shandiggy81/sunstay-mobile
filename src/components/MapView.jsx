import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import FiltersSheet from './FiltersSheet';
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
import SunCalc from 'suncalc';

// ── Build a venue lookup for click handlers ──────────────────────
const venueById = Object.fromEntries(demoVenues.map(v => [v.id, v]));

// ── Dynamic venue emoji logic: Weather-driven rule only ─────────
const getVenuePinEmoji = (venue) => {
    // Current temperature fallback if not provided
    const currentTemp = venue.currentTemp ?? 20;

    // Fire pin: venue has fireplace or heated outdoor AND current temp is under 18°C
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
};

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

const MapView = forwardRef(({ onVenueSelect, selectedVenue, filteredVenueIds, mapRef, weatherColorFn, cozyWeatherActive, cozyFilterActive, isExpanded }, ref) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const markersRef = useRef([]);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState({ vibe: [], sun: [], features: [] });
    
    const venues = demoVenues;

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
        const { vibe, sun, features } = activeFilters;
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

    // ── Render venue markers directly from data (DEPRECATED for individual pins, kept for legacy if needed) ──
    const createAllMarkers = useCallback(() => {
        // Individual markers are now handled by Mapbox 'unclustered-point' layer for better performance and zoom stability.
        // This function can be kept empty or removed if no other logic depends on it.
        if (!map.current) return;
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
    }, []);

    const [selectedMarkerId, setSelectedMarkerId] = useState(null);

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
            clusterMaxZoom: 16,
        });

        // ── Clusters circle layer ──────────────────────────────
        map.current.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'venues',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': '#F59E0B',
                'circle-radius': 20,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff'
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

        // ── Unclustered points (Emoji Pins) moved to useEffect for performance ──

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

        // ── Click on individual pin → open card ────────────────────
        map.current.on('click', 'unclustered-point', (e) => {
            const venueId = e.features[0].properties.id;
            const fullVenue = demoVenues.find(v => v.id === venueId);
            if (fullVenue) onVenueSelect(fullVenue);
        });

        // ── Hover effects ──────────────────────────────────────────
        map.current.on('mouseenter', 'unclustered-point', () => {
            map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'unclustered-point', () => {
            map.current.getCanvas().style.cursor = '';
        });
        
        // Initial marker draw
        setTimeout(map.current._updateDOMMarkers, 100);

        // Remove setup of DOM markers manually as layer handles it now
    }, [onVenueSelect]);

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
            
            if (activeLayer === 'comfort') {
                const forecast = generateHourlyForecast(temp, windSpeed, humidity, venue);
                const currentH = new Date().getHours();
                const offset = (comfortHour - currentH + 24) % 24;
                const hourData = forecast[offset] || forecast[0];
                const comfortColors = { cold: '#3b82f6', cool: '#60a5fa', mild: '#22c55e', warm: '#16a34a', hot: '#f97316', extreme: '#ef4444', unknown: '#9ca3af' };
                const bgColor = comfortColors[hourData.comfort.level] || comfortColors.unknown;

                el.innerHTML = `
                    <div class="comfort-map-pill" style="background:${bgColor};">
                        <span class="comfort-map-temp">${hourData.feelsLike}°</span>
                        <span class="comfort-map-icon">${hourData.comfort.icon}</span>
                    </div>
                `;
            } else if (activeLayer === 'uv') {
                const uvColor = uvIndex <= 2 ? '#a78bfa' : uvIndex <= 5 ? '#8b5cf6' : uvIndex <= 7 ? '#7c3aed' : uvIndex <= 10 ? '#6d28d9' : '#4c1d95';
                const modifiedUv = Math.max(0, uvIndex + (venue.tags?.includes('Rooftop') ? 1 : 0) - (venue.tags?.includes('Indoor Warmth') ? 5 : 0));
                
                el.innerHTML = `
                    <div class="uv-map-pill" style="background:${uvColor};">
                        <span class="uv-map-num">UV ${modifiedUv.toFixed(1)}</span>
                    </div>
                `;
            } else if (activeLayer === 'radar') {
                const isRain = weather?.weather?.[0]?.main?.toLowerCase().includes('rain') || false;
                const chance = Math.min(100, Math.round(Math.random() * 40 + (isRain ? 50 : 0)));
                el.innerHTML = `
                    <div class="radar-map-pill">
                        <span class="radar-map-icon">💧</span>
                        <span class="radar-map-pct">${chance}%</span>
                    </div>
                `;
            }

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
    }, [activeLayer, comfortHour, weather, uvIndex, onVenueSelect]);

    // ── Effects ─────────────────────────────────────────────────────────
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
                minZoom: 0,
                maxZoom: 22
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
                        14, 0, 14.05, ['get', 'height']],
                      'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'],
                        14, 0, 14.05, ['get', 'min_height']],
                      'fill-extrusion-opacity': 0.85
                    }
                  });
                }

                setupClusterSource();
                applySunSkyLayer();

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
                    intensity: Math.min(0.8, altitudeDeg / 60 + 0.2),
                    position: [1.5, azimuthDeg, altitudeDeg]
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
            if (map.current?._updateDOMMarkers) {
                map.current.off('render', map.current._updateDOMMarkers);
            }
            markersRef.current.forEach(m => m.remove());
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);



    // Cleanup sky interval on unmount
    useEffect(() => {
        return () => {
            if (map.current?._sunSkyInterval) {
                clearInterval(map.current._sunSkyInterval);
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

        const weatherData = {
            min_temp: weather?.rawWeather?.minTemp,
            weatherCode: weather?.rawWeather?.weatherCode,
            cloud_cover: weather?.clouds?.all
        };

        source.setData(buildGeoJSON(filteredVenues, weatherData));

        setTimeout(() => setIsUpdating(false), 200);
    }, [filteredVenueIds, mapLoaded, weather]);

    // ── Efficient Marker Management ──
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        filteredVenues.forEach((venue) => {
            const lng = Number(venue.lng);
            const lat = Number(venue.lat);
            if (isNaN(lng) || isNaN(lat) || lng === 0 || lat === 0) return;

            const emoji = getVenuePinEmoji(venue);
            const isSelected = selectedMarkerId === venue.id;

            const el = document.createElement('div');
            el.className = 'custom-sun-pin';
            el.style.cursor = 'pointer';
            el.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; pointer-events: none; position: relative;">
                <div style="font-size: ${isSelected ? '34px' : '28px'}; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); transition: font-size 0.15s ease;">${emoji}</div>
                <div class="venue-pin-label" style="
                  background: rgba(255,255,255,0.92);
                  backdrop-filter: blur(8px);
                  -webkit-backdrop-filter: blur(8px);
                  padding: 2px 8px;
                  border-radius: 12px;
                  font-size: 11px;
                  font-weight: 700;
                  color: #1A1A1A;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
                  white-space: nowrap;
                  margin-top: 3px;
                  border: 1px solid rgba(255,255,255,0.6);
                  opacity: ${isSelected ? '1' : '0'};
                  transform: translateY(${isSelected ? '0' : '-4px'});
                  transition: opacity 0.2s ease, transform 0.2s ease;
                  pointer-events: none;
                ">${venue.venueName}</div>
              </div>
            `;

            const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat([lng, lat])
                .addTo(map.current);

            const handleSelect = (e) => {
                e.stopPropagation();
                setSelectedMarkerId(prev => prev === venue.id ? null : venue.id);
                onVenueSelectRef.current?.(venue, isMobileViewport());
            };

            el.addEventListener('click', handleSelect);
            el.addEventListener('touchend', handleSelect, { passive: false });

            markersRef.current.push(marker);
        });

        return () => {
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];
        };
    }, [mapLoaded, filteredVenues, selectedMarkerId]);

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
        const syncMap = () => {
            if (map.current) map.current.resize();
        };
        map.current.on('zoomend', syncMap);
        map.current.on('moveend', syncMap);
        return () => {
            map.current?.off('zoomend', syncMap);
            map.current?.off('moveend', syncMap);
        };
    }, [mapLoaded]);

    // ── Custom Layer Markers ─────────────────────────────────


    useEffect(() => {
        updateLayerMarkers();
    }, [updateLayerMarkers]);

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

            {radarMode && (
                <div className="radar-map-overlay">
                    <div className="radar-storm-cell cell-1" />
                    <div className="radar-storm-cell cell-2" />
                    <div className="radar-storm-cell cell-3" />
                </div>
            )}

            {/* Floating Layer Controls */}
            {mapLoaded && !mapError && (
                <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">

                    <button
                        onClick={() => toggleLayer('comfort')}
                        className={`map-glass-btn ${comfortMode ? 'map-glass-btn--active' : ''}`}
                        id="comfort-map-toggle"
                    >
                        <span>{comfortMode ? '🌡️' : '🗺️'}</span>
                        <span>{comfortMode ? 'Comfort Map' : 'Show Comfort'}</span>
                    </button>

                    <button
                        onClick={() => toggleLayer('uv')}
                        className={`map-glass-btn ${uvMode ? 'map-glass-btn--active' : ''}`}
                        id="uv-map-toggle"
                    >
                        <span>{uvMode ? '🧴' : '☀️'}</span>
                        <span>{uvMode ? 'UV Active' : 'Show UV'}</span>
                    </button>

                    <button
                        onClick={() => toggleLayer('radar')}
                        className={`map-glass-btn ${radarMode ? 'map-glass-btn--active' : ''}`}
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
                        <div className="space-y-4">
                            <div className="animate-spin-slow text-6xl mb-4">☀️</div>
                            <p className="text-gray-400 font-semibold italic">Waking up the map...</p>
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
