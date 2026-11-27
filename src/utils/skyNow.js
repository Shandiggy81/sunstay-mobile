/**
 * The sky right now, worded once for every screen. The top bar, the home
 * sheet, the list, and the venue and stay cards all read this verdict, so
 * none of them can call it raining, likely to rain or sunny on its own.
 *
 * It reads deriveSunForecast()'s `now` (Open-Meteo's forecast at the
 * Melbourne CBD, so the same sky for every venue):
 * - rain 'raining': the current reading has rain (any precipitation, or a
 *   rain, drizzle or storm code). Only this is said in the present tense.
 * - rain 'likely': the reading is dry, but this hour's forecast is rain
 *   (a 50%+ chance, 0.5 mm, or a rain code at 30%+). Said with its chance.
 * - kind: the forecast's word for the sun now ('sun', 'cloud', 'rain',
 *   'shaded', 'night', 'day' or 'unknown').
 */

/**
 * @param {object|null} forecast deriveSunForecast() / venueSunForecast() result
 * @returns {null | {
 *   rain: 'raining'|'likely'|null, rainChance: number|null, kind: string,
 *   blocksSun: boolean, cloud: number|null, code: number|null, readingIsCurrent: boolean,
 * }} `blocksSun`: rain or cloud rules direct sun out right now (by day).
 */
export function skyNow(forecast) {
    const now = forecast?.now;
    if (!now || typeof now !== 'object') return null;
    const rain = now.rain === 'raining' || now.rain === 'likely' ? now.rain : null;
    const chance = Number.isFinite(now.rainChance) ? Math.max(0, Math.min(100, Math.round(now.rainChance))) : null;
    return {
        rain,
        rainChance: chance,
        kind: now.kind ?? 'unknown',
        blocksSun: now.kind === 'rain' || now.kind === 'cloud',
        cloud: Number.isFinite(now.cloud) ? now.cloud : null,
        code: Number.isFinite(now.code) ? now.code : null,
        readingIsCurrent: now.readingIsCurrent !== false,
    };
}

/** "Raining" in the reading, else "Rain likely · 95%" (or "Rain likely" without a chance); null without rain. */
export function rainNowText(sky) {
    if (sky?.rain === 'raining') return 'Raining';
    if (sky?.rain !== 'likely') return null;
    return sky.rainChance != null ? `Rain likely · ${sky.rainChance}%` : 'Rain likely';
}

/** The list row's word: "Rain" when it is in the reading, otherwise "Rain likely". */
export function rainListWord(rain) {
    return rain === 'raining' ? 'Rain' : 'Rain likely';
}

/** The home sheet clause's lead: "raining" or "rain likely". */
export function rainClauseWord(rain) {
    return rain === 'raining' ? 'raining' : 'rain likely';
}

/**
 * The first sentence of a card's sun text while the sky blocks the sun:
 * "Raining right now.", "Rain likely right now." or "Cloud is blocking the
 * sun right now.". Null when the sky lets the sun through.
 */
export function skyLeadSentence(sky) {
    if (sky?.rain === 'raining') return 'Raining right now.';
    if (sky?.rain === 'likely' || sky?.kind === 'rain') return 'Rain likely right now.';
    if (sky?.kind === 'cloud') return 'Cloud is blocking the sun right now.';
    return null;
}

/**
 * The sun graph's "Now" pill while the sky blocks the sun ("raining",
 * "rain likely", "cloudy"), so a clear-sky window never reads "in sun" in
 * rain. Null when the sun can get through.
 */
export function skyPillWord(sky) {
    if (!sky?.blocksSun) return null;
    if (sky.rain === 'raining') return 'raining';
    if (sky.kind === 'rain') return 'rain likely';
    return 'cloudy';
}
