/**
 * Sun Position \u2192 Mapbox Sky Integration
 * \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * Converts SunCalc astronomical data into Mapbox GL sky layer values.
 * Used to drive realistic, time-of-day lighting on the venue map.
 *
 * @module utils/sunPosition
 */

import SunCalc from 'suncalc';

export function getSunPositionForMap(lat, lng, date = new Date()) {
    try {
        const pos = SunCalc.getPosition(date, lat, lng);
        const altitudeDeg = pos.altitude * (180 / Math.PI);
        const azimuthDeg = ((pos.azimuth * (180 / Math.PI)) + 180) % 360;
        const sunlightIntensity = Math.max(0, Math.min(1, altitudeDeg / 60));
        return {
            altitude: altitudeDeg,
            azimuth: azimuthDeg,
            sunlightIntensity,
            isDaylight: altitudeDeg > 0,
            isGoldenHour: altitudeDeg > -1 && altitudeDeg < 10,
            isTwilight: altitudeDeg >= -6 && altitudeDeg <= 0,
        };
    } catch (e) {
        console.warn('[SunPosition] SunCalc error, returning defaults:', e);
        return {
            altitude: 45,
            azimuth: 180,
            sunlightIntensity: 0.75,
            isDaylight: true,
            isGoldenHour: false,
            isTwilight: false,
        };
    }
}

export function toMapboxSkyValues(sunPosition, cloudCover = 0) {
    const { altitude, azimuth, isDaylight, isGoldenHour, isTwilight } = sunPosition;
    const mbSunPos = [azimuth, Math.max(0, altitude)];
    const baseSunIntensity = isDaylight ? Math.min(15, 5 + (altitude / 90) * 10) : 0;
    const sunIntensity = baseSunIntensity * (1 - cloudCover * 0.7);
    const baseAtmosphere = isDaylight ? 0.8 + (altitude / 90) * 0.2 : 0.15;
    const atmosphereIntensity = baseAtmosphere * (1 - cloudCover * 0.4);
    let atmosphereColor;
    if (!isDaylight && !isTwilight) {
        atmosphereColor = 'rgba(20, 20, 40, 1)';
    } else if (isTwilight) {
        atmosphereColor = 'rgba(180, 100, 60, 1)';
    } else if (isGoldenHour) {
        atmosphereColor = 'rgba(255, 170, 60, 1)';
    } else if (altitude < 30) {
        atmosphereColor = 'rgba(200, 150, 100, 1)';
    } else {
        atmosphereColor = 'rgba(135, 180, 235, 1)';
    }
    let skyGradient;
    if (!isDaylight && !isTwilight) {
        skyGradient = ['rgba(10, 10, 30, 1)', 'rgba(30, 30, 60, 1)'];
    } else if (isGoldenHour) {
        skyGradient = ['rgba(40, 60, 120, 1)', 'rgba(255, 140, 50, 1)'];
    } else {
        skyGradient = ['rgba(60, 120, 200, 1)', 'rgba(180, 210, 240, 1)'];
    }
    return { sunPosition: mbSunPos, sunIntensity, atmosphereIntensity, atmosphereColor, skyGradient };
}

export function getMapboxLightPreset(sunPosition) {
    const { altitude, azimuth, isGoldenHour, isDaylight } = sunPosition;
    if (!isDaylight) {
        return { anchor: 'viewport', color: '#1a1a2e', intensity: 0.2, position: [1.5, 180, 30] };
    }
    if (isGoldenHour) {
        return { anchor: 'viewport', color: '#ffaa3c', intensity: 0.5, position: [1.2, azimuth, Math.max(5, altitude)] };
    }
    return { anchor: 'viewport', color: '#ffffff', intensity: 0.3 + (altitude / 90) * 0.3, position: [1.5, azimuth, altitude] };
}

export function computeShadowProjection(lat, lng, buildingHeight = 10, date = new Date()) {
    const sunPos = getSunPositionForMap(lat, lng, date);
    const shadowLength = sunPos.isDaylight && sunPos.altitude > 1
        ? buildingHeight / Math.tan(sunPos.altitude * (Math.PI / 180))
        : 0;
    const shadowBearing = (sunPos.azimuth + 180) % 360;
    return {
        shadowLength: parseFloat(shadowLength.toFixed(1)),
        shadowBearing: parseFloat(shadowBearing.toFixed(1)),
        shadowPolygon: null,
        implemented: false,
    };
}

export function computeTerrainShading(lat, lng, date = new Date()) {
    const sunPos = getSunPositionForMap(lat, lng, date);
    return {
        hillshadeAngle: sunPos.azimuth,
        hillshadeIntensity: sunPos.isDaylight ? sunPos.sunlightIntensity : 0,
        enabled: false,
    };
}
