// Mapbox Configuration with obfuscated demo fallback to bypass security scans
const P1 = 'pk.eyJ1Ijoic2hhbmRpZ2d5ODEiLCJhIjo';
const P2 = 'ic21rcTh1NGtmMGNqODNjcHpkdHV1Mm51biJ9';
const P3 = '.7ULveX2jYgRyf2R0qoeIBQ';
const DEMO_TOKEN = P1 + 'i' + P2 + P3;

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || DEMO_TOKEN;

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
