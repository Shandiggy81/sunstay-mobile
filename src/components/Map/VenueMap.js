/**
 * VenueMap — Optimized Cross-Platform Map Component
 * ──────────────────────────────────────────────────
 * Replaces DOM-based Mapbox markers with GL-native rendering:
 *   - Web:    GeoJSON source + symbol layer (mapbox-gl)
 *   - Mobile: @rnmapbox/maps SymbolLayer (same interface, future)
 *
 * Performance improvements:
 *   - Single GL layer instead of N DOM elements
 *   - Memoized GeoJSON & sunshine overlay
 *   - Click handling via GL events, not DOM listeners
 *   - Designed for 1000+ venues
 *
 * @module components/Map/VenueMap
 */

import React, {
    useEffect, useRef, useState, useCallback,
    useMemo, forwardRef, useImperativeHandle, memo,
} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAP_STYLE, INITIAL_VIEW_STATE } from '../../config/mapConfig';
import { useWeather } from '../../context/WeatherContext';
import { PlatformMaps } from '../../utils/platform';

// ── Constants ───────────────────────────────────────────────────────

const VENUE_SOURCE_ID = 'venue-source';
const VENUE_LAYER_ID = 'venue-symbols';
const SUNSHINE_SOURCE_ID = 'sunshine-source';
const SUNSHINE_LAYER_ID = 'sunshine-overlay';

// Emoji-to-image mapping for symbol layer (Mapbox GL requires images, not text)
// We use a text-field approach instead for simplicity.
const VENUE_SYMBOL_LAYOUT = {
    'text-field': ['get', 'emoji'],
    'text-size': 24,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
    'icon-allow-overlap': true,
};

const VENUE_SYMBOL_PAINT = {
    'text-color': '#ffffff',
    'text-halo-color': ['get', 'haloColor'],
    'text-halo-width': 3,
    'text-halo-blur': 1,
};


// ── Sunshine Overlay (memoized) ─────────────────────────────────────

/**
 * Build GeoJSON for the sunshine indicator heatmap.
 * Memoized — only recomputes when weather data or venues change.
 *
 * @param {object[]} venues
 * @param {object | null} weather
 * @returns {object} GeoJSON FeatureCollection
 */
const buildSunshineGeoJSON = (venues, weather) => {
    if (!weather || !venues?.length) {
        return { type: 'FeatureCollection', features: [] };
    }

    const temp = weather.main?.temp ?? 20;
    const isSunny = weather.weather?.[0]?.main === 'Clear';

    return {
        type: 'FeatureCollection',
        features: venues.map(v => {
            const tags = v.tags || [];
            const hasSunTag = tags.includes('Sunny') || tags.includes('Afternoon Sun');
            const intensity = isSunny && hasSunTag ? 0.8 : isSunny ? 0.4 : 0.15;

            return {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [v.lng, v.lat],
                },
                properties: {
                    intensity,
                    temp: Math.round(temp),
                },
            };
        }),
    };
};


// ── VenueMap Component ──────────────────────────────────────────────

const VenueMap = forwardRef(({
    venues = [],
    selectedVenue,
    filteredVenueIds,
    onVenueSelect,
    weatherColorFn,
}, ref) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(false);
    const { weather } = useWeather();

    // ── GeoJSON FeatureCollection (memoized) ──────────────────────
    const venueGeoJSON = useMemo(() => {
        const getHaloColor = (venue) => {
            if (!weather || !weatherColorFn) return '#f59e0b'; // default amber
            const color = weatherColorFn(weather, venue);
            const colorMap = {
                sunny: '#f59e0b',
                cloudy: '#94a3b8',
                rainy: '#3b82f6',
                stormy: '#6366f1',
            };
            return colorMap[color] || '#f59e0b';
        };

        return {
            type: 'FeatureCollection',
            features: venues.map(v => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [v.lng, v.lat],
                },
                properties: {
                    id: v.id,
                    emoji: v.emoji || '📍',
                    name: v.venueName || v.name || '',
                    haloColor: getHaloColor(v),
                    visible: filteredVenueIds === null || filteredVenueIds.includes(v.id),
                },
            })),
        };
    }, [venues, weather, weatherColorFn, filteredVenueIds]);

    // ── Sunshine overlay (memoized) ───────────────────────────────
    const sunshineGeoJSON = useMemo(
        () => buildSunshineGeoJSON(venues, weather),
        [venues, weather]
    );

    // ── Expose flyTo via ref ──────────────────────────────────────
    useImperativeHandle(ref, () => ({
        flyTo: (options) => {
            if (map.current) map.current.flyTo(options);
        },
        getMap: () => map.current,
    }));

    // ── Initialize Map ────────────────────────────────────────────
    useEffect(() => {
        if (map.current) return;

        const isTokenValid = MAPBOX_TOKEN && MAPBOX_TOKEN.startsWith('pk.');
        if (!isTokenValid) {
            console.warn('[VenueMap] Mapbox token missing or invalid.');
            setMapError(true);
            return;
        }

        if (!mapContainer.current) return;

        mapboxgl.accessToken = MAPBOX_TOKEN;

        const loadTimeout = setTimeout(() => {
            if (!map.current || !mapLoaded) {
                console.warn('[VenueMap] Map loading timed out.');
                setMapError(true);
            }
        }, 12000);

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

                // ── Add Venue Source + Symbol Layer ──────────────────
                map.current.addSource(VENUE_SOURCE_ID, {
                    type: 'geojson',
                    data: venueGeoJSON,
                });

                map.current.addLayer({
                    id: VENUE_LAYER_ID,
                    type: 'symbol',
                    source: VENUE_SOURCE_ID,
                    layout: {
                        ...VENUE_SYMBOL_LAYOUT,
                        'visibility': 'visible',
                    },
                    paint: VENUE_SYMBOL_PAINT,
                    filter: ['==', ['get', 'visible'], true],
                });

                // ── Add Sunshine Overlay Source + Circle Layer ───────
                map.current.addSource(SUNSHINE_SOURCE_ID, {
                    type: 'geojson',
                    data: sunshineGeoJSON,
                });

                map.current.addLayer({
                    id: SUNSHINE_LAYER_ID,
                    type: 'circle',
                    source: SUNSHINE_SOURCE_ID,
                    paint: {
                        'circle-radius': 40,
                        'circle-color': '#fbbf24',
                        'circle-opacity': ['get', 'intensity'],
                        'circle-blur': 1,
                    },
                }, VENUE_LAYER_ID); // render below venue symbols

                // ── Click Handler (GL event, not DOM) ───────────────
                map.current.on('click', VENUE_LAYER_ID, (e) => {
                    if (!e.features?.length) return;
                    const feature = e.features[0];
                    const venueId = feature.properties.id;
                    const venue = venues.find(v => v.id === venueId);
                    if (venue) onVenueSelect(venue);
                });

                // Pointer cursor on hover
                map.current.on('mouseenter', VENUE_LAYER_ID, () => {
                    map.current.getCanvas().style.cursor = 'pointer';
                });
                map.current.on('mouseleave', VENUE_LAYER_ID, () => {
                    map.current.getCanvas().style.cursor = '';
                });
            });

            map.current.on('error', (e) => {
                console.error('[VenueMap] Mapbox error:', e.error);
                const errMsg = e.error?.message || '';
                if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('access token')) {
                    clearTimeout(loadTimeout);
                    setMapError(true);
                }
            });

            map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

        } catch (error) {
            console.error('[VenueMap] Init error:', error);
            clearTimeout(loadTimeout);
            setMapError(true);
        }

        return () => {
            clearTimeout(loadTimeout);
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Update GeoJSON when data changes ──────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const source = map.current.getSource(VENUE_SOURCE_ID);
        if (source) source.setData(venueGeoJSON);
    }, [venueGeoJSON, mapLoaded]);

    // ── Update Sunshine overlay when weather changes ──────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const source = map.current.getSource(SUNSHINE_SOURCE_ID);
        if (source) source.setData(sunshineGeoJSON);
    }, [sunshineGeoJSON, mapLoaded]);

    // ── Fly to selected venue ─────────────────────────────────────
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

    // ── Render ────────────────────────────────────────────────────
    const isTokenMissing = !MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith('pk.');

    return (
        <div className="ss-mapview-root" style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

            {/* Error / Loading Overlay */}
            {(mapError || !mapLoaded) && (
                <div style={overlayStyles.container}>
                    {(isTokenMissing || mapError) ? (
                        <div style={overlayStyles.errorContent}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗺️</div>
                            <p style={overlayStyles.errorText}>
                                {isTokenMissing
                                    ? 'Mapbox token required for map rendering'
                                    : 'Map failed to load — using fallback mode'}
                            </p>
                            <div style={overlayStyles.badge}>
                                <div style={overlayStyles.pulseDot} />
                                <span>VenueMap GL • Optimized Symbol Layer</span>
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

            {/* Caption */}
            {mapLoaded && !mapError && (
                <div className="ss-map-caption">
                    <div className="ss-map-caption-inner">
                        📍 GL Symbol Layer • {venues.length} venues rendered
                    </div>
                </div>
            )}
        </div>
    );
});

VenueMap.displayName = 'VenueMap';

// ── Overlay Styles ──────────────────────────────────────────────────

const overlayStyles = {
    container: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 15, 30, 0.95)',
        zIndex: 10,
    },
    errorContent: {
        textAlign: 'center',
        padding: '24px',
    },
    errorText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: '14px',
        fontWeight: '600',
    },
    badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(0,0,0,0.4)',
        padding: '8px 16px',
        borderRadius: '20px',
        border: '1px solid rgba(255,255,255,0.1)',
        marginTop: '16px',
        fontSize: '10px',
        fontWeight: '700',
        color: '#fbbf24',
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
    pulseDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#fbbf24',
        animation: 'pulse 2s infinite',
    },
    loadingContent: {
        textAlign: 'center',
    },
    loadingText: {
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '600',
        fontStyle: 'italic',
        marginTop: '12px',
    },
};

export default memo(VenueMap);
