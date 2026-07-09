// Mapbox token must be set via VITE_MAPBOX_TOKEN environment variable.
// In Netlify: Site Settings → Environment Variables → VITE_MAPBOX_TOKEN
// Never hardcode tokens here — they ship in the JS bundle and trigger security blocks.
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

if (!import.meta.env.VITE_MAPBOX_TOKEN) {
    console.warn('[Sunstay] VITE_MAPBOX_TOKEN is not set. Map will not load. Add it to your .env or Netlify environment variables.');
}

export const MAP_STYLE = {
    version: 8,
    sources: {
        'carto-positron': {
            type: 'raster',
            tiles: [
                'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
        }
    },
    layers: [
        {
            id: 'carto-positron-layer',
            type: 'raster',
            source: 'carto-positron',
            minzoom: 0,
            maxzoom: 20
        }
    ]
};

export const INITIAL_VIEW_STATE = {
    longitude: 144.9631,
    latitude: -37.8136,
    zoom: 13,
    pitch: 45,
    bearing: 0
};

export const MAX_BOUNDS = [[144.5, -38.2], [145.5, -37.5]];

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
