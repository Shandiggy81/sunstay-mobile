import test from 'node:test';
import assert from 'node:assert/strict';
import { partnerWeatherTips } from './partnerWeatherTips.js';

const day = '2026-10-19'; // Monday, daylight-saving time in Melbourne.
const instant = (time, date = day) => new Date(`${date}T${time}:00+11:00`);
const pub = { typeCategory: 'Bar', typeLabel: 'Pub', tags: ['Beer Garden'], timeZone: 'Australia/Melbourne' };
const stay = { typeCategory: 'Serviced apartment', typeLabel: 'Serviced apartment', hasBalcony: true, timeZone: 'Australia/Melbourne' };
const hours = { mon: { open: '12:00', close: '22:00', closed: false } };
function forecast(times = ['12:00', '13:00'], overrides = {}) {
    const fill = value => times.map(() => value);
    return { source: 'open-meteo', hourly: {
        time: times.map(time => `${day}T${time}`), temperature_2m: fill(23), precipitation_probability: fill(0),
        wind_gusts_10m: fill(10), weather_code: fill(0), uv_index: fill(4), is_day: fill(1), ...overrides,
    }, daily: { time: [day], sunrise: [`${day}T06:20`], sunset: [`${day}T19:40`] } };
}
const tips = options => partnerWeatherTips({ venue: pub, hours, forecast: forecast(), now: instant('11:00'), ...options });

test('no midnight garden or sun advice, even for a stay open through midnight', () => {
    const midnight = forecast(['00:00'], { is_day: [0] });
    const allDay = { mon: { open: '00:00', close: '24:00' } };
    for (const venue of [pub, stay]) assert.deepEqual(tips({ venue, forecast: midnight, hours: allDay, now: instant('00:00') }), []);
    // Daily sunrise/sunset also guards against an inconsistent midnight day flag.
    assert.deepEqual(tips({ forecast: forecast(['00:00']), hours: allDay, now: instant('00:00') }), []);
});

test('only open service times qualify, with an exclusive closing boundary and closed days excluded', () => {
    const result = tips({ forecast: forecast(['11:00', '12:00', '22:00']) });
    assert.equal(result.length, 1);
    assert.equal(result[0].time, instant('12:00').toISOString());
    assert.equal(result[0].timeLabel, '12:00pm');
    assert.deepEqual(tips({ hours: { mon: { open: '12:00', close: '22:00', closed: true } } }), []);
    assert.deepEqual(tips({ hours: { tue: hours.mon } }), []);
});

test('pub and stay copy describe their actual outdoor space, never borrowing a beer garden', () => {
    assert.match(tips()[0].text, /beer garden/);
    const apartment = tips({ venue: stay });
    assert.match(apartment[0].text, /guests using balconies/);
    assert.ok(!apartment[0].text.includes('beer garden'));
    const plainPub = tips({ venue: { ...pub, tags: ['Outdoor Seating'] } });
    assert.match(plainPub[0].text, /terrace/);
    assert.ok(!plainPub[0].text.includes('beer garden'));
    assert.deepEqual(tips({ venue: { ...stay, hasBalcony: false } }), []);
});

test('no forecast, demo weather, missing hours or prose hours produce no tips', () => {
    for (const value of [null, {}, { source: 'demo', hourly: forecast().hourly }, { ...forecast(), unavailable: true }]) {
        assert.deepEqual(tips({ forecast: value }), []);
    }
    for (const value of [null, undefined, '', 'Daily 12pm–late', {}, []]) assert.deepEqual(tips({ hours: value }), []);
    assert.deepEqual(tips({ now: undefined }), []);
});

test('forecast gaps cannot become comfortable weather or guessed daylight', () => {
    for (const field of ['temperature_2m', 'precipitation_probability', 'wind_gusts_10m', 'weather_code', 'is_day']) {
        assert.deepEqual(tips({ forecast: forecast(['12:00'], { [field]: [] }) }), []);
    }
    assert.deepEqual(tips({ forecast: forecast(['12:00'], { temperature_2m: [null] }) }), []);
});

test('wind and rain advisories use service hours and venue-specific guest wording, capped at two', () => {
    const f = forecast(['12:00', '13:00', '14:00', '15:00'], { wind_gusts_10m: [40, 10, 10, 10], precipitation_probability: [0, 80, 80, 0] });
    const result = tips({ venue: stay, forecast: f });
    assert.equal(result.length, 2);
    assert.deepEqual(result.map(t => t.key), ['wind', 'rain']);
    assert.ok(result.every(t => t.text.includes('guest arrivals')));
    assert.deepEqual(tips({ forecast: f, hours: { mon: { open: '16:00', close: '22:00' } } }), []);
});

test('overnight hours come from the previous day and still cannot create nighttime garden advice', () => {
    const overnight = { sun: { open: '18:00', close: '02:00' } };
    const rain = forecast(['00:00', '02:00'], { is_day: [0, 0], precipitation_probability: [80, 80] });
    const result = tips({ hours: overnight, forecast: rain, now: instant('00:00') });
    assert.equal(result.length, 1);
    assert.equal(result[0].time, instant('00:00').toISOString());
    assert.equal(result[0].key, 'rain');
    assert.deepEqual(tips({ hours: overnight, forecast: forecast(['00:00'], { is_day: [0] }), now: instant('00:00') }), []);
});

test('current-hour advice uses now instead of a past label and does not mutate inputs', () => {
    const f = forecast(); const before = JSON.stringify(f);
    const result = tips({ forecast: f, now: instant('12:30') });
    assert.equal(result[0].time, instant('12:30').toISOString());
    assert.equal(JSON.stringify(f), before);
    assert.deepEqual(tips({ forecast: forecast(['23:00']), now: instant('09:00'), hours: { mon: { open: '00:00', close: '24:00' } } }), []);
});

test('risk tips need an actual risk measurement and invalid times or unknown timezone are ignored', () => {
    const empty = forecast(['12:00'], { temperature_2m: [], precipitation_probability: [], wind_gusts_10m: [], weather_code: [], uv_index: [] });
    assert.deepEqual(tips({ forecast: empty }), []);
    assert.deepEqual(tips({ forecast: forecast(['not-a-time']) }), []);
    assert.deepEqual(tips({ timeZone: 'Unknown/Timezone' }), []);
    assert.deepEqual(tips({ forecast: forecast(['12:00'], { weather_code: [999], precipitation_probability: [180] }) }), []);
    assert.deepEqual(tips({ hours: { mon: { ...hours.mon, closed: 'true' } } }), []);
    const codeOnly = forecast(['12:00'], { temperature_2m: [], precipitation_probability: [], wind_gusts_10m: [], weather_code: [61] });
    assert.equal(tips({ forecast: codeOnly })[0].key, 'rain');
});
