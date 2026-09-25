import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHourlyForecast } from './normalizeHourlyForecast.js';
import { resolveForecastView } from './resolveForecastView.js';
import {
    formatIsolationHudLines,
    getIsolationEvents,
    resetIsolationLog,
} from './iosCrashLog.js';
import {
    beginForecastRequest,
    createForecastGeneration,
    forecastHttpPlan,
    invalidateForecast,
    isCurrentForecast,
    isForecastAbort,
    noteSunForecast,
} from './sunForecastDiagnostics.js';

const now = new Date('2026-09-25T01:00:00Z');

function payload(times, temps) {
    return { hourly: { time: times, temperature_2m: temps } };
}

describe('sun forecast data contract', () => {
    it('renders a bounded row set from a complete hourly payload', () => {
        const times = Array.from({ length: 20 }, (_, i) => new Date(now.getTime() + i * 3600000).toISOString());
        const temps = times.map((_, i) => 18 + i);
        const rows = normalizeHourlyForecast(payload(times, temps), { now, limit: 12 });
        assert.equal(rows.length, 12);
        assert.equal(resolveForecastView({ loading: false, error: false, items: rows }), 'success');
        assert.equal(Number.isFinite(rows[0].temp), true);
    });

    it('renders an empty state for an empty or missing timeline', () => {
        assert.deepEqual(normalizeHourlyForecast({ hourly: { time: [] } }, { now }), []);
        assert.deepEqual(normalizeHourlyForecast(null, { now }), []);
        assert.deepEqual(normalizeHourlyForecast({ hourly: { time: null } }, { now }), []);
        assert.equal(resolveForecastView({ items: [] }), 'empty');
        assert.equal(resolveForecastView({ items: undefined }), 'empty');
    });

    it('classifies HTTP failure separately from a parsed empty body', () => {
        assert.deepEqual(forecastHttpPlan(false, 500), { action: 'error', reason: 'http-500' });
        assert.equal(forecastHttpPlan(true, 200).action, 'parse');
        assert.equal(resolveForecastView({ error: true, items: [] }), 'error');
    });

    it('drops non-finite temperatures and invalid timestamps', () => {
        const rows = normalizeHourlyForecast(payload(
            ['not-a-date', now.toISOString(), new Date(now.getTime() + 3600000).toISOString()],
            [20, NaN, Infinity],
        ), { now });
        assert.deepEqual(rows, []);
        assert.equal(resolveForecastView({ items: rows }), 'empty');
    });
});

describe('sun forecast request generation', () => {
    it('ignores a stale venue response and treats abort as not a failure', () => {
        const first = beginForecastRequest(createForecastGeneration(), 'venue-a');
        const second = beginForecastRequest(first.generation, 'venue-b');
        assert.equal(isCurrentForecast(second.generation, first.requestId, 'venue-a'), false);
        assert.equal(isCurrentForecast(second.generation, second.requestId, 'venue-b'), true);
        const cleaned = invalidateForecast(second.generation);
        assert.equal(isCurrentForecast(cleaned, second.requestId, 'venue-b'), false);
        assert.equal(isForecastAbort({ name: 'AbortError' }), true);
        assert.equal(isForecastAbort(new Error('http-500')), false);
    });

    it('keeps cleanup idempotent and sends one diagnostic event', () => {
        resetIsolationLog();
        const seen = new Set();
        const first = noteSunForecast(seen, 'sun-forecast-fetch-error', {
            venueId: 'venue-a',
            requestId: 1,
            reason: 'http-500',
            state: 'error',
        });
        const again = noteSunForecast(seen, 'sun-forecast-fetch-error', {
            venueId: 'venue-a',
            requestId: 1,
            reason: 'http-500',
            state: 'error',
        });
        const abort = noteSunForecast(seen, 'sun-forecast-fetch-abort', {
            venueId: 'venue-a',
            requestId: 1,
            state: 'abort',
        });
        assert.equal(again, null);
        assert.match(first.message, /sun-forecast-fetch-error/);
        assert.match(abort.message, /sun-forecast-fetch-abort/);
        assert.equal(getIsolationEvents().length, 2);
        const hud = formatIsolationHudLines().join('\n');
        assert.match(hud, /sun-forecast-fetch-abort/);
        resetIsolationLog();
    });
});
