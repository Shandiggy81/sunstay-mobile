/**
 * VenueMap — Optimized Cross-Platform Map Component
 * ──────────────────────────────────────────────────
 * GL-native rendering with bold circle-backed emoji pins
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
import { calculateLiveSunScore, getComfortTier } from '../../utils/sunScore';

// ── Constants ───────────────────────────────────────────────────────

const VENUE_SOURCE_ID = 'venue-source';
const VENUE_LAYER_ID = 'venue-symbols';
const VENUE_BG_LAYER_ID = 'venue-circles';
const SUNSHINE_SOURCE_ID = 'sunshine-source';
const SUNSHINE_LAYER_ID = 'sunshine-overlay';

// Larger emoji pins — clearly visible on light map
const VENUE_SYMBOL_LAYOUT = {
    'text-field': ['get', 'emoji'],
    'text-size': 22,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
    'icon-allow-overlap': true,
    'text-anchor': 'center',
    'text-offset': [0, 0],
};

const VENUE_SYMBOL_PAINT = {
    'text-color': '#ffffff',
    'text-halo-color': 'rgba(0,0,0,0.15)',
    'text-halo-width': 1,
    'text-halo-blur': 0,
};

// Circle background layer — makes pins pop on any map style
const VENUE_CIRCLE_PAINT = {
    'circle-radius': 20,
    'circle-color': ['get', 'haloColor'],
    'circle-opacity': 0.92,
    'circle-stroke-width': 2.5,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-opacity': 1,
    'circle-blur': 0,
};


// ── Sunshine Overlay (memoized) ─────────────────────────────────────

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
                geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
                properties: { intensity, temp: Math.round(temp) },
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
            const liveInput = {
                shortwaveRadiation: weather?.shortwaveRadiation ?? 0,
                apparentTemp: weather?.main?.feels_like ?? weather?.main?.temp ?? 20,
                precipProbability: weather?.precipProbability ?? 0,
                cloudCover: weather?.cloudCoverPct ?? weather?.clouds?.all ?? 0,
                windGusts: weather?.windGusts ?? (weather?.wind?.speed ?? 0) * 3.6,
                isDay: weather?.isDay ?? 1,
            };
            const cozyBonus = (liveInput.apparentTemp < 14 || liveInput.precipProbability > 60)
                && (venue.tags?.includes('Fireplace') || venue.heating || venue.fireplace) ? 15 : 0;
            const { score } = calculateLiveSunScore(liveInput);
            const tier = getComfortTier(Math.min(100, score + cozyBonus));
            return {
                prime:    '#f59e0b',  // amber
                good:     '#10b981',  // emerald
                moderate: '#6366f1',  // indigo
                cosy:     '#f97316',  // orange
            }[tier] || '#f59e0b';
        };

        function getPinEmoji(venue, weather) {
            const hasHeat = venue.heater || venue.fireplace;
            if (hasHeat && (weather?.apparentTemp ?? 20) < 14) return '🔥';
            if ((weather?.precipProbability ?? 0) > 60) return '🌧️';
            if ((weather?.cloudCover ?? 0) > 70) return '☁️';
            if ((weather?.isDay ?? 1) === 0) return '🌙';
            return '☀️';
        }

        return {
            type: 'FeatureCollection',
            features: venues.map(v => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
                properties: {
                    id: v.id,
                    emoji: getPinEmoji(v, weather),
                    name: v.venueName || v.name || '',
                    haloColor: getHaloColor(v),
                    visible: filteredVenueIds === null || filteredVenueIds.includes(v.id),
                    score: (() => {
                        const liveInput = {
                            shortwaveRadiation: weather?.shortwaveRadiation ?? 0,
                            apparentTemp: weather?.main?.feels_like ?? weather?.main?.temp ?? 20,
                            precipProbability: weather?.precipProbability ?? 0,
                            cloudCover: weather?.cloudCoverPct ?? weather?.clouds?.all ?? 0,
                            windGusts: weather?.windGusts ?? (weather?.wind?.speed ?? 0) * 3.6,
                            isDay: weather?.isDay ?? 1,
                        };
                        return calculateLiveSunScore(liveInput).score;
                    })(),
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
        flyTo: (options) => { if (map.current) map.current.flyTo(options); },
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

                // ── Venue GeoJSON Source ──────────────────────────────
                map.current.addSource(VENUE_SOURCE_ID, {
                    type: 'geojson',
                    data: venueGeoJSON,
                    cluster: false,
                });

                // ── Sunshine Overlay ──────────────────────────────────
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
                });

                // ── Circle background (renders below emoji) ───────────
                map.current.addLayer({
                    id: VENUE_BG_LAYER_ID,
                    type: 'circle',
                    source: VENUE_SOURCE_ID,
                    paint: VENUE_CIRCLE_PAINT,
                    filter: ['==', ['get', 'visible'], true],
                });

                // ── Emoji symbol on top ───────────────────────────────
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

                // ── Click Handler ─────────────────────────────────────
                const handleClick = (e) => {
                    if (!e.features?.length) return;
                    const venueId = e.features[0].properties.id;
                    const venue = venues.find(v => v.id === venueId);
                    if (venue) onVenueSelect(venue);
                };

                map.current.on('click', VENUE_LAYER_ID, handleClick);
                map.current.on('click', VENUE_BG_LAYER_ID, handleClick);

                map.current.on('mouseenter', VENUE_LAYER_ID, () => {
                    map.current.getCanvas().style.cursor = 'pointer';
                });
                map.current.on('mouseleave', VENUE_LAYER_ID, () => {
                    map.current.getCanvas().style.cursor = '';
                });
                map.current.on('mouseenter', VENUE_BG_LAYER_ID, () => {
                    map.current.getCanvas().style.cursor = 'pointer';
                });
                map.current.on('mouseleave', VENUE_BG_LAYER_ID, () => {
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

    // ── Update Sunshine overlay ───────────────────────────────────
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

const overlayStyles = {
    container: {
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 15, 30, 0.95)', zIndex: 10,
    },
    errorContent: { textAlign: 'center', padding: '24px' },
    errorText: { color: 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: '600' },
    badge: {
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        background: 'rgba(0,0,0,0.4)', padding: '8px 16px',
        borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)',
        marginTop: '16px', fontSize: '10px', fontWeight: '700',
        color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '1px',
    },
    pulseDot: {
        width: '8px', height: '8px', borderRadius: '50%',
        background: '#fbbf24', animation: 'pulse 2s infinite',
    },
    loadingContent: { textAlign: 'center' },
    loadingText: {
        color: 'rgba(255,255,255,0.5)', fontWeight: '600',
        fontStyle: 'italic', marginTop: '12px',
    },
};

export default memo(VenueMap);
