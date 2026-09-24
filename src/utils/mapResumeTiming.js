/**
 * Monotonic stage timings for one Resume map attempt.
 * Missing stages stay `n/a`. A mark from another generation is ignored.
 * `map-remount-ms` in the lifecycle session is a different measurement:
 * wall time from teardown until the next mount claim, including the pause
 * and the user's wait. These marks start at the Resume click.
 *
 * Implemented order, which is earlier for the camera than a sources-then-camera
 * sequence. `jumpTo` runs once, immediately after the instance exists, so it
 * cannot fight marker setup. `map-live` is still recorded only after that
 * camera restore and after current-generation markers have synced:
 *
 * resume-click → resume-start → map-create-start → map-instance-created
 * → map-camera-start → map-camera-end → map-style-ready → map-load
 * → map-sources-layers-ready → map-markers-ready → map-live
 * → resume-placeholder-hidden
 * Optional cloud, radar, and time-of-day work is marked after the placeholder
 * is cleared. `map-style-ready` can precede `map-load` because Mapbox emits
 * `style.load` first.
 */

export const RESUME_STAGE_ORDER = Object.freeze([
    'resume-click',
    'resume-start',
    'map-create-start',
    'map-instance-created',
    'map-camera-start',
    'map-camera-end',
    'map-style-ready',
    'map-load',
    'map-sources-layers-ready',
    'map-markers-ready',
    'map-live',
    'resume-placeholder-hidden',
]);

export const RESUME_TIMING_STAGES = Object.freeze([
    'resume-click',
    'resume-start',
    'map-create-start',
    'map-instance-created',
    'map-load',
    'map-style-ready',
    'map-sources-layers-ready',
    'map-markers-ready',
    'map-camera-start',
    'map-camera-end',
    'map-optional-overlays-start',
    'map-optional-overlays-end',
    'map-live',
    'resume-placeholder-hidden',
    'resume-failed',
]);

const DURATION_SPANS = Object.freeze([
    ['resume-total-ms', 'resume-click', 'resume-placeholder-hidden'],
    ['map-create-ms', 'map-create-start', 'map-instance-created'],
    ['map-load-ms', 'map-instance-created', 'map-load'],
    ['map-style-ms', 'map-instance-created', 'map-style-ready'],
    ['map-sources-layers-ms', 'map-load', 'map-sources-layers-ready'],
    ['map-markers-ms', 'map-sources-layers-ready', 'map-markers-ready'],
    ['map-camera-ms', 'map-camera-start', 'map-camera-end'],
    ['map-optional-overlays-ms', 'map-optional-overlays-start', 'map-optional-overlays-end'],
    ['map-live-to-placeholder-hidden-ms', 'map-live', 'resume-placeholder-hidden'],
]);

export function createResumeTiming(generation, now) {
    return { generation, marks: {}, closed: false, origin: now };
}

export function markResumeStage(state, generation, stage, now) {
    if (!state || state.closed) return state;
    if (generation !== state.generation) return state;
    if (!RESUME_TIMING_STAGES.includes(stage)) return state;
    if (state.marks[stage] != null) return state;
    return {
        ...state,
        marks: { ...state.marks, [stage]: now },
    };
}

export function closeResumeTiming(state) {
    if (!state) return state;
    return { ...state, closed: true };
}

function span(marks, start, end) {
    if (marks[start] == null || marks[end] == null) return 'n/a';
    return marks[end] - marks[start];
}

export function resumeDurations(state) {
    const marks = state?.marks ?? {};
    const durations = {};
    for (const [name, start, end] of DURATION_SPANS) {
        durations[name] = span(marks, start, end);
    }
    return durations;
}

export function formatResumeHudLines(state) {
    if (!state) return [];
    const durations = resumeDurations(state);
    return [
        `resume-total-ms:${durations['resume-total-ms']}`,
        `map-load-ms:${durations['map-load-ms']}`,
        `map-markers-ms:${durations['map-markers-ms']}`,
        `map-camera-ms:${durations['map-camera-ms']}`,
        `stage-live-ms:${span(state?.marks ?? {}, 'resume-click', 'map-live')}`,
    ];
}

/** One camera restore per map generation. */
export function claimCameraRestore(claimed, generation) {
    const next = claimed ?? new Set();
    if (next.has(generation)) return { claimed: next, restore: false };
    const updated = new Set(next);
    updated.add(generation);
    return { claimed: updated, restore: true };
}

let activeTiming = null;

export function resetResumeTimingStore() {
    activeTiming = null;
    return activeTiming;
}

export function getResumeTimingSnapshot() {
    return activeTiming;
}

export function recordResumeMark(generation, stage, now = performance.now()) {
    if (stage === 'resume-click') {
        activeTiming = createResumeTiming(generation, now);
    }
    activeTiming = markResumeStage(activeTiming, generation, stage, now);
    return activeTiming;
}

export function clearResumeTimingStore() {
    activeTiming = closeResumeTiming(activeTiming);
    return activeTiming;
}
