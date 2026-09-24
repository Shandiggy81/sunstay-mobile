import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldMountMap } from './mapLifecycle.js';
import {
    MAP_RECOVERY_COOLDOWN_MS,
    createMapRecoveryState,
    mapRecoveryControl,
    noteContextLost,
    noteMapLoaded,
    noteMapRemoved,
    noteResumeFailed,
    recoveryEffectTick,
    releaseInitLock,
    requestMapResume,
    resumeAvailable,
    startMapLoad,
} from './mapRecovery.js';

function liveState() {
    const started = startMapLoad(createMapRecoveryState());
    return noteMapLoaded(started.state, started.state.generation).state;
}

describe('map recovery transitions', () => {
    it('follows ready → loading → live for the initial load', () => {
        const ready = createMapRecoveryState();
        assert.equal(ready.phase, 'ready');
        const loading = startMapLoad(ready);
        assert.equal(loading.ok, true);
        assert.equal(loading.state.phase, 'loading');
        assert.equal(loading.state.initLock, true);
        const live = noteMapLoaded(loading.state, loading.state.generation);
        assert.equal(live.ok, true);
        assert.equal(live.state.phase, 'live');
        assert.equal(live.state.initLock, false);
        assert.equal(live.state.cooldownUntil, null);
    });

    it('transitions live → paused after owned context loss', () => {
        const paused = noteContextLost(liveState(), 1, 1000);
        assert.equal(paused.ok, true);
        assert.equal(paused.state.phase, 'paused');
        assert.equal(paused.state.initLock, false);
    });

    it('does not automatically retry after context loss', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const ticked = recoveryEffectTick(paused);
        assert.equal(ticked.reason, 'no-auto-retry');
        assert.equal(ticked.state.phase, 'paused');
        assert.equal(requestMapResume(paused, 1000).ok, false);
    });

    it('applies a five-second cooldown after context loss', () => {
        assert.equal(MAP_RECOVERY_COOLDOWN_MS, 5000);
        const paused = noteContextLost(liveState(), 1, 1000).state;
        assert.equal(paused.cooldownUntil, 6000);
    });

    it('blocks resume during the cooldown', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const blocked = requestMapResume(paused, 5999);
        assert.equal(blocked.ok, false);
        assert.equal(blocked.reason, 'cooldown');
        assert.equal(blocked.state.phase, 'paused');
        assert.equal(resumeAvailable(paused, 5999), false);
        assert.equal(mapRecoveryControl(paused, 5999).disabled, true);
    });

    it('moves paused → resuming only on an explicit resume', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const resuming = requestMapResume(paused, 6000);
        assert.equal(resuming.ok, true);
        assert.equal(resuming.state.phase, 'resuming');
        assert.equal(resuming.state.initLock, true);
        assert.equal(resuming.state.generation, 2);
    });

    it('allows only one concurrent resume', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const first = requestMapResume(paused, 6000);
        const second = requestMapResume(first.state, 6000);
        assert.equal(first.ok, true);
        assert.equal(second.ok, false);
        assert.equal(second.reason, 'locked');
        assert.equal(second.state.phase, 'resuming');
        assert.equal(second.state.generation, first.state.generation);
    });

    it('moves a successful resume to live and clears the cooldown', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const resuming = requestMapResume(paused, 6000).state;
        const live = noteMapLoaded(resuming, resuming.generation);
        assert.equal(live.ok, true);
        assert.equal(live.state.phase, 'live');
        assert.equal(live.state.initLock, false);
        assert.equal(live.state.cooldownUntil, null);
    });

    it('moves a failed resume to resume-failed and arms the cooldown', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const resuming = requestMapResume(paused, 6000).state;
        const failed = noteResumeFailed(resuming, resuming.generation, 7000);
        assert.equal(failed.ok, true);
        assert.equal(failed.state.phase, 'resume-failed');
        assert.equal(failed.state.initLock, false);
        assert.equal(failed.state.cooldownUntil, 12000);
        assert.equal(requestMapResume(failed.state, 11999).reason, 'cooldown');
    });

    it('allows resume again after the failed-resume cooldown', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const resuming = requestMapResume(paused, 6000).state;
        const failed = noteResumeFailed(resuming, resuming.generation, 7000).state;
        assert.equal(resumeAvailable(failed, 12000), true);
        const again = requestMapResume(failed, 12000);
        assert.equal(again.ok, true);
        assert.equal(again.state.phase, 'resuming');
    });

    it('ignores stale events from an old map generation', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const resuming = requestMapResume(paused, 6000).state;
        const staleLoad = noteMapLoaded(resuming, 1);
        const staleLoss = noteContextLost(resuming, 1, 6500);
        const staleFail = noteResumeFailed(resuming, 1, 6500);
        assert.equal(staleLoad.reason, 'stale');
        assert.equal(staleLoss.reason, 'stale');
        assert.equal(staleFail.reason, 'stale');
        assert.equal(staleLoad.state.phase, 'resuming');
        assert.equal(staleLoss.state, resuming);
        assert.equal(staleFail.state.phase, 'resuming');
    });

    it('removes each map generation at most once and ignores a repeated cleanup', () => {
        let state = liveState();
        const first = noteMapRemoved(state, state.generation);
        const second = noteMapRemoved(first.state, state.generation);
        assert.equal(first.remove, true);
        assert.equal(second.remove, false);
        assert.equal(second.reason, 'already-removed');
        assert.equal(second.state.removeCounts['1'], 1);
    });

    it('clears the init lock on success, failure, abort, and unmount', () => {
        const loading = startMapLoad(createMapRecoveryState()).state;
        assert.equal(noteMapLoaded(loading, loading.generation).state.initLock, false);
        const resuming = requestMapResume(noteContextLost(liveState(), 1, 1000).state, 6000).state;
        assert.equal(noteResumeFailed(resuming, resuming.generation, 7000).state.initLock, false);
        const aborted = startMapLoad(createMapRecoveryState()).state;
        assert.equal(releaseInitLock(aborted, 'abort').state.initLock, false);
        assert.equal(releaseInitLock(aborted, 'abort').state.phase, 'ready');
        const unmounted = startMapLoad(createMapRecoveryState()).state;
        assert.equal(releaseInitLock(unmounted, 'unmount').state.initLock, false);
        assert.equal(releaseInitLock(unmounted, 'unmount').state.phase, 'ready');
        assert.equal(releaseInitLock(unmounted, 'unmount').state.phase === 'resuming', false);
    });

    it('leaves the mapbox=0 static fallback off the resume path', () => {
        assert.equal(shouldMountMap({ mapboxEnabled: false, sheetExpanded: false }), false);
        const control = mapRecoveryControl(noteContextLost(liveState(), 1, 1000).state, 9000, {
            mapboxEnabled: false,
        });
        assert.equal(control.mode, 'static-fallback');
        assert.equal(control.showResume, false);
        assert.equal(control.status.includes('Resume map'), false);
    });

    it('keeps the default path free of a resume control', () => {
        const ready = createMapRecoveryState();
        const loading = startMapLoad(ready).state;
        const live = noteMapLoaded(loading, loading.generation).state;
        for (const state of [ready, loading, live]) {
            const control = mapRecoveryControl(state, 0);
            assert.equal(control.mode, 'mapbox');
            assert.equal(control.showResume, false);
            assert.equal(control.showProgress, false);
        }
        assert.equal(shouldMountMap({ mapboxEnabled: true, lifecycle: 'keep', sheetExpanded: true }), true);
    });

    it('exposes Resume map as a 44×44 button with an accessible name', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const control = mapRecoveryControl(paused, 6000);
        assert.equal(control.showResume, true);
        assert.equal(control.element, 'button');
        assert.equal(control.label, 'Resume map');
        assert.equal(control.accessibleName, 'Resume map');
        assert.equal(control.minWidth, 44);
        assert.equal(control.minHeight, 44);
        assert.equal(control.disabled, false);
        assert.equal(control.status, 'Map paused. Tap Resume map to try again.');
        const failed = noteResumeFailed(
            requestMapResume(paused, 6000).state,
            2,
            7000,
        ).state;
        const failedControl = mapRecoveryControl(failed, 12000);
        assert.equal(failedControl.showResume, true);
        assert.match(failedControl.status, /failed/i);
        const progress = mapRecoveryControl(requestMapResume(paused, 6000).state, 6000);
        assert.equal(progress.showResume, false);
        assert.equal(progress.showProgress, true);
        assert.match(progress.status, /Resuming map/);
    });

    it('does not let an effect tick start a resume', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const failed = noteResumeFailed(requestMapResume(paused, 6000).state, 2, 7000).state;
        assert.equal(recoveryEffectTick(paused).state, paused);
        assert.equal(recoveryEffectTick(failed).state.phase, 'resume-failed');
        assert.equal(recoveryEffectTick(liveState()).state.phase, 'live');
    });
});
