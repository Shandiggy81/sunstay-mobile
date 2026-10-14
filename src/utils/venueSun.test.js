import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasObstacleData, hourlyStrip, listSunStatus, sunSentence, sunStatText, venueFeelsLike, venueSunForecast } from './venueSun.js';
import { calculateApparentTemp, getWindProfile } from '../data/windIntelligence.js';
import { heroSunChip } from './sunForecastState.js';

// Melbourne daylight time, 14 Oct 2026: UTC+11.
const OFFSET = 11 * 3600;
const SUN_TIMES = { sunriseDate: 6.5, sunsetDate: 19.5 };
const VENUE = { id: 'v1', lat: -37.81, lng: 144.96 };

// Local wall-clock hour -> UTC Date on 14 Oct 2026.
const at = (hour, minute = 0) => new Date(Date.UTC(2026, 9, 14, hour - 11, minute));

// Sunny 7am–2pm, cloud 2pm–5pm, sunny again 5pm–7pm. Rain chance peaks at 3pm.
function weatherFixture({ withIsDay = true } = {}) {
    const time = [];
    const cloud = [];
    const rain = [];
    const temp = [];
    const code = [];
    const isDay = [];
    for (const day of ['2026-10-14', '2026-10-15']) {
        for (let h = 0; h < 24; h += 1) {
            time.push(`${day}T${String(h).padStart(2, '0')}:00`);
            const cloudy = h >= 14 && h < 17;
            cloud.push(cloudy ? 85 : 10);
            rain.push(h === 15 ? 40 : 5);
            temp.push(10 + h / 2);
            code.push(cloudy ? 3 : 1);
            isDay.push(h >= 7 && h < 20 ? 1 : 0);
        }
    }
    return {
        utcOffsetSeconds: OFFSET,
        hourly: {
            time,
            cloud_cover: cloud,
            precipitation_probability: rain,
            temperature_2m: temp,
            weather_code: code,
            ...(withIsDay ? { is_day: isDay } : {}),
        },
    };
}

const forecastAt = (hour, minute = 0, weather = weatherFixture()) =>
    venueSunForecast({ venue: VENUE, weather, now: at(hour, minute), sunTimes: SUN_TIMES });

describe('venueSunForecast text', () => {
    it('says when the sun ends while it is sunny', () => {
        const f = forecastAt(10, 30);
        assert.equal(sunStatText(f), 'Sun until 2pm');
        assert.equal(listSunStatus(f).text, 'Sunny · until 2pm');
        assert.equal(listSunStatus(f).icon, 'sun');
        assert.match(sunSentence(f), /^Sunny now until 2pm\. About \d+h( \d+m)? of direct sun left today\.$/);
    });

    it('says when the sun returns while it is cloudy', () => {
        const f = forecastAt(14, 30);
        assert.equal(sunStatText(f), 'Sun returns 5pm');
        assert.deepEqual(listSunStatus(f), { text: 'Cloudy · sun from 5pm', icon: 'cloud' });
        assert.equal(sunSentence(f), 'Cloud is blocking the sun right now. Sun returns around 5pm.');
    });

    it('handles before sunrise and after sunset', () => {
        const early = forecastAt(5);
        assert.equal(sunStatText(early), 'Sun up 6:30am');
        assert.equal(listSunStatus(early).text, 'Sun up 6:30am');
        assert.match(sunSentence(early), /^The sun's up at 6:30am\. Expect about .+ of direct sun today\.$/);

        const late = forecastAt(21);
        assert.equal(sunStatText(late), 'Sun has set');
        assert.deepEqual(listSunStatus(late), { text: 'After dark', icon: 'night' });
        assert.match(sunSentence(late), /^The sun has set\. Today had about .+ of direct sun\.$/);
    });

    it('falls back to sunset time without an hourly forecast', () => {
        const f = forecastAt(12, 0, { hourly: null, utcOffsetSeconds: OFFSET });
        assert.equal(sunStatText(f), 'Sunset 7:30pm');
        assert.equal(sunSentence(f), '7h 30m of daylight left. Sunset is at 7:30pm.');
        assert.equal(listSunStatus(f).text, 'Daylight · sunset 7:30pm');
    });

    it('never disagrees: stat, sentence, list and hero chip read one forecast', () => {
        for (let minutes = 6 * 60; minutes < 21 * 60; minutes += 20) {
            const f = forecastAt(Math.floor(minutes / 60), minutes % 60);
            const stat = sunStatText(f);
            const sentence = sunSentence(f);
            const list = listSunStatus(f).text;
            const returns = /^Sun returns (.+)$/.exec(stat);
            if (returns) {
                assert.ok(sentence.includes(`Sun returns around ${returns[1]}`), `${stat} / ${sentence}`);
                assert.ok(list.endsWith(`sun from ${returns[1]}`), `${stat} / ${list}`);
            }
            const until = /^Sun until (.+)$/.exec(stat);
            if (until) {
                assert.ok(sentence.startsWith(`Sunny now until ${until[1]}`), `${stat} / ${sentence}`);
                assert.equal(list, `Sunny · until ${until[1]}`);
            }
            const chip = heroSunChip(f);
            assert.equal(chip.hours * 60, f.sunMinutesToday, 'hero chip uses the same minutes');
        }
    });

    it('marks a venue shaded only when it has surveyed surroundings', () => {
        assert.equal(hasObstacleData(VENUE), false);
        assert.equal(hasObstacleData({ obstacle_height: 20, obstacle_distance: '5' }), true);
        const open = forecastAt(12);
        assert.notEqual(open.now.kind, 'shaded', 'no 2 m-at-1 m default shade');
    });

    it('ignores the Supabase default obstacle (2 m at 1 m)', () => {
        assert.equal(hasObstacleData({ obstacle_height: 2, obstacle_distance: 1 }), false);
        assert.equal(hasObstacleData({ obstacle_height: '2', obstacle_distance: '1' }), false);
        assert.equal(hasObstacleData({ obstacle_height: 2.0, obstacle_distance: '1.0' }), false);
        assert.equal(hasObstacleData({ obstacle_height: 20, obstacle_distance: 5 }), true);
        assert.equal(hasObstacleData({ obstacle_height: 2, obstacle_distance: 5 }), true, 'only the exact default pair is ignored');
        assert.equal(hasObstacleData({ obstacle_height: 2 }), false);

        // A live row with the defaults, at noon with the sun about 60° up:
        // the default would shade it, so it must follow the forecast instead.
        const supabaseRow = venueSunForecast({
            venue: { ...VENUE, obstacle_height: 2, obstacle_distance: 1 },
            weather: weatherFixture(),
            now: at(12),
            sunTimes: SUN_TIMES,
        });
        assert.equal(supabaseRow.now.kind, 'sun');
        assert.equal(sunStatText(supabaseRow), 'Sun until 2pm');
        assert.equal(listSunStatus(supabaseRow).text, 'Sunny · until 2pm');

        const walled = venueSunForecast({
            venue: { ...VENUE, obstacle_height: 400, obstacle_distance: 1 },
            weather: weatherFixture(),
            now: at(12),
            sunTimes: SUN_TIMES,
        });
        assert.equal(walled.now.kind, 'shaded');
        assert.equal(sunStatText(walled), 'Shaded now');
        assert.deepEqual(listSunStatus(walled), { text: 'Shaded', icon: 'shaded' });
        assert.match(sunSentence(walled), /^Shaded by nearby buildings right now/);
    });

    it('copes with no venue, no weather and no sun times', () => {
        const f = venueSunForecast({ venue: null, weather: null, now: at(12), sunTimes: null });
        assert.equal(sunStatText(f), 'Sun times unavailable');
        assert.equal(sunSentence(f), "Sun times aren't available right now.");
        assert.deepEqual(listSunStatus(f), { text: 'Sun times unavailable', icon: 'sun-cloud' });
    });
});

describe('hourlyStrip', () => {
    it('starts at the current hour and labels it Now', () => {
        const items = hourlyStrip(weatherFixture(), { now: at(14, 40) });
        assert.equal(items.length, 12);
        assert.equal(items[0].label, 'Now');
        assert.equal(items[0].isNow, true);
        assert.equal(items[0].key, '2026-10-14T14:00');
        assert.equal(items[1].label, '3pm');
        assert.equal(items[1].rainChance, 40);
        assert.equal(items[0].temp, 17);
        assert.equal(items[0].icon, 'cloud');
        assert.equal(items.filter((i) => i.isNow).length, 1);
    });

    it('uses night icons after dark and crosses midnight', () => {
        const items = hourlyStrip(weatherFixture(), { now: at(19, 10), count: 8 });
        assert.equal(items[0].icon, 'sun', '7pm is still day');
        assert.equal(items[1].icon, 'night', '8pm clear night');
        assert.equal(items[5].key, '2026-10-15T00:00');
        assert.equal(items[5].label, '12am');
    });

    it('falls back to the forecast sun times when is_day is missing', () => {
        const weather = weatherFixture({ withIsDay: false });
        const forecast = venueSunForecast({ venue: VENUE, weather, now: at(19), sunTimes: SUN_TIMES });
        const items = hourlyStrip(weather, { now: at(19), count: 2, forecast });
        assert.equal(items[0].icon, 'sun', '7pm: sun sets at 7:30pm');
        assert.equal(items[1].icon, 'night');
    });

    it('returns nothing without a matching hour', () => {
        assert.deepEqual(hourlyStrip(null), []);
        assert.deepEqual(hourlyStrip({ hourly: { time: [] } }), []);
        assert.deepEqual(hourlyStrip(weatherFixture(), { now: new Date(Date.UTC(2030, 0, 1)) }), []);
    });
});

describe('venueFeelsLike', () => {
    it('applies the venue shelter, the same number the list row shows', () => {
        const weather = { main: { temp: 13, humidity: 70 }, wind: { speed: 4.2 } };
        const venue = { id: 'dv-07', vibe: 'Food Truck Park' };
        const expected = Math.round(calculateApparentTemp(13, 4.2, 70, getWindProfile(venue).shelterFactor));
        assert.equal(venueFeelsLike(venue, weather), expected);
        assert.equal(venueFeelsLike(venue, null), null);
        assert.equal(venueFeelsLike(null, { main: {} }), null);
    });
});
