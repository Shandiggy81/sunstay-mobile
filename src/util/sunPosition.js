/**
 * Sun Position → Mapbox Sky Integration
 * ──────────────────────────────────────
 * Converts SunCalc astronomical data into Mapbox GL sky layer values.
 * Used to drive realistic, time-of-day lighting on the venue map.
 *
 * @module util/sunPosition
 */

import SunCalc from 'suncalc';

// ── Core Sun Position ────────────────────────────────────────────

/**
 * Get the sun's current position for a given location and time.
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Date}   [date=new Date()] - Date/time to calculate for
 * @returns {{ altitude: number, azimuth: number, sunlightIntensity: number, isDaylight: boolean, isGoldenHour: boolean, isTwilight: boolean }}
 */
export function getSunPositionForMap(lat, lng, date = new Date()) {
    try {
        const pos = SunCalc.getPosition(date, lat, lng);

        const altitudeDeg = pos.altitude * (180 / Math.PI);
        // SunCalc azimuth is from south, clockwise. Convert to 0-360 from north.
        const azimuthDeg = ((pos.azimuth * (180 / Math.PI)) + 180) % 360;

        // Sunlight intensity: 0 at night, ramps up from horizon, peaks at zenith
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

// ── Mapbox Sky Layer Values ──────────────────────────────────────

/**
 * Convert a sun position into Mapbox GL `sky` layer paint properties.
 *
 * @param {{ altitude: number, azimuth: number, sunlightIntensity: number, isDaylight: boolean, isGoldenHour: boolean, isTwilight: boolean }} sunPosition
 * @param {number} [cloudCover=0] - Cloud cover fraction 0–1
 * @returns {{ sunPosition: number[], sunIntensity: number, atmosphereIntensity: number, atmosphereColor: string, skyGradient: string[] }}
 */
export function toMapboxSkyValues(sunPosition, cloudCover = 0) {
    const { altitude, azimuth, isDaylight, isGoldenHour, isTwilight } = sunPosition;

    // Mapbox sky expects sun position as [azimuth, altitude] in degrees
    const mbSunPos = [azimuth, Math.max(0, altitude)];

    // Sun intensity: reduced by cloud cover
    const baseSunIntensity = isDaylight
        ? Math.min(15, 5 + (altitude / 90) * 10)
        : 0;
    const sunIntensity = baseSunIntensity * (1 - cloudCover * 0.7);

    // Atmosphere intensity: stronger during day, reduced by clouds
    const baseAtmosphere = isDaylight ? 0.8 + (altitude / 90) * 0.2 : 0.15;
    const atmosphereIntensity = baseAtmosphere * (1 - cloudCover * 0.4);

    // Atmosphere color based on time of day
    let atmosphereColor;
    if (!isDaylight && !isTwilight) {
        atmosphereColor = 'rgba(20, 20, 40, 1)';          // Night
    } else if (isTwilight) {
        atmosphereColor = 'rgba(180, 100, 60, 1)';        // Twilight warm
    } else if (isGoldenHour) {
        atmosphereColor = 'rgba(255, 170, 60, 1)';        // Golden hour amber
    } else if (altitude < 30) {
        atmosphereColor = 'rgba(200, 150, 100, 1)';       // Low sun warm
    } else {
        atmosphereColor = 'rgba(135, 180, 235, 1)';       // Daytime blue
    }

    // Sky gradient stops: top color → horizon color
    let skyGradient;
    if (!isDaylight && !isTwilight) {
        skyGradient = ['rgba(10, 10, 30, 1)', 'rgba(30, 30, 60, 1)'];
    } else if (isGoldenHour) {
        skyGradient = ['rgba(40, 60, 120, 1)', 'rgba(255, 140, 50, 1)'];
    } else {
        skyGradient = ['rgba(60, 120, 200, 1)', 'rgba(180, 210, 240, 1)'];
    }

    return {
        sunPosition: mbSunPos,
        sunIntensity,
        atmosphereIntensity,
        atmosphereColor,
        skyGradient,
    };
}

// ── Mapbox Light Preset ──────────────────────────────────────────

/**
 * Returns a light configuration preset based on current sun position.
 * Can be applied to `map.setLight()` for realistic directional lighting.
 *
 * @param {{ altitude: number, azimuth: number, isGoldenHour: boolean, isDaylight: boolean }} sunPosition
 * @returns {{ anchor: string, color: string, intensity: number, position: number[] }}
 */
export function getMapboxLightPreset(sunPosition) {
    const { altitude, azimuth, isGoldenHour, isDaylight } = sunPosition;

    if (!isDaylight) {
        return {
            anchor: 'viewport',
            color: '#1a1a2e',
            intensity: 0.2,
            position: [1.5, 180, 30],
        };
    }

    if (isGoldenHour) {
        return {
            anchor: 'viewport',
            color: '#ffaa3c',
            intensity: 0.5,
            position: [1.2, azimuth, Math.max(5, altitude)],
        };
    }

    // Standard daytime
    return {
        anchor: 'viewport',
        color: '#ffffff',
        intensity: 0.3 + (altitude / 90) * 0.3,
        position: [1.5, azimuth, altitude],
    };
}

// ── Shadow Simulation Placeholder ────────────────────────────────

/**
 * Placeholder for future shadow projection based on 3D buildings.
 *
 * TODO: Integrate Mapbox 3D terrain / building extrusions and DEM data
 * to calculate accurate shadow polygons for each venue.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} buildingHeight - Height in meters
 * @param {Date}   [date=new Date()]
 * @returns {{ shadowLength: number, shadowBearing: number, shadowPolygon: null, implemented: boolean }}
 */
export function computeShadowProjection(lat, lng, buildingHeight = 10, date = new Date()) {
    const sunPos = getSunPositionForMap(lat, lng, date);

    // Shadow length formula: height / tan(altitude)
    // Only valid when sun is above horizon
    const shadowLength = sunPos.isDaylight && sunPos.altitude > 1
        ? buildingHeight / Math.tan(sunPos.altitude * (Math.PI / 180))
        : 0;

    // Shadow falls opposite to sun azimuth
    const shadowBearing = (sunPos.azimuth + 180) % 360;

    return {
        shadowLength: parseFloat(shadowLength.toFixed(1)),
        shadowBearing: parseFloat(shadowBearing.toFixed(1)),
        shadowPolygon: null, // TODO: Generate GeoJSON polygon from building footprint + shadow vector
        implemented: false,
    };
}

// ── Terrain Shading Placeholder ──────────────────────────────────

/**
 * Placeholder for future terrain-aware hillshade calculations.
 *
 * TODO: Hook into Mapbox terrain / hillshade layer to provide
 * elevation-aware sun exposure scoring per venue.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {Date}   [date=new Date()]
 * @returns {{ hillshadeAngle: number, hillshadeIntensity: number, enabled: boolean }}
 */
export function computeTerrainShading(lat, lng, date = new Date()) {
    const sunPos = getSunPositionForMap(lat, lng, date);

    return {
        hillshadeAngle: sunPos.azimuth,
        hillshadeIntensity: sunPos.isDaylight ? sunPos.sunlightIntensity : 0,
        enabled: false, // TODO: Enable when Mapbox terrain source is added
    };
}
