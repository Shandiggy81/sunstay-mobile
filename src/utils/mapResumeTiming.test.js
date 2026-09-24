import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    claimCameraRestore,
    clearResumeTimingStore,
    closeResumeTiming,
    createResumeTiming,
    formatResumeHudLines,
    getResumeTimingSnapshot,
    markResumeStage,
    recordResumeMark,
    RESUME_STAGE_ORDER,
    resetResumeTimingStore,
    resumeDurations,
} from './mapResumeTiming.js';
import {
    SLOW_RESUME_MS,
    mapRecoveryControl,
    noteContextLost,
    noteMapLoaded,
    noteResumeFailed,
    recoveryEffectTick,
    requestMapResume,
    startMapLoad,
    createMapRecoveryState,
} from './mapRecovery.js';

function liveState() {
    const started = startMapLoad(createMapRecoveryState());
    return noteMapLoaded(started.state, started.state.generation).state;
}

describe('resume timing marks', () => {
    it('records stages in order and calculates durations', () => {
        let timing = createResumeTiming(2, 0);
        const stages = [
            ['resume-click', 0],
            ['resume-start', 4],
            ['map-create-start', 10],
            ['map-instance-created', 25],
            ['map-camera-start', 26],
            ['map-camera-end', 28],
            ['map-style-ready', 40],
            ['map-load', 100],
            ['map-sources-layers-ready', 110],
            ['map-markers-ready', 130],
            ['map-live', 131],
            ['resume-placeholder-hidden', 132],
            ['map-optional-overlays-start', 140],
            ['map-optional-overlays-end', 155],
        ];
        for (const [stage, now] of stages) {
            timing = markResumeStage(timing, 2, stage, now);
        }
        const durations = resumeDurations(timing);
        assert.equal(durations['resume-total-ms'], 132);
        assert.equal(durations['map-create-ms'], 15);
        assert.equal(durations['map-load-ms'], 75);
        assert.equal(durations['map-style-ms'], 15);
        assert.equal(durations['map-sources-layers-ms'], 10);
        assert.equal(durations['map-markers-ms'], 20);
        assert.equal(durations['map-camera-ms'], 2);
        assert.equal(durations['map-optional-overlays-ms'], 15);
        assert.equal(durations['map-live-to-placeholder-hidden-ms'], 1);
        assert.deepEqual(Object.keys(timing.marks), stages.map(([stage]) => stage));
    });

    it('ignores marks from a stale generation', () => {
        let timing = markResumeStage(createResumeTiming(2, 0), 2, 'resume-click', 0);
        const stale = markResumeStage(timing, 1, 'map-load', 50);
        assert.equal(stale, timing);
        assert.equal(stale.marks['map-load'], undefined);
    });

    it('reports missing stages as n/a and does not invent a total', () => {
        const durations = resumeDurations(markResumeStage(createResumeTiming(2, 0), 2, 'resume-click', 5));
        assert.equal(durations['resume-total-ms'], 'n/a');
        assert.equal(durations['map-load-ms'], 'n/a');
        assert.equal(durations['map-markers-ms'], 'n/a');
        assert.equal(formatResumeHudLines(createResumeTiming(2, 0))[0], 'resume-total-ms:n/a');
    });

    it('closes timing so later marks are ignored', () => {
        const open = markResumeStage(createResumeTiming(2, 0), 2, 'resume-click', 1);
        const closed = closeResumeTiming(open);
        const ignored = markResumeStage(closed, 2, 'map-load', 9);
        assert.equal(ignored.marks['map-load'], undefined);
        resetResumeTimingStore();
        recordResumeMark(2, 'resume-click', 1);
        clearResumeTimingStore();
        recordResumeMark(2, 'map-load', 9);
        assert.equal(getResumeTimingSnapshot().marks['map-load'], undefined);
        resetResumeTimingStore();
    });

    it('keeps map-live after camera restoration and marker sync', () => {
        assert.ok(RESUME_STAGE_ORDER.indexOf('map-camera-end') < RESUME_STAGE_ORDER.indexOf('map-load'));
        assert.ok(RESUME_STAGE_ORDER.indexOf('map-markers-ready') < RESUME_STAGE_ORDER.indexOf('map-live'));
        assert.ok(RESUME_STAGE_ORDER.indexOf('map-live') < RESUME_STAGE_ORDER.indexOf('resume-placeholder-hidden'));
        let timing = createResumeTiming(2, 0);
        RESUME_STAGE_ORDER.forEach((stage, index) => {
            timing = markResumeStage(timing, 2, stage, index * 10);
        });
        const repeated = markResumeStage(timing, 2, 'map-load', 9999);
        assert.equal(repeated.marks['map-load'], timing.marks['map-load']);
        assert.equal(resumeDurations(timing)['resume-total-ms'], 110);
        assert.notEqual(resumeDurations(timing)['resume-total-ms'], 21648);
    });

    it('restores the camera at most once per generation', () => {
        const first = claimCameraRestore(new Set(), 2);
        const second = claimCameraRestore(first.claimed, 2);
        const nextGeneration = claimCameraRestore(second.claimed, 3);
        assert.equal(first.restore, true);
        assert.equal(second.restore, false);
        assert.equal(nextGeneration.restore, true);
    });
});

describe('resume placeholder copy', () => {
    it('keeps the placeholder on Resuming map until the slow threshold', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const resuming = requestMapResume(paused, 6000).state;
        const fresh = mapRecoveryControl(resuming, 6000);
        assert.equal(fresh.showProgress, true);
        assert.equal(fresh.showResume, false);
        assert.equal(fresh.status, 'Resuming map…');
        assert.equal(SLOW_RESUME_MS, 3000);
        const slow = mapRecoveryControl(resuming, 6000 + SLOW_RESUME_MS);
        assert.equal(slow.status, 'Still loading the map…');
        assert.equal(slow.showProgress, true);
        assert.equal(recoveryEffectTick(resuming).state.phase, 'resuming');
        assert.equal(requestMapResume(resuming, 10000).reason, 'locked');
    });

    it('hides the placeholder once the resume is live', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const resuming = requestMapResume(paused, 6000).state;
        const live = noteMapLoaded(resuming, resuming.generation).state;
        const control = mapRecoveryControl(live, 7000);
        assert.equal(control.showProgress, false);
        assert.equal(control.showResume, false);
        assert.equal(control.status, '');
    });

    it('tells the user to reload when resume fails', () => {
        const paused = noteContextLost(liveState(), 1, 1000).state;
        const resuming = requestMapResume(paused, 6000).state;
        const failed = noteResumeFailed(resuming, resuming.generation, 6500).state;
        const control = mapRecoveryControl(failed, 7000);
        assert.equal(control.showResume, false);
        assert.equal(control.status, 'Map could not be resumed. Reload the page to try again.');
        assert.equal(recoveryEffectTick(failed).state.phase, 'resume-failed');
    });
});
