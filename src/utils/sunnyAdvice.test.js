import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sunnyAdvice } from './sunnyAdvice.js';
import { headerWeatherSummary } from './headerWeatherSummary.js';
import { presentWind } from './presentWind.js';

const live = (overrides = {}) => ({
    main: { temp: 27.4, humidity: 40 },
    weather: [{ main: 'Clear', description: 'clear sky' }],
    clouds: { all: 5 },
    wind: { speed: 3 },
    precipProbability: 5,
    ...overrides,
});

describe('sunnyAdvice', () => {
    it('quotes exactly the temperature the header shows', () => {
        const weather = live();
        const header = headerWeatherSummary(weather, { windView: presentWind(weather) });
        const advice = sunnyAdvice(weather);
        assert.equal(header.temperature, '27°');
        assert.ok(advice.text.startsWith('27°'), advice.text);
        assert.equal(advice.basis, 'live');
    });

    it('never invents 22° when weather is the demo fallback', () => {
        const demo = live({ main: { temp: 22 }, source: 'demo', unavailable: true });
        const advice = sunnyAdvice(demo);
        assert.equal(advice.basis, 'unavailable');
        assert.doesNotMatch(advice.text, /\d+°/);
    });

    it('does not invent a reading when the temperature is missing', () => {
        const advice = sunnyAdvice(live({ main: {} }));
        assert.equal(advice.basis, 'unavailable');
        assert.doesNotMatch(advice.text, /\d+°/);
    });

    it('shows a loading line before weather arrives', () => {
        assert.equal(sunnyAdvice(null).basis, 'loading');
    });

    it('does not call a rainy day perfect for a stroll', () => {
        const advice = sunnyAdvice(live({ weather: [{ main: 'Rain', description: 'light rain' }], precipProbability: 80 }));
        assert.match(advice.text, /wet/);
        assert.doesNotMatch(advice.text, /sunny|stroll/i);
    });

    it('warns about storms before anything else', () => {
        const advice = sunnyAdvice(live({ weather: [{ main: 'Thunderstorm' }], wind: { speed: 15 } }));
        assert.match(advice.text, /storms/);
    });

    it('suggests shelter when it is windy', () => {
        const advice = sunnyAdvice(live({ windKmh: 38 }));
        assert.match(advice.text, /windy/);
    });

    it('handles hot, chilly and cloudy days', () => {
        assert.match(sunnyAdvice(live({ main: { temp: 34 } })).text, /^34° and hot/);
        assert.match(sunnyAdvice(live({ main: { temp: 9 } })).text, /chilly 9°/);
        assert.match(sunnyAdvice(live({ weather: [{ main: 'Clouds' }], clouds: { all: 85 } })).text, /cloudy/);
    });

    it('a venue pro tip wins over weather', () => {
        const advice = sunnyAdvice(live(), { proTip: '  Grab the corner table at 3pm. ' });
        assert.equal(advice.text, 'Pro tip: Grab the corner table at 3pm.');
        assert.equal(advice.basis, 'tip');
    });

    it('ignores a blank pro tip', () => {
        assert.equal(sunnyAdvice(live(), { proTip: '   ' }).basis, 'live');
    });
});
