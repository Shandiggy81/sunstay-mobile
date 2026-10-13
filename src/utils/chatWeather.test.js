import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chatTempText, chatUvText, readChatWeather } from './chatWeather.js';

// Shape returned by weatherService.fetchOpenMeteoWeatherLive.
const live = {
  main: { temp: 13.4 },
  uvi: 3.2,
  clouds: { all: 40 },
  cloudCoverPct: 40,
  weather: [{ main: 'Clouds', description: 'partly cloudy' }],
  windKmh: 18,
  precipitation: 0,
  source: 'open-meteo',
};

describe('readChatWeather', () => {
  it('reads the fields WeatherContext provides', () => {
    const cw = readChatWeather(live);
    assert.deepEqual(cw, { available: true, temp: 13, uv: 3, cloud: 40, windKmh: 18, isRain: false });
    assert.equal(chatTempText(cw), '13°C');
    assert.equal(chatUvText(cw), "UV's at 3 right now");
  });

  it('detects rain from the condition or a real amount of rain', () => {
    assert.equal(readChatWeather({ ...live, weather: [{ main: 'Drizzle', description: 'light drizzle' }] }).isRain, true);
    assert.equal(readChatWeather({ ...live, precipitation: 0.4 }).isRain, true);
    assert.equal(readChatWeather({ ...live, precipitation: 0.1 }).isRain, false);
  });

  it('returns nulls, not fake defaults, when values are missing', () => {
    const cw = readChatWeather({ source: 'open-meteo', weather: [] });
    assert.equal(cw.available, false);
    assert.equal(cw.temp, null);
    assert.equal(cw.uv, null);
    assert.equal(chatTempText(cw), null);
    assert.equal(chatUvText(cw), "UV isn't available right now");
  });

  it('treats the demo fallback, unavailable weather and no weather as unavailable', () => {
    assert.equal(readChatWeather({ ...live, source: 'demo' }).available, false);
    assert.equal(readChatWeather({ ...live, unavailable: true }).available, false);
    assert.equal(readChatWeather(null).available, false);
  });

  it('ignores the never-set weather.current fields', () => {
    const cw = readChatWeather({ current: { temp: 20, uvIndex: 0 } });
    assert.equal(cw.temp, null);
    assert.equal(cw.uv, null);
  });
});
