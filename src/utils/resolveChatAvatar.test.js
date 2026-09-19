import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readWeatherCode, resolveChatAvatarKind } from './resolveChatAvatar.js';

describe('readWeatherCode', () => {
    it('reads the current hourly WMO slot', () => {
        const weather = {
            hourly: { weather_code: [1, 2, 95], _currentIndex: 2 },
        };
        assert.equal(readWeatherCode(weather), 95);
    });

    it('falls back to daily then adapter fields', () => {
        assert.equal(readWeatherCode({ daily: { weather_code: [3] } }), 3);
        assert.equal(readWeatherCode({ current: { weatherCode: 0 } }), 0);
        assert.equal(readWeatherCode(null), null);
        assert.equal(readWeatherCode({ hourly: { weather_code: 'nope', _currentIndex: 0 } }), null);
    });
});

describe('resolveChatAvatarKind', () => {
    it('uses Thunder Buddy for WMO 95 / 96 / 99', () => {
        for (const code of [95, 96, 99]) {
            assert.equal(
                resolveChatAvatarKind({ hourly: { weather_code: [code], _currentIndex: 0 } }),
                'thunder',
            );
        }
    });

    it('uses Thunder Buddy when the condition label says thunderstorm', () => {
        assert.equal(
            resolveChatAvatarKind({ weather: [{ main: 'Thunderstorm', description: 'thunderstorm' }] }),
            'thunder',
        );
    });

    it('uses the sunglasses Sunny for clear / mainly-clear codes', () => {
        assert.equal(
            resolveChatAvatarKind({ hourly: { weather_code: [0], _currentIndex: 0 } }),
            'sunny',
        );
        assert.equal(
            resolveChatAvatarKind({ hourly: { weather_code: [1], _currentIndex: 0 } }),
            'sunny',
        );
        assert.equal(
            resolveChatAvatarKind({ weather: [{ main: 'Clear', description: 'sunny day' }] }),
            'sunny',
        );
    });

    it('defaults for rain, cloud, missing data, and unknown codes', () => {
        assert.equal(resolveChatAvatarKind(null), 'default');
        assert.equal(resolveChatAvatarKind({}), 'default');
        assert.equal(
            resolveChatAvatarKind({ hourly: { weather_code: [63], _currentIndex: 0 } }),
            'default',
        );
        assert.equal(
            resolveChatAvatarKind({ hourly: { weather_code: [3], _currentIndex: 0 } }),
            'default',
        );
        assert.equal(
            resolveChatAvatarKind({ weather: [{ main: 'Rain', description: 'rain showers' }] }),
            'default',
        );
    });

    it('lets a thunder WMO win over a Clear label', () => {
        assert.equal(
            resolveChatAvatarKind({
                weather: [{ main: 'Clear', description: 'clear sky' }],
                hourly: { weather_code: [96], _currentIndex: 0 },
            }),
            'thunder',
        );
    });
});
