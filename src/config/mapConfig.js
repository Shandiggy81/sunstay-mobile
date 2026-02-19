// Mapbox Configuration
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

export const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';

export const INITIAL_VIEW_STATE = {
    longitude: 144.9631,
    latitude: -37.8136,
    zoom: 12,
    pitch: 0,
    bearing: 0
};

export const MARKER_STYLE = {
    width: 'auto',
    height: '32px',
    borderRadius: '16px',
    padding: '6px 12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
};
