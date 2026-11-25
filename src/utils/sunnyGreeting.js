/**
 * Sunny's greeting and the one weather line under "Ask Sunny".
 *
 * The line says the city weather once ("Melbourne now: 16°, mostly clear,
 * light breeze"), so the greeting doesn't repeat the temperature. Rain, high
 * UV and strong wind still change the greeting's advice. No emoji.
 */

import { readChatWeather } from './chatWeather.js';
import { describeCloud, describeWind } from './headerWeatherSummary.js';

const HELLO = "G'day! I'm Sunny.";
const ASK = 'What are you after?';

/** @param {object|null} weather WeatherContext weather */
export function sunnyGreeting(weather) {
    const cw = readChatWeather(weather);
    if (!cw.available) return `${HELLO} Live weather isn't available right now, but tell me what kind of spot you're after.`;
    if (cw.isRain) return `${HELLO} With rain about, I'd pick somewhere cosy and covered. ${ASK}`;
    if ((cw.uv ?? 0) >= 8) return `${HELLO} UV is at ${cw.uv} right now, so I'd pick shade or cover. ${ASK}`;
    if ((cw.windKmh ?? 0) > 30) return `${HELLO} It's windy out there, so I'd pick somewhere sheltered. ${ASK}`;
    return `${HELLO} What kind of spot are you after?`;
}

/**
 * "Melbourne now: 16°, mostly clear, light breeze", or null when there is no
 * live weather (a demo or failed reading is never shown as the forecast).
 *
 * @param {object|null} weather WeatherContext weather
 */
export function sunnyWeatherLine(weather) {
    const cw = readChatWeather(weather);
    if (!cw.available) return null;
    const parts = [
        cw.temp == null ? null : `${cw.temp}°`,
        cw.isRain ? 'raining' : describeCloud(cw.cloud)?.toLowerCase(),
        describeWind(cw.windKmh)?.toLowerCase(),
    ].filter(Boolean);
    return parts.length ? `Melbourne now: ${parts.join(', ')}` : null;
}
