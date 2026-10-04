import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMapRecoveryState, noteContextLost } from './mapRecovery.js';
import {
    beginForecastRequest,
    createForecastGeneration,
    invalidateForecast,
    isCurrentForecast,
} from './sunForecastDiagnostics.js';
import { resolveIosIsolation } from './iosCrashIsolation.js';
import { noteMapOperation, resetMapOperationTrace } from './mapOperationTrace.js';
import { normalizeHourlyForecast } from './normalizeHourlyForecast.js';
import { resolveForecastView } from './resolveForecastView.js';
import { resetSunForecastRequestIds, traceSunForecastLifecycle } from './sunForecastLifecycle.js';
import {
    SUN_FORECAST_MODES,
    SUN_FORECAST_TRACE_EVENTS,
    auxiliaryForecastEnabled,
    buildSunForecastTrace,
    hourlyForecastEnabled,
    resolveSunForecastMode,
    sunForecastMountPlan,
} from './sunForecastMode.js';

describe('sun forecast isolation modes', () => {
    it('keeps full mode on the current production mount and fetch set', () => {
        const plan = sunForecastMountPlan('full');
        assert.equal(plan.mode, 'full');
        assert.equal(plan.mountShell, true);
        assert.equal(plan.mountSolarPosition, true);
        assert.equal(plan.mountAnimatedTimeline, true);
        assert.equal(plan.mountOptionalSections, true);
        assert.equal(plan.mountHourlyStrip, true);
        assert.equal(plan.startHourlyFetch, true);
        assert.equal(plan.startOpenUv, true);
        assert.equal(plan.startOpenAq, true);
        assert.equal(plan.startTomorrow, true);
        assert.equal(plan.startAuxiliaryFetches, true);
        assert.equal(plan.schedulesDeferredWork, false);
        assert.equal(plan.diagnosticLabel, '');
        assert.equal(auxiliaryForecastEnabled(true, 'full'), true);
        assert.equal(hourlyForecastEnabled(true, 'full'), true);
        assert.equal(resolveIosIsolation({}).sunForecastMode, 'full');
    });

    it('static mode keeps lightweight content and skips animation, optional sections, and aux hooks', () => {
        const plan = sunForecastMountPlan('static');
        assert.equal(plan.mountShell, true);
        assert.equal(plan.mountSolarPosition, true);
        assert.equal(plan.mountHourlyStrip, true);
        assert.equal(plan.startHourlyFetch, true);
        assert.equal(plan.mountAnimatedTimeline, false);
        assert.equal(plan.mountOptionalSections, false);
        assert.equal(plan.startAuxiliaryFetches, false);
        assert.equal(plan.startOpenUv, false);
        assert.equal(plan.startOpenAq, false);
        assert.equal(plan.startTomorrow, false);
        assert.match(plan.diagnosticLabel, /static/);
    });

    it('no-aux mode keeps the core hourly path and does not start auxiliary requests', () => {
        const plan = sunForecastMountPlan('no-aux');
        assert.equal(plan.mountHourlyStrip, true);
        assert.equal(plan.startHourlyFetch, true);
        assert.equal(plan.mountAnimatedTimeline, true);
        assert.equal(plan.mountOptionalSections, true);
        assert.equal(plan.startAuxiliaryFetches, false);
        assert.equal(auxiliaryForecastEnabled(true, 'no-aux'), false);
        assert.equal(hourlyForecastEnabled(true, 'no-aux'), true);
    });

    it('no-fetch mode starts no forecast requests and mounts no heavy children', () => {
        const plan = sunForecastMountPlan('no-fetch');
        assert.equal(plan.mountShell, true);
        assert.equal(plan.mountSolarPosition, false);
        assert.equal(plan.mountAnimatedTimeline, false);
        assert.equal(plan.mountOptionalSections, false);
        assert.equal(plan.mountHourlyStrip, false);
        assert.equal(plan.startHourlyFetch, false);
        assert.equal(plan.startAuxiliaryFetches, false);
        assert.equal(hourlyForecastEnabled(true, 'no-fetch'), false);
        assert.equal(auxiliaryForecastEnabled(true, 'no-fetch'), false);
        assert.match(plan.diagnosticLabel, /no-fetch/);
    });

    it('rejects a forecast response after tab-exit cleanup', () => {
        const started = beginForecastRequest(createForecastGeneration(), 'venue-a');
        const cleaned = invalidateForecast(started.generation);
        assert.equal(isCurrentForecast(cleaned, started.requestId, 'venue-a'), false);
    });

    it('rejects a stale response for a venue that is no longer current', () => {
        const first = beginForecastRequest(createForecastGeneration(), 'venue-a');
        const second = beginForecastRequest(first.generation, 'venue-b');
        assert.equal(isCurrentForecast(second.generation, first.requestId, 'venue-a'), false);
        assert.equal(isCurrentForecast(second.generation, second.requestId, 'venue-b'), true);
    });

    it('does not schedule deferred forecast work in any mode', () => {
        for (const mode of SUN_FORECAST_MODES) {
            assert.equal(sunForecastMountPlan(mode).schedulesDeferredWork, false);
        }
        const started = beginForecastRequest(createForecastGeneration(), 'venue-a');
        const cleaned = invalidateForecast(started.generation);
        assert.equal(isCurrentForecast(cleaned, started.requestId, 'venue-a'), false);
    });

    it('keeps empty and error forecast states visible', () => {
        assert.equal(resolveForecastView({ loading: false, error: false, items: [] }), 'empty');
        assert.equal(resolveForecastView({ loading: false, error: true, items: [] }), 'error');
        assert.equal(resolveForecastView({ loading: true, error: false, items: [] }), 'loading');
    });

    it('keeps the core hourly forecast bounded', () => {
        const now = new Date('2026-10-04T00:00:00Z');
        const times = Array.from({ length: 48 }, (_, index) => new Date(now.getTime() + index * 3600000).toISOString());
        const rows = normalizeHourlyForecast(
            { hourly: { time: times, temperature_2m: times.map(() => 21) } },
            { now, limit: sunForecastMountPlan('full').hourlyRowLimit },
        );
        assert.equal(rows.length, 12);
        assert.equal(sunForecastMountPlan('static').hourlyRowLimit, 12);
    });

    it('ignores sunForecastMode unless matrixHud=1', () => {
        assert.equal(resolveSunForecastMode('static', false), 'full');
        assert.equal(resolveSunForecastMode('no-fetch', false), 'full');
        assert.equal(resolveIosIsolation({ search: '?sunForecastMode=static' }).sunForecastMode, 'full');
        assert.equal(resolveIosIsolation({ search: '?sunForecastMode=no-fetch' }).matrixHud, false);
        assert.equal(
            resolveIosIsolation({
                search: '',
                storage: { getItem: (key) => (key === 'ss-sun-forecast-mode' ? 'no-aux' : null) },
            }).sunForecastMode,
            'full',
        );
        assert.equal(traceSunForecastLifecycle('sun-forecast-open', { venueId: 'v' }), null);
        resetSunForecastRequestIds();
    });

    it('honors each mode only while the HUD is on and rejects unknown values', () => {
        for (const mode of SUN_FORECAST_MODES) {
            assert.equal(
                resolveIosIsolation({ search: `?matrixHud=1&sunForecastMode=${mode}` }).sunForecastMode,
                mode,
            );
        }
        assert.equal(
            resolveIosIsolation({ search: '?matrixHud=1&sunForecastMode=delay-all' }).sunForecastMode,
            'full',
        );
        assert.equal(resolveIosIsolation({ search: '?matrixHud=1' }).sunForecastMode, 'full');
    });

    it('records lifecycle fields without changing map recovery', () => {
        resetMapOperationTrace();
        const trace = buildSunForecastTrace('sun-forecast-hourly-fetch-start', {
            at: 100,
            venueId: 'venue-7',
            generation: 4,
            mode: 'no-aux',
            requestId: 9,
            detail: 'hourly',
        });
        assert.deepEqual(trace, {
            name: 'sun-forecast-hourly-fetch-start',
            at: 100,
            venueId: 'venue-7',
            generation: 4,
            mode: 'no-aux',
            requestId: '9',
            detail: 'hourly',
        });
        for (const name of SUN_FORECAST_TRACE_EVENTS) {
            const event = noteMapOperation(name, trace);
            assert.equal(event.name, name);
            assert.equal(event.mode, 'no-aux');
            assert.equal(event.requestId, '9');
            assert.equal(event.venueId, 'venue-7');
            assert.equal(event.generation, 4);
        }
        const live = { ...createMapRecoveryState(), phase: 'live', generation: 1 };
        const lost = noteContextLost(live, 1, 50);
        assert.equal(lost.state.phase, 'paused');
        assert.equal(lost.state.contextLosses, 1);
        assert.equal(lost.state.sessionLocked, false);
    });
});
