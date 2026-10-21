/**
 * Clay icon for the header weather chip.
 *
 * Reads the same condition text the chip prints (headerWeatherSummary's
 * `condition`, e.g. "Foggy", "Rain showers", "Partly cloudy"), so the icon can
 * never disagree with the words beside it. Names are files in src/assets/clay/.
 *
 * @param {string|null|undefined} condition
 * @param {{ isNight?: boolean }} [options]
 * @returns {'sun'|'sun-cloud'|'cloud'|'fog'|'rain'|'sun-shower'|'thunderstorm'|'night'|'frost'}
 */
export function weatherClayIcon(condition, { isNight = false } = {}) {
    const c = String(condition ?? '').toLowerCase();
    if (/thunder|storm/.test(c)) return 'thunderstorm';
    if (/snow|sleet|hail/.test(c)) return 'frost';
    if (/fog|mist|haze|smoke/.test(c)) return 'fog';
    if (/rain/.test(c)) return 'rain';
    // Drizzle and passing showers read as a sun shower by day, as in the forecast.
    if (/drizzle|shower/.test(c)) return isNight ? 'rain' : 'sun-shower';
    if (/overcast|broken|mostly cloudy/.test(c)) return 'cloud';
    if (/partly|few|scattered|variable|mostly clear/.test(c)) return isNight ? 'night' : 'sun-cloud';
    if (/cloud/.test(c)) return 'cloud';
    if (/clear|sunny|fine/.test(c)) return isNight ? 'night' : 'sun';
    // Loading, unavailable or unrecognised: no claim of full sun.
    return isNight ? 'night' : 'sun-cloud';
}
