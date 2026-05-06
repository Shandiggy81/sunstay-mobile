import React, { useEffect, useRef, useCallback, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getSunPositionForMap } from '../utils/sunPosition';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const MELBOURNE_CENTER = [144.9631, -37.8136];
const DEFAULT_ZOOM = 13;

export default function MapView({ venues, onVenueSelect, selectedVenueId, userLocation }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef({});
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (map.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: userLocation ? [userLocation.lng, userLocation.lat] : MELBOURNE_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    map.current.on('load', () => setMapLoaded(true));
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
  }, []);

  const getMarkerColor = useCallback((venue) => {
    const now = new Date();
    const { altitude } = getSunPositionForMap(venue.lat, venue.lng, now);
    if (altitude > 30) return '#F59E0B';
    if (altitude > 10) return '#0EA5E9';
    return '#94A3B8';
  }, []);

  useEffect(() => {
    if (!mapLoaded || !venues?.length) return;

    venues.forEach((venue) => {
      if (!venue.lat || !venue.lng) return;

      if (markers.current[venue.id]) {
        markers.current[venue.id].remove();
      }

      const color = getMarkerColor(venue);
      const el = document.createElement('div');
      el.style.cssText = `
        width: 36px; height: 36px; border-radius: 50%;
        background: ${color}; border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer; display: flex; align-items: center;
        justify-content: center; font-size: 16px;
        transition: transform 0.2s ease;
      `;
      el.textContent = venue.emoji || '📍';
      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; });
      el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([venue.lng, venue.lat])
        .addTo(map.current);

      el.addEventListener('click', () => onVenueSelect?.(venue));
      markers.current[venue.id] = marker;
    });
  }, [mapLoaded, venues, getMarkerColor, onVenueSelect]);

  useEffect(() => {
    if (!mapLoaded || !selectedVenueId) return;
    const venue = venues?.find(v => v.id === selectedVenueId);
    if (venue?.lat && venue?.lng) {
      map.current.flyTo({ center: [venue.lng, venue.lat], zoom: 15, duration: 800 });
    }
  }, [selectedVenueId, mapLoaded, venues]);

  useEffect(() => {
    if (!mapLoaded || !userLocation) return;
    new mapboxgl.Marker({ color: '#0EA5E9' })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current);
  }, [mapLoaded, userLocation]);

  return (
    <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
  );
}
