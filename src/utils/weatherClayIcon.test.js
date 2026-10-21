import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { weatherClayIcon } from './weatherClayIcon.js';
import { getWeatherFromOpenMeteoCode } from './weatherService.js';
import { headerWeatherSummary } from './headerWeatherSummary.js';

const SUNNY = new Set(['sun', 'sun-cloud', 'sun-shower']);
const CLAY = new Set(readdirSync(new URL('../assets/clay/', import.meta.url)).map(file => file.replace(/\.webp$/, '')));

/** The condition the header chip prints for an Open-Meteo weather code. */
function chipCondition(code) {
    return headerWeatherSummary({ main: { temp: 25 }, weather: [getWeatherFromOpenMeteoCode(code)] }).condition;
}

test('each header condition gets its matching clay icon by day', () => {
    assert.equal(weatherClayIcon(chipCondition(0)), 'sun');
    assert.equal(weatherClayIcon(chipCondition(1)), 'sun-cloud');
    assert.equal(weatherClayIcon(chipCondition(2)), 'sun-cloud');
    assert.equal(weatherClayIcon(chipCondition(3)), 'cloud');
    assert.equal(weatherClayIcon(chipCondition(45)), 'fog');
    assert.equal(weatherClayIcon(chipCondition(48)), 'fog');
    assert.equal(weatherClayIcon(chipCondition(53)), 'sun-shower');
    assert.equal(weatherClayIcon(chipCondition(63)), 'rain');
    assert.equal(weatherClayIcon(chipCondition(81)), 'rain');
    assert.equal(weatherClayIcon(chipCondition(95)), 'thunderstorm');
    assert.equal(weatherClayIcon(chipCondition(73)), 'frost');
});

test('Foggy, Rain and Cloudy never show a sun', () => {
    for (const condition of ['Foggy', 'Fog', 'Mist', 'Haze', 'Rain', 'Rain showers', 'Light rain', 'Shower rain',
        'Cloudy', 'Overcast', 'Overcast clouds', 'Broken clouds', 'Mostly cloudy', 'Thunderstorm with rain']) {
        assert.ok(!SUNNY.has(weatherClayIcon(condition)), condition);
        assert.ok(!SUNNY.has(weatherClayIcon(condition, { isNight: true })), `${condition} at night`);
    }
    assert.equal(weatherClayIcon('Foggy'), 'fog');
    assert.equal(weatherClayIcon('Rain'), 'rain');
    assert.equal(weatherClayIcon('Cloudy'), 'cloud');
});

test('clear and part-cloud skies show the moon at night; weather icons stay', () => {
    assert.equal(weatherClayIcon('Clear sky', { isNight: true }), 'night');
    assert.equal(weatherClayIcon('Partly cloudy', { isNight: true }), 'night');
    assert.equal(weatherClayIcon('Mostly clear', { isNight: true }), 'night');
    assert.equal(weatherClayIcon('Drizzle', { isNight: true }), 'rain');
    assert.equal(weatherClayIcon('Foggy', { isNight: true }), 'fog');
    assert.equal(weatherClayIcon('Overcast', { isNight: true }), 'cloud');
    assert.equal(weatherClayIcon('Thunderstorm', { isNight: true }), 'thunderstorm');
});

test('loading, unavailable and unknown weather make no full-sun claim', () => {
    for (const weather of [null, { source: 'demo', unavailable: true, weather: [{ description: 'sunny day' }] }]) {
        assert.equal(weatherClayIcon(headerWeatherSummary(weather).condition), 'sun-cloud');
    }
    assert.equal(weatherClayIcon('–'), 'sun-cloud');
    assert.equal(weatherClayIcon(undefined), 'sun-cloud');
    assert.equal(weatherClayIcon('', { isNight: true }), 'night');
});

test('every icon it returns exists in src/assets/clay', () => {
    const names = new Set();
    for (const condition of ['Clear sky', 'Partly cloudy', 'Overcast', 'Foggy', 'Drizzle', 'Rain showers', 'Snow', 'Thunderstorm', '']) {
        names.add(weatherClayIcon(condition));
        names.add(weatherClayIcon(condition, { isNight: true }));
    }
    for (const name of names) assert.ok(CLAY.has(name), name);
});
