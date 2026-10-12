import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSunForecast, formatDuration, formatHour } from './sunForecastState.js';

// 13 Oct 2026 is daylight time in Melbourne: UTC+11.
const AEDT = 11 * 3600;
const SUNRISE = 6.5;
const SUNSET = 19 + 40 / 60;

/** Melbourne wall-clock hour on 13 Oct → the matching UTC instant. */
const at = (hour, minute = 0) => new Date(Date.UTC(2026, 9, 13, hour - 11, minute));

/** Hourly block for 12–14 Oct, filled per local hour on the 13th. */
function hourlyFor(slotFor) {
  const time = [];
  const cloud_cover = [];
  const precipitation_probability = [];
  const weather_code = [];
  for (const day of ['2026-10-12', '2026-10-13', '2026-10-14']) {
    for (let h = 0; h < 24; h += 1) {
      const slot = day === '2026-10-13' ? slotFor(h) : { cloud: 100, rain: 100, code: 63 };
      time.push(`${day}T${String(h).padStart(2, '0')}:00`);
      cloud_cover.push(slot.cloud);
      precipitation_probability.push(slot.rain);
      weather_code.push(slot.code ?? 1);
    }
  }
  return { time, cloud_cover, precipitation_probability, weather_code, _tzOffsetSeconds: AEDT };
}

const rainyMorningClearAfternoon = hourlyFor((h) => (h < 12
  ? { cloud: 95, rain: 80, code: 61 }
  : { cloud: 10, rain: 5, code: 1 }));

const base = { sunrise: SUNRISE, sunset: SUNSET };

describe('deriveSunForecast', () => {
  it('rainy morning: card, headline and bar all say rain, with sun from noon', () => {
    const f = deriveSunForecast({ ...base, hourly: rainyMorningClearAfternoon, now: at(10, 30) });
    assert.equal(f.now.kind, 'rain');
    assert.equal(f.hours[9].kind, 'rain');
    assert.equal(f.hours[13].kind, 'sun');
    assert.equal(f.nextSunHour, 12);
    assert.equal(f.sunMinutesLeft, 7 * 60 + 40);
    assert.equal(f.headline.text, 'Rain now · sun from 12pm');
  });

  it('clear afternoon: direct sun runs to sunset and the headline counts what is left', () => {
    const f = deriveSunForecast({ ...base, hourly: rainyMorningClearAfternoon, now: at(14) });
    assert.equal(f.now.kind, 'sun');
    assert.equal(f.sunUntil, SUNSET);
    assert.equal(f.sunMinutesLeft, 5 * 60 + 40);
    assert.equal(f.sunMinutesToday, 7 * 60 + 40);
    assert.equal(f.headline.text, '5h 40m of direct sun left today');
    assert.equal(f.headline.tone, 'sun');
  });

  it('overcast all day: never claims direct sun (the reported contradiction)', () => {
    const hourly = hourlyFor(() => ({ cloud: 90, rain: 10, code: 3 }));
    const f = deriveSunForecast({ ...base, hourly, now: at(11, 15) });
    assert.equal(f.now.kind, 'cloud');
    assert.equal(f.sunMinutesToday, 0);
    assert.equal(f.sunMinutesLeft, 0);
    assert.equal(f.headline.text, 'No direct sun left today');
    assert.ok(f.hours.every((s) => s.kind !== 'sun'));
  });

  it('reads the Melbourne date, not the UTC date, when picking today\'s hours', () => {
    // 09:00 AEDT on the 13th is 22:00 UTC on the 12th, whose hours are all rain.
    const f = deriveSunForecast({ ...base, hourly: hourlyFor(() => ({ cloud: 5, rain: 0 })), now: at(9) });
    assert.equal(f.now.kind, 'sun');
    assert.equal(Math.round(f.nowHour * 60), 9 * 60);
  });

  it('uses the hourly forecast over a flickering 15-minute rain reading', () => {
    const f = deriveSunForecast({
      ...base,
      hourly: rainyMorningClearAfternoon,
      now: at(15),
      current: { isRaining: true, cloudCover: 90 },
    });
    assert.equal(f.now.kind, 'sun');
  });

  it('accepts sunrise and sunset instants and converts them to Melbourne time', () => {
    const f = deriveSunForecast({
      hourly: rainyMorningClearAfternoon,
      now: at(14),
      sunrise: at(6, 30),
      sunset: at(19, 40),
    });
    assert.equal(f.sunriseHour, SUNRISE);
    assert.equal(f.sunsetHour, SUNSET);
    assert.equal(f.sunMinutesLeft, 5 * 60 + 40);
  });

  it('shade wins over sun for the card but does not change the day\'s sun count', () => {
    const f = deriveSunForecast({ ...base, hourly: rainyMorningClearAfternoon, now: at(14), shaded: true });
    assert.equal(f.now.kind, 'shaded');
    assert.equal(f.sunMinutesToday, 7 * 60 + 40);
  });

  it('when shaded it does not promise a time the sun comes back', () => {
    const f = deriveSunForecast({ ...base, hourly: rainyMorningClearAfternoon, now: at(10, 30), shaded: true });
    assert.equal(f.headline.text, '7h 40m of direct sun left today');
  });

  it('light drizzle codes at low rain chances are not rain (13 Oct CBD forecast)', () => {
    // Real Open-Meteo values: weather_code 51 from 11:00 to 15:00 at 6–51%.
    const real = {
      11: { cloud: 56, rain: 6, code: 51 },
      12: { cloud: 100, rain: 21, code: 51 },
      13: { cloud: 85, rain: 40, code: 51 },
      14: { cloud: 97, rain: 51, code: 51 },
      15: { cloud: 95, rain: 48, code: 51 },
    };
    const hourly = hourlyFor((h) => real[h] ?? { cloud: 40, rain: 0, code: 2 });
    const f = deriveSunForecast({ ...base, hourly, now: at(8, 45) });
    assert.equal(f.hours[11].kind, 'sun');
    assert.equal(f.hours[12].kind, 'cloud');
    assert.equal(f.hours[13].kind, 'cloud');
    assert.equal(f.hours[14].kind, 'rain', '51% chance is rain');
    assert.equal(f.hours[15].kind, 'cloud');
    // Heavier codes still count from a 30% chance.
    const showers = hourlyFor((h) => (h === 13 ? { cloud: 80, rain: 35, code: 80 } : { cloud: 20, rain: 0, code: 1 }));
    assert.equal(deriveSunForecast({ ...base, hourly: showers, now: at(9) }).hours[13].kind, 'rain');
  });

  it('without hourly data it reports daylight, not direct sun', () => {
    const noData = { ...base, hourly: null, utcOffsetSeconds: AEDT, now: at(12) };
    const f = deriveSunForecast({ ...noData, current: { cloudCover: 20 } });
    assert.equal(f.hasHourly, false);
    assert.equal(f.sunMinutesLeft, null);
    assert.equal(f.now.kind, 'unknown');
    assert.equal(f.headline.text, '7h 40m of daylight left');
    assert.equal(deriveSunForecast({ ...noData, current: { isRaining: true } }).now.kind, 'rain');
  });

  it('handles before sunrise and after sunset', () => {
    const early = deriveSunForecast({ ...base, hourly: rainyMorningClearAfternoon, now: at(5) });
    assert.equal(early.now.kind, 'night');
    assert.equal(early.headline.text, "Sun's up at 6:30am");
    const late = deriveSunForecast({ ...base, hourly: rainyMorningClearAfternoon, now: at(21) });
    assert.equal(late.now.kind, 'night');
    assert.equal(late.headline.text, 'Sun has set for the day');
    assert.equal(late.sunMinutesLeft, 0);
  });
});

describe('formatting', () => {
  it('formats hours and durations', () => {
    assert.equal(formatHour(12), '12pm');
    assert.equal(formatHour(6.5), '6:30am');
    assert.equal(formatHour(SUNSET), '7:40pm');
    assert.equal(formatDuration(45), '45m');
    assert.equal(formatDuration(120), '2h');
    assert.equal(formatDuration(460), '7h 40m');
  });
});
