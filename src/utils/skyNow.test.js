import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rainClauseWord, rainListWord, rainNowText, skyLeadSentence, skyNow, skyPillWord } from './skyNow.js';
import { citySkyNow, listSunStatus, MELBOURNE_CBD, sunSentence, venueSunForecast } from './venueSun.js';
import { headerWeatherSummary } from './headerWeatherSummary.js';
import { homeConditions } from './homeConditions.js';
import { homeSheetClause, mapHomeSummary } from './mapHomeSummary.js';
import { venueStatTiles } from './venueStatTiles.js';

// 27 Nov 2026 is daylight time in Melbourne (UTC+11). 3:30pm local:
const NOW = new Date(Date.UTC(2026, 10, 27, 4, 30));
const OFFSET = 11 * 3600;

/**
 * WeatherContext weather for 27 Nov at the CBD: one forecast slot for every
 * hour, and a current reading taken in hour `index` (weatherService marks it
 * with hourly._currentIndex).
 */
function cityWeather({ reading = {}, slot = {}, index = 15 } = {}) {
    const time = Array.from({ length: 24 }, (_, h) => `2026-11-27T${String(h).padStart(2, '0')}:00`);
    const s = { rain: 0, code: 3, cloud: 100, ...slot };
    return {
        source: 'open-meteo',
        main: { temp: 14, humidity: 90 },
        weather: [{ main: 'Clouds', description: 'overcast' }],
        clouds: { all: 100 },
        precipitation: 0,
        precipProbability: s.rain,
        utcOffsetSeconds: OFFSET,
        ...reading,
        hourly: {
            time,
            precipitation_probability: time.map(() => s.rain),
            weather_code: time.map(() => s.code),
            cloud_cover: time.map(() => s.cloud),
            _tzOffsetSeconds: OFFSET,
            _currentIndex: index,
        },
    };
}
const RAINING_READING = { precipitation: 1.6, weather: [{ main: 'Rain', description: 'rain showers' }] };

describe('skyNow', () => {
    it('reads the forecast\'s now and says whether the sky blocks the sun', () => {
        assert.equal(skyNow(null), null);
        assert.equal(skyNow({}), null);
        const sky = skyNow({ now: { kind: 'rain', rain: 'likely', rainChance: 94.6, cloud: 100, code: 3, readingIsCurrent: true } });
        assert.deepEqual(sky, { rain: 'likely', rainChance: 95, kind: 'rain', blocksSun: true, cloud: 100, code: 3, readingIsCurrent: true });
        assert.equal(skyNow({ now: { kind: 'cloud' } }).blocksSun, true);
        assert.equal(skyNow({ now: { kind: 'sun' } }).blocksSun, false);
        assert.equal(skyNow({ now: { kind: 'night', rain: 'raining' } }).blocksSun, false, 'no sun to block after dark');
        assert.equal(skyNow({ now: { kind: 'sun', rain: 'pouring' } }).rain, null, 'unknown rain words are dropped');
    });

    it('says "Raining" only with rain in the reading, else "Rain likely" with the chance', () => {
        assert.equal(rainNowText({ rain: 'raining', rainChance: 90 }), 'Raining');
        assert.equal(rainNowText({ rain: 'likely', rainChance: 95 }), 'Rain likely · 95%');
        assert.equal(rainNowText({ rain: 'likely', rainChance: null }), 'Rain likely');
        assert.equal(rainNowText({ rain: null }), null);
        assert.equal(rainNowText(null), null);
        assert.equal(rainListWord('raining'), 'Rain');
        assert.equal(rainListWord('likely'), 'Rain likely');
        assert.equal(rainListWord(null), 'Rain likely');
        assert.equal(rainClauseWord('raining'), 'raining');
        assert.equal(rainClauseWord('likely'), 'rain likely');
    });

    it('leads a card sentence and the graph pill with the same sky', () => {
        assert.equal(skyLeadSentence({ rain: 'raining', kind: 'rain' }), 'Raining right now.');
        assert.equal(skyLeadSentence({ rain: 'likely', kind: 'rain' }), 'Rain likely right now.');
        assert.equal(skyLeadSentence({ rain: null, kind: 'cloud' }), 'Cloud is blocking the sun right now.');
        assert.equal(skyLeadSentence({ rain: null, kind: 'sun' }), null);
        assert.equal(skyPillWord({ rain: 'raining', kind: 'rain', blocksSun: true }), 'raining');
        assert.equal(skyPillWord({ rain: 'likely', kind: 'rain', blocksSun: true }), 'rain likely');
        assert.equal(skyPillWord({ rain: null, kind: 'cloud', blocksSun: true }), 'cloudy');
        assert.equal(skyPillWord({ rain: null, kind: 'sun', blocksSun: false }), null);
        assert.equal(skyPillWord(null), null);
    });
});

describe('citySkyNow', () => {
    it('is the CBD forecast\'s verdict, and nothing for demo or unavailable weather', () => {
        assert.equal(citySkyNow(null), null);
        assert.equal(citySkyNow({ ...cityWeather(), source: 'demo' }, { now: NOW }), null);
        assert.equal(citySkyNow({ ...cityWeather(), unavailable: true }, { now: NOW }), null);
        assert.deepEqual(
            citySkyNow(cityWeather({ slot: { rain: 95 } }), { now: NOW }),
            skyNow(venueSunForecast({ venue: MELBOURNE_CBD, weather: cityWeather({ slot: { rain: 95 } }), now: NOW })),
        );
        assert.equal(citySkyNow(cityWeather({ slot: { rain: 95 } }), { now: NOW }).rain, 'likely');
        assert.equal(citySkyNow(cityWeather({ reading: RAINING_READING }), { now: NOW }).rain, 'raining');
        assert.equal(citySkyNow(cityWeather({ slot: { rain: 10, code: 1, cloud: 10 } }), { now: NOW }).rain, null);
    });
});

describe('one sky on every screen', () => {
    const cosy = [{ hasCozy: true }, {}];
    const read = (weather) => {
        const sky = citySkyNow(weather, { now: NOW });
        const forecast = venueSunForecast({ venue: { lat: -37.8, lng: 144.98 }, weather, now: NOW });
        return {
            header: headerWeatherSummary(weather, { now: NOW }).condition,
            sheet: homeSheetClause({ venues: cosy, condition: homeConditions(weather, { now: NOW }), summary: mapHomeSummary([5]), rain: sky?.rain })?.text,
            list: listSunStatus(forecast).text,
            tile: venueStatTiles({ venue: {}, forecast })[0].value,
            sentence: sunSentence(forecast),
        };
    };

    it('a 95% hour with an overcast, dry reading: rain likely everywhere (the critique\'s case)', () => {
        assert.deepEqual(read(cityWeather({ slot: { rain: 95 } })), {
            header: 'Rain likely',
            sheet: 'rain likely · 1 cosy and dry',
            list: 'Rain likely · no more sun today',
            tile: 'Rain likely · 95%',
            sentence: 'Rain likely right now. No more direct sun is forecast today.',
        });
    });

    it('rain in the reading: raining everywhere, in its own words on the header', () => {
        assert.deepEqual(read(cityWeather({ slot: { rain: 90, code: 63 }, reading: RAINING_READING })), {
            header: 'Rain showers',
            sheet: 'raining · 1 cosy and dry',
            list: 'Rain · no more sun today',
            tile: 'Raining',
            sentence: 'Raining right now. No more direct sun is forecast today.',
        });
    });

    it('rain in the reading on a dry forecast hour still reads as raining, so the header and rows agree', () => {
        const weather = cityWeather({ slot: { rain: 10, code: 1, cloud: 10 }, reading: { precipitation: 0.3 } });
        const seen = read(weather);
        assert.equal(seen.header, 'Raining');
        assert.equal(seen.sheet, 'raining · 1 cosy and dry');
        assert.match(seen.list, /^Rain · sun from 4pm$/);
        assert.equal(seen.tile, 'Raining');
    });

    it('a dry hour reads dry everywhere', () => {
        const seen = read(cityWeather({ slot: { rain: 5, code: 1, cloud: 10 }, reading: { weather: [{ main: 'Clouds', description: 'mostly clear' }], clouds: { all: 10 } } }));
        assert.equal(seen.header, 'Mostly clear');
        assert.doesNotMatch(seen.sheet ?? '', /rain/);
        assert.match(seen.list, /^Sunny/);
        assert.match(seen.tile, /^Sun until/);
    });
});
