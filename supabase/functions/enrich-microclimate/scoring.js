// Existing scoring mathematics, extracted unchanged for Node/Deno testing.
export function melbourneHour(now = new Date()) {
    const hour = new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Melbourne",
        hour: "numeric",
        hourCycle: "h23",
    }).formatToParts(now).find((p) => p.type === "hour")?.value;
    return Number(hour ?? now.getUTCHours());
}
/** Meteorological degrees → sector index 0=N … 7=NW */
export function windSector(directionDeg) {
    const d = ((directionDeg % 360) + 360) % 360;
    return Math.round(d / 45) % 8;
}
export function shelterFromAspect(hw) {
    if (hw == null || Number.isNaN(hw))
        return 0.4;
    if (hw < 0.3)
        return 0.15;
    if (hw < 0.7)
        return 0.45;
    return Math.min(0.85, 0.5 + (hw - 0.7) * 0.25);
}
export function comfortHint(sun, windMs) {
    const breezy = windMs >= 4.5;
    const sunny = sun >= 0.45;
    if (sunny && !breezy)
        return "sunny_calm";
    if (sunny && breezy)
        return "sunny_breezy";
    if (!sunny && !breezy)
        return "shaded_calm";
    return "shaded_breezy";
}
export function scoreVenue(profile, weather, hourLocal) {
    const hourFrac = profile.sun_hour_fraction?.[hourLocal] ??
        profile.sun_score_annual ??
        0.5;
    const cloudFactor = 1 - Math.min(Math.max(weather.sunCloud ?? weather.cloud, 0), 100) / 100;
    const effective_sun = Math.min(1, Math.max(0, hourFrac * cloudFactor));
    const sector = windSector(weather.windDir);
    const mult = profile.wind_exposure_by_sector?.[sector] ??
        (1 - shelterFromAspect(profile.canyon_aspect_hw));
    // weather.windSpeed is m/s (wind_speed_unit=ms), so this stays m/s.
    const effective_wind = Math.max(0, weather.windSpeed * mult);
    const wind_shelter_score = Math.min(1, Math.max(0, 1 - mult * 0.9));
    return {
        effective_sun,
        effective_wind,
        wind_shelter_score,
        comfort_hint: comfortHint(effective_sun, effective_wind),
    };
}
