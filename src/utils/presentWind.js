const MS_TO_KMH = 3.6;

function finiteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * Normalize Open-Meteo / OpenWeather-shaped wind for display.
 * `wind.speed` is stored as m/s; `windKmh` and `windGusts` are km/h.
 * A zero or missing gust is treated as absent so the UI never prints `0 km/h`.
 */
export function presentWind(weather) {
    if (!weather) {
        return { speedKmh: null, gustKmh: null, speedLabel: null, gustLabel: null };
    }

    const nativeKmh = finiteNumber(weather.windKmh);
    const speedMs = finiteNumber(weather.wind?.speed);
    const speedKmh = nativeKmh ?? (speedMs != null ? speedMs * MS_TO_KMH : null);
    const rawGust = finiteNumber(weather.windGusts);
    const gustKmh = rawGust != null && rawGust > 0 ? rawGust : null;
    const roundedSpeed = speedKmh != null ? Math.round(speedKmh) : null;
    const roundedGust = gustKmh != null ? Math.round(gustKmh) : null;

    return {
        speedKmh: roundedSpeed,
        gustKmh: roundedGust,
        speedLabel: roundedSpeed != null ? `${roundedSpeed} km/h` : null,
        gustLabel: roundedGust != null ? `Gusts: ${roundedGust} km/h` : null,
    };
}
