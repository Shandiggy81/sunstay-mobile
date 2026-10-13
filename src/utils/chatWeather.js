/**
 * What Sunny's chat can truthfully say about the weather, read from the
 * WeatherContext object (weatherService: main.temp, uvi, cloudCoverPct /
 * clouds.all, weather[0].main). Missing values are null, never a default:
 * the chat used to read weather.current.*, which is never set, so it always
 * said 20°C and UV 0.
 */

import { chatWindKmh } from './windUnits.js';

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function readChatWeather(weather) {
  const empty = { available: false, temp: null, uv: null, cloud: null, windKmh: null, isRain: false };
  if (!weather || typeof weather !== 'object' || weather.unavailable || weather.source === 'demo') return empty;

  const temp = finite(weather.main?.temp) ?? finite(weather.temp);
  const uv = finite(weather.uvi) ?? finite(weather.uvIndex);
  const cloud = finite(weather.cloudCoverPct) ?? finite(weather.clouds?.all);
  const condition = `${weather.weather?.[0]?.main ?? ''} ${weather.weather?.[0]?.description ?? ''}`;
  const isRain = /rain|drizzle|shower|thunder/i.test(condition) || (finite(weather.precipitation) ?? 0) >= 0.2;

  return {
    available: temp != null || uv != null || cloud != null,
    temp: temp == null ? null : Math.round(temp),
    uv: uv == null ? null : Math.round(uv),
    cloud,
    windKmh: chatWindKmh(weather),
    isRain,
  };
}

/** "13°C", or null when the temperature is unknown. */
export function chatTempText(cw) {
  return cw?.temp == null ? null : `${cw.temp}°C`;
}

/** "UV's at 3 right now" / "UV isn't available right now". */
export function chatUvText(cw) {
  return cw?.uv == null ? "UV isn't available right now" : `UV's at ${cw.uv} right now`;
}
