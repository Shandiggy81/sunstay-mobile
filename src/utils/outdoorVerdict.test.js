import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FULL_SUN_FRACTION, PART_SUN_FRACTION } from './microclimate.js';
import { outdoorVerdict } from './outdoorVerdict.js';
import { SUNNY_CLEARNESS } from './skyClearness.js';

const hourEntry = (overrides = {}) => ({
    hour: 11,
    sunFraction: 1,
    windLevel: 'green',
    windKmh: 7,
    feelsLike: 21,
    windFrom: 350,
    isDaylight: true,
    ...overrides,
});

const at = (hours, hour) => outdoorVerdict({ hours, index: hours.findIndex(entry => entry.hour === hour) });

function fixture({ sunFraction, windLevel, windKmh, feelsLike }) {
    return sunFraction.map((fraction, index) => {
        const hour = index + 6;
        return hourEntry({
            hour,
            sunFraction: fraction,
            windLevel: windLevel[index],
            windKmh: windKmh[index],
            feelsLike: feelsLike[index],
            windFrom: hour < 16 ? 350 : 230,
            isDaylight: hour < 20,
        });
    });
}

const FIXTURE_A = fixture({
    sunFraction: [0.2, 0.6, 0.8, 0.8, 0.9, 1, 1, 1, 1, 0.9, 0.6, 0.5, 0.5, 0.1, 0, 0],
    windLevel: ['green', ...Array(5).fill('yellow'), ...Array(4).fill('orange'), ...Array(6).fill('green')],
    windKmh: [10, 18, 21, 24, 27, 30, 34, 37, 40, 42, 17, 14, 12, 10, 7, 7],
    feelsLike: [9, 9, 11, 13, 14, 16, 18, 19, 20, 19, 18, 17, 16, 15, 15, 14],
});

const FIXTURE_B = fixture({
    sunFraction: [0.2, 0.7, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.7, 0.5, 0.4, 0.1, 0],
    windLevel: Array(16).fill('green'),
    windKmh: [2, 4, 5, 6, 6, 7, 8, 9, 10, 10, 17, 14, 12, 10, 7, 7],
    feelsLike: [11, 12, 14, 16, 18, 21, 23, 24, 25, 25, 18, 17, 16, 15, 15, 14],
});

describe('outdoorVerdict verdicts', () => {
    const cases = [
        ['sun', 1, true, ['Sunny and calm', 'Sunny, a bit breezy', 'Sunny but windy', 'Sunny but windy']],
        ['part', 0.6, true, ['Part sun and calm', 'Part sun, a bit breezy', 'Part sun and windy', 'Part sun and windy']],
        ['shade', 0.1, true, ['In shade, calm', 'In shade and breezy', 'In shade and windy', 'In shade and windy']],
        ['dark', 1, false, ['After dark, calm', 'After dark, breezy', 'After dark, windy', 'After dark, very windy']],
    ];

    for (const [state, sunFraction, isDaylight, verdicts] of cases) {
        for (const [index, windLevel] of ['green', 'yellow', 'orange', 'red'].entries()) {
            it(`${state} with ${windLevel} wind reads ${verdicts[index]}`, () => {
                const result = outdoorVerdict({ hours: [hourEntry({ sunFraction, isDaylight, windLevel })], index: 0 });
                assert.equal(result.state, state);
                assert.equal(result.verdict, verdicts[index]);
            });
        }
    }
});

describe('outdoorVerdict sun sentences', () => {
    const cases = [
        ['Full sun until 12pm.', [1, 1, 0.5], 12],
        ['Full sun for the rest of the day.', [1, 1, 1], null],
        ['Full sun from 12pm.', [0.5, 0.5, 1], 12],
        ['Part sun until 12pm.', [0.5, 0.5, 0.1], 12],
        ['Part sun for the rest of the day.', [0.5, 0.5, 0.5], null],
        ['Sun from 12pm.', [0.1, 0.1, 0.5], 12],
        ['Sun from 12pm.', [0.1, 0.1, 1], 12],
        ['No more sun here today.', [0.1, 0.1, 0], null],
    ];

    for (const [sentence, fractions, changeHour] of cases) {
        it(sentence, () => {
            const hours = fractions.map((sunFraction, index) => hourEntry({ hour: 10 + index, sunFraction }));
            const result = outdoorVerdict({ hours, index: 0 });
            assert.equal(result.detail, `${sentence} Feels 21\u00b0 with 7 km/h from the north.`);
            assert.equal(result.changeHour, changeHour);
        });
    }

    it('describes night even when the sun fraction is high', () => {
        const result = outdoorVerdict({ hours: [hourEntry({ isDaylight: false })], index: 0 });
        assert.equal(result.detail, 'The sun is down. Feels 21\u00b0 with 7 km/h from the north.');
        assert.equal(result.changeHour, null);
    });

    it('counts sunset as a state change', () => {
        const hours = [hourEntry({ hour: 19 }), hourEntry({ hour: 20, isDaylight: false })];
        assert.equal(at(hours, 19).changeHour, 20);
        assert.equal(at(hours, 19).detail, 'Full sun until 8pm. Feels 21\u00b0 with 7 km/h from the north.');
    });

    it('ignores wind-only changes when finding the next sun state', () => {
        const hours = [hourEntry(), hourEntry({ hour: 12, windLevel: 'red' }), hourEntry({ hour: 13, sunFraction: 0.1 })];
        assert.equal(at(hours, 11).changeHour, 13);
    });

    it('finds the next change beyond the six displayed slots', () => {
        const hours = Array.from({ length: 10 }, (_, index) => hourEntry({
            hour: 6 + index,
            sunFraction: index < 8 ? 1 : 0.1,
        }));
        const result = outdoorVerdict({ hours, index: 0 });
        assert.equal(result.changeHour, 14);
        assert.equal(result.slots.length, 6);
        assert.equal(result.detail, 'Full sun until 2pm. Feels 21\u00b0 with 7 km/h from the north.');
    });

    it('does not promise tomorrow morning sun after sunset', () => {
        const hours = [hourEntry({ hour: 19, sunFraction: 0 }), hourEntry({ hour: 20, isDaylight: false }), hourEntry({ hour: 6 })];
        const result = outdoorVerdict({ hours, index: 0 });
        assert.equal(result.detail, 'No more sun here today. Feels 21\u00b0 with 7 km/h from the north.');
        assert.equal(result.changeHour, 20);
    });
});

describe('outdoorVerdict shared microclimate bands', () => {
    it('uses the exported full-sun and partial-sun thresholds', () => {
        assert.equal(FULL_SUN_FRACTION, 0.75);
        assert.equal(PART_SUN_FRACTION, 0.4);
        assert.equal(outdoorVerdict({ hours: [hourEntry({ sunFraction: FULL_SUN_FRACTION })], index: 0 }).state, 'sun');
        assert.equal(outdoorVerdict({ hours: [hourEntry({ sunFraction: PART_SUN_FRACTION })], index: 0 }).state, 'part');
    });

    for (const [sunFraction, state] of [
        [0, 'shade'], [0.3, 'shade'], [0.3999, 'shade'],
        [0.4, 'part'], [0.7, 'part'], [0.7499, 'part'], [0.75, 'sun'], [1, 'sun'],
    ]) {
        it(`classifies ${sunFraction} as ${state} using the shared thresholds`, () => {
            assert.equal(outdoorVerdict({ hours: [hourEntry({ sunFraction })], index: 0 }).state, state);
        });
    }
});

describe('outdoorVerdict wind sentences', () => {
    for (const [windFrom, direction] of [
        [0, 'north'], [45, 'north-east'], [90, 'east'], [135, 'south-east'],
        [180, 'south'], [225, 'south-west'], [270, 'west'], [315, 'north-west'],
        [350, 'north'], [230, 'south-west'], [360, 'north'], [-10, 'north'],
        [22.49, 'north'], [22.5, 'north-east'], [337.5, 'north'],
    ]) {
        it(`names wind from ${windFrom} degrees as ${direction}`, () => {
            const result = outdoorVerdict({ hours: [hourEntry({ windFrom })], index: 0 });
            assert.ok(result.detail.endsWith(`Feels 21\u00b0 with 7 km/h from the ${direction}.`));
        });
    }

    it('handles a null direction and rounds the supplied feels-like and km/h numbers', () => {
        const result = outdoorVerdict({ hours: [hourEntry({ windFrom: null, feelsLike: 15.6, windKmh: 29.8 })], index: 0 });
        assert.equal(result.detail, 'Full sun for the rest of the day. Feels 16\u00b0 with 30 km/h of wind.');
    });

    it('accepts zero wind and a negative feels-like temperature', () => {
        const result = outdoorVerdict({ hours: [hourEntry({ windKmh: 0, feelsLike: -2 })], index: 0 });
        assert.ok(result.detail.endsWith('Feels -2\u00b0 in still air.'));
    });

    it('describes still air with a null direction', () => {
        const result = outdoorVerdict({ hours: [hourEntry({ windKmh: 0, windFrom: null })], index: 0 });
        assert.equal(result.detail, 'Full sun for the rest of the day. Feels 21\u00b0 in still air.');
    });

    it('uses still-air copy exactly when the rounded wind speed is zero', () => {
        for (const windFrom of [null, 350]) {
            const still = outdoorVerdict({ hours: [hourEntry({ windKmh: 0.49, windFrom })], index: 0 });
            assert.ok(still.detail.endsWith('Feels 21\u00b0 in still air.'));
            const breeze = outdoorVerdict({ hours: [hourEntry({ windKmh: 0.5, windFrom })], index: 0 });
            assert.ok(breeze.detail.includes('Feels 21\u00b0 with 1 km/h'));
        }
    });
});

describe('outdoorVerdict slots', () => {
    it('starts at the selected index, includes six hours and labels each state and wind level', () => {
        const hours = [
            hourEntry({ hour: 8 }),
            hourEntry({ hour: 9 }),
            hourEntry({ hour: 10, windLevel: 'yellow' }),
            hourEntry({ hour: 11, sunFraction: 0.5, windLevel: 'orange' }),
            hourEntry({ hour: 12, sunFraction: 0.1, windLevel: 'red' }),
            hourEntry({ hour: 13, isDaylight: false, windLevel: 'yellow' }),
            hourEntry({ hour: 14, windLevel: 'orange' }),
            hourEntry({ hour: 15 }),
        ];
        assert.deepEqual(outdoorVerdict({ hours, index: 1 }).slots, [
            { hour: 9, label: '9am', words: 'Sunny \u00b7 Calm', good: true },
            { hour: 10, label: '10am', words: 'Sunny \u00b7 Breezy', good: true },
            { hour: 11, label: '11am', words: 'Part sun \u00b7 Windy', good: false },
            { hour: 12, label: '12pm', words: 'In shade \u00b7 Very windy', good: false },
            { hour: 13, label: '1pm', words: 'Before sunrise \u00b7 Breezy', good: false },
            { hour: 14, label: '2pm', words: 'Sunny \u00b7 Windy', good: false },
        ]);
    });

    it('marks only full sun with green or yellow wind as good', () => {
        for (const sunFraction of [1, 0.5, 0.1]) {
            for (const windLevel of ['green', 'yellow', 'orange', 'red']) {
                const result = outdoorVerdict({ hours: [hourEntry({ sunFraction, windLevel })], index: 0 });
                assert.equal(result.slots[0].good, sunFraction === 1 && ['green', 'yellow'].includes(windLevel));
            }
        }
        assert.equal(outdoorVerdict({ hours: [hourEntry({ isDaylight: false })], index: 0 }).slots[0].good, false);
    });

    it('returns fewer than six slots near the end', () => {
        assert.equal(at(FIXTURE_A, 19).slots.length, 3);
        assert.deepEqual(at(FIXTURE_A, 21), {
            state: 'dark',
            verdict: 'After dark, calm',
            detail: 'The sun is down. Feels 14\u00b0 with 7 km/h from the south-west.',
            changeHour: null,
            slots: [{ hour: 21, label: '9pm', words: 'After dark \u00b7 Calm', good: false }],
        });
    });

    it('formats midnight as 12am', () => {
        assert.equal(outdoorVerdict({ hours: [hourEntry({ hour: 0, isDaylight: false })], index: 0 }).slots[0].label, '12am');
    });
});

describe('outdoorVerdict invalid inputs', () => {
    it('returns null for missing hours, entries and invalid indices', () => {
        for (const input of [
            undefined, null, {}, { hours: null, index: 0 }, { hours: {}, index: 0 },
            { hours: [], index: 0 }, { hours: [null], index: 0 }, { hours: [{}], index: 0 },
            ...[undefined, null, -1, 0.5, 1, NaN, Infinity, '0'].map(index => ({ hours: [hourEntry()], index })),
        ]) {
            assert.equal(outdoorVerdict(input), null);
        }
    });

    it('returns null for each missing or non-finite numeric field', () => {
        for (const field of ['hour', 'sunFraction', 'windKmh', 'feelsLike', 'windFrom']) {
            for (const value of [undefined, NaN, Infinity, -Infinity, 'unknown', '12']) {
                assert.equal(outdoorVerdict({ hours: [hourEntry({ [field]: value })], index: 0 }), null, `${field}=${value}`);
            }
            if (field !== 'windFrom') {
                assert.equal(outdoorVerdict({ hours: [hourEntry({ [field]: null })], index: 0 }), null, field);
            }
        }
    });

    it('returns null for invalid states and out-of-range readings', () => {
        for (const overrides of [
            { hour: -1 }, { hour: 24 }, { hour: 11.5 }, { sunFraction: -0.1 }, { sunFraction: 1.1 },
            { windKmh: -1 }, { windLevel: 'blue' }, { windLevel: undefined },
            { isDaylight: undefined }, { isDaylight: null }, { isDaylight: 1 },
        ]) {
            assert.equal(outdoorVerdict({ hours: [hourEntry(overrides)], index: 0 }), null);
        }
    });

    it('stops lookahead at a missing or invalid future reading', () => {
        for (const missing of [null, undefined, hourEntry({ hour: 12, sunFraction: NaN })]) {
            const hours = [hourEntry(), missing, hourEntry({ hour: 13, sunFraction: 0.1 })];
            const result = outdoorVerdict({ hours, index: 0 });
            assert.equal(result.changeHour, null);
            assert.equal(result.slots.length, 1);
        }
    });
});

describe('outdoorVerdict cloud', () => {
    for (const sunFraction of [PART_SUN_FRACTION, FULL_SUN_FRACTION]) {
        for (const [windLevel, verdict] of [
            ['green', 'Cloudy and calm'], ['yellow', 'Cloudy, a bit breezy'],
            ['orange', 'Cloudy and windy'], ['red', 'Cloudy and windy'],
        ]) {
            it(`describes cloud at sun fraction ${sunFraction} with ${windLevel} wind`, () => {
                const hours = [hourEntry({ sunFraction, skyClearness: 0, windLevel })];
                const result = outdoorVerdict({ hours, index: 0 });
                assert.equal(result.state, 'cloud');
                assert.equal(result.verdict, verdict);
                assert.equal(result.detail, 'No direct sun expected here today. Feels 21\u00b0 with 7 km/h from the north.');
                const windWords = { green: 'Calm', yellow: 'Breezy', orange: 'Windy', red: 'Very windy' };
                assert.deepEqual(result.slots, [{ hour: 11, label: '11am', words: `Cloudy \u00b7 ${windWords[windLevel]}`, good: false }]);
            });
        }
    }

    for (const [sunFraction, clearState] of [[FULL_SUN_FRACTION, 'sun'], [PART_SUN_FRACTION, 'part']]) {
        for (const [skyClearness, expected] of [
            [SUNNY_CLEARNESS - 0.0001, 'cloud'],
            [SUNNY_CLEARNESS, clearState],
            [SUNNY_CLEARNESS + 0.0001, clearState],
        ]) {
            it(`classifies clearness ${skyClearness} and sun fraction ${sunFraction} as ${expected}`, () => {
                const hours = [hourEntry({ sunFraction, skyClearness })];
                assert.equal(outdoorVerdict({ hours, index: 0 }).state, expected);
            });
        }
    }

    it('keeps the existing result when sky clearness is null or undefined', () => {
        for (const hours of [FIXTURE_A, FIXTURE_B]) {
            for (const skyClearness of [null, undefined]) {
                const unknown = hours.map(entry => ({ ...entry, skyClearness }));
                for (let index = 0; index < hours.length; index += 1) {
                    assert.deepEqual(outdoorVerdict({ hours: unknown, index }), outdoorVerdict({ hours, index }));
                }
            }
        }
    });

    it('keeps geometric shade and evening darkness when the sky is cloudy or clear', () => {
        for (const skyClearness of [0, 1]) {
            const shade = hourEntry({ sunFraction: PART_SUN_FRACTION - 0.0001, skyClearness });
            assert.equal(outdoorVerdict({ hours: [shade], index: 0 }).state, 'shade');
            const night = hourEntry({ hour: 20, skyClearness, isDaylight: false });
            assert.equal(outdoorVerdict({ hours: [night], index: 0 }).state, 'dark');
        }
        assert.equal(outdoorVerdict({ hours: [hourEntry({ skyClearness: 1 })], index: 0 }).state, 'sun');
    });

    it('finds later direct sun after cloud clears, skipping cloudy and shaded entries', () => {
        const hours = [
            hourEntry({ hour: 11, skyClearness: 0.1 }),
            hourEntry({ hour: 12, sunFraction: 0.5, skyClearness: 0.1 }),
            hourEntry({ hour: 13, sunFraction: 0.1, skyClearness: 1 }),
            hourEntry({ hour: 14, skyClearness: 0.1 }),
            hourEntry({ hour: 15, sunFraction: 0.5, skyClearness: 1 }),
            hourEntry({ hour: 16, skyClearness: 1 }),
            hourEntry({ hour: 17, isDaylight: false }),
        ];
        const cloud = at(hours, 11);
        assert.equal(cloud.detail, 'Sun from 3pm. Feels 21\u00b0 with 7 km/h from the north.');
        assert.equal(cloud.changeHour, 13);
        assert.equal(at(hours, 13).detail, 'Sun from 3pm. Feels 21\u00b0 with 7 km/h from the north.');
    });

    it('has no direct sun expected when cloud lasts all day through nightfall', () => {
        const hours = Array.from({ length: 11 }, (_, index) => hourEntry({
            hour: 10 + index, skyClearness: 0.1, isDaylight: index < 10,
        }));
        const result = at(hours, 10);
        assert.equal(result.detail, 'No direct sun expected here today. Feels 21\u00b0 with 7 km/h from the north.');
        assert.equal(result.changeHour, 20);
        assert.ok(result.slots.every(slot => !slot.good));
    });

    it('keeps the shade sentence when all later daylight is cloudy', () => {
        const hours = [
            hourEntry({ sunFraction: 0.1 }),
            hourEntry({ hour: 12, skyClearness: 0.1 }),
            hourEntry({ hour: 13, isDaylight: false }),
        ];
        const result = at(hours, 11);
        assert.equal(result.detail, 'No more sun here today. Feels 21\u00b0 with 7 km/h from the north.');
        assert.equal(result.changeHour, 12);
    });

    it('rejects non-finite, non-numeric and out-of-range sky clearness', () => {
        for (const skyClearness of [NaN, Infinity, -Infinity, '0.5', '', false, true, {}, [], -0.0001, 1.0001]) {
            assert.equal(outdoorVerdict({ hours: [hourEntry({ skyClearness })], index: 0 }), null);
            const hours = [hourEntry(), hourEntry({ hour: 12, skyClearness }), hourEntry({ hour: 13, sunFraction: 0 })];
            assert.equal(at(hours, 11).slots.length, 1);
            assert.equal(at(hours, 11).changeHour, null);
        }
    });
});

describe('outdoorVerdict before sunrise', () => {
    for (const [windLevel, windWords] of [
        ['green', 'calm'], ['yellow', 'breezy'], ['orange', 'windy'], ['red', 'very windy'],
    ]) {
        it(`describes a pre-dawn hour with ${windLevel} wind`, () => {
            const hours = [
                hourEntry({ hour: 5, isDaylight: false, windLevel }),
                hourEntry({ hour: 6, isDaylight: false }),
                hourEntry({ hour: 7, sunFraction: 0.1 }),
                hourEntry({ hour: 8, sunFraction: 0.5 }),
                hourEntry({ hour: 9, isDaylight: false }),
            ];
            const result = at(hours, 5);
            assert.equal(result.state, 'dawn');
            assert.equal(result.verdict, `Before sunrise, ${windWords}`);
            assert.equal(result.detail, 'Sun from 8am. Feels 21\u00b0 with 7 km/h from the north.');
            assert.equal(result.changeHour, 7);
            assert.equal(result.slots[0].words, `Before sunrise \u00b7 ${windWords[0].toUpperCase()}${windWords.slice(1)}`);
            assert.equal(result.slots[0].good, false);
            assert.equal(result.slots[1].words, 'Before sunrise \u00b7 Calm');
            assert.equal(result.slots[4].words, 'After dark \u00b7 Calm');
            assert.equal(at(hours, 6).state, 'dawn');
            assert.equal(at(hours, 9).detail, 'The sun is down. Feels 21\u00b0 with 7 km/h from the north.');
        });
    }

    it('uses the first later full-sun hour and skips cloudy daylight', () => {
        const hours = [
            hourEntry({ hour: 5, isDaylight: false }),
            hourEntry({ hour: 6, skyClearness: 0.1 }),
            hourEntry({ hour: 7, skyClearness: 1 }),
            hourEntry({ hour: 8, isDaylight: false }),
        ];
        const result = at(hours, 5);
        assert.equal(result.detail, 'Sun from 7am. Feels 21\u00b0 with 7 km/h from the north.');
        assert.equal(result.changeHour, 6);
    });

    for (const daylight of [{ sunFraction: 0.1 }, { skyClearness: 0.1 }]) {
        it(`falls back to daylight time when the day has ${daylight.sunFraction == null ? 'cloud' : 'shade'} and no sun`, () => {
            const hours = [
                hourEntry({ hour: 5, isDaylight: false }),
                hourEntry({ hour: 6, ...daylight }),
                hourEntry({ hour: 7, ...daylight }),
                hourEntry({ hour: 8, isDaylight: false }),
            ];
            const result = at(hours, 5);
            assert.equal(result.state, 'dawn');
            assert.equal(result.detail, 'Daylight from 6am. Feels 21\u00b0 with 7 km/h from the north.');
            assert.equal(result.changeHour, 6);
        });
    }

    it('finds sunrise beyond the six displayed slots', () => {
        const hours = Array.from({ length: 10 }, (_, hour) => hourEntry({
            hour, isDaylight: hour >= 7 && hour < 9,
        }));
        const result = at(hours, 0);
        assert.equal(result.state, 'dawn');
        assert.equal(result.detail, 'Sun from 7am. Feels 21\u00b0 with 7 km/h from the north.');
        assert.equal(result.changeHour, 7);
        assert.equal(result.slots.length, 6);
        assert.ok(result.slots.every(slot => slot.words === 'Before sunrise \u00b7 Calm' && !slot.good));
    });

    it('does not count daylight in the next local day as sunrise today', () => {
        const hours = [hourEntry({ hour: 23, isDaylight: false }), hourEntry({ hour: 6 })];
        const result = at(hours, 23);
        assert.equal(result.state, 'dark');
        assert.equal(result.detail, 'The sun is down. Feels 21\u00b0 with 7 km/h from the north.');
        assert.equal(result.changeHour, null);
        assert.equal(result.slots.length, 1);
    });

    it('preserves inputs while resolving cloud, dawn and night slots', () => {
        const hours = [
            hourEntry({ hour: 5, isDaylight: false }),
            hourEntry({ hour: 6, skyClearness: 0.1 }),
            hourEntry({ hour: 7 }),
            hourEntry({ hour: 8, isDaylight: false }),
        ];
        const original = structuredClone(hours);
        hours.forEach(Object.freeze);
        Object.freeze(hours);
        assert.equal(at(hours, 5).state, 'dawn');
        assert.equal(at(hours, 6).state, 'cloud');
        assert.equal(at(hours, 8).state, 'dark');
        assert.deepEqual(hours, original);
    });
});

describe('outdoorVerdict fixtures', () => {
    for (const [hour, verdict, detail, changeHour] of [
        [11, 'Sunny, a bit breezy', 'Full sun until 4pm. Feels 16\u00b0 with 30 km/h from the north.', 16],
        [14, 'Sunny but windy', 'Full sun until 4pm. Feels 20\u00b0 with 40 km/h from the north.', 16],
        [17, 'Part sun and calm', 'Part sun until 7pm. Feels 17\u00b0 with 14 km/h from the south-west.', 19],
    ]) {
        it(`matches Fixture A at ${hour}:00`, () => {
            const result = at(FIXTURE_A, hour);
            assert.equal(result.verdict, verdict);
            assert.equal(result.detail, detail);
            assert.equal(result.changeHour, changeHour);
            assert.equal(result.slots.length, Math.min(6, 22 - hour));
        });
    }

    // The agreed shared 0.75 threshold makes 5pm's 0.7 partial sun.
    it('matches Fixture B at 11am with the confirmed 5pm change', () => {
        const result = at(FIXTURE_B, 11);
        assert.equal(result.state, 'sun');
        assert.equal(result.verdict, 'Sunny and calm');
        assert.equal(result.detail, 'Full sun until 5pm. Feels 21\u00b0 with 7 km/h from the north.');
        assert.equal(result.changeHour, 17);
        assert.equal(result.slots.length, 6);
        assert.equal(at(FIXTURE_B, 17).state, 'part');
    });

    it('keeps both fixtures pure and independent across repeated calls', () => {
        for (const hours of [FIXTURE_A, FIXTURE_B]) {
            const original = structuredClone(hours);
            hours.forEach(Object.freeze);
            Object.freeze(hours);
            const first = at(hours, 11);
            first.slots[0].words = 'changed by caller';
            assert.notEqual(at(hours, 11).slots[0].words, first.slots[0].words);
            assert.deepEqual(hours, original);
        }
    });
});
