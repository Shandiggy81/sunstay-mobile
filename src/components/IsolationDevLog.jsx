import { useEffect, useState } from 'react';
import {
    ENABLE_MAPBOX,
    ENABLE_MASCOT_PULL_REFRESH,
    ENABLE_SHEET_MOTION,
    MAP_LIFECYCLE,
    MATRIX_HUD,
    SHEET_BACKDROP_MODE,
    SHEET_WILL_CHANGE_MODE,
    VENUE_RENDER_LIMIT,
    VENUE_RENDER_MODE,
    crashTestId,
    mapSurfaceMode,
    renderMatrixTestId,
    sheetSurfaceMode,
    venueListMode,
} from '../utils/iosCrashIsolation';
import {
    formatIsolationHudLines,
    getIsolationEvents,
    subscribeIsolationLog,
} from '../utils/iosCrashLog';
import { getMapLifecycleSnapshot } from '../utils/mapLifecycle';
import { formatResumeHudLines, getResumeTimingSnapshot } from '../utils/mapResumeTiming';

/**
 * DEV-only HUD. Renders small strings only — never API payloads.
 * Temporary with the iOS crash isolation matrix.
 */
export default function IsolationDevLog() {
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!import.meta.env.DEV && !MATRIX_HUD) return undefined;
        return subscribeIsolationLog(() => setTick((n) => n + 1));
    }, []);

    if (!import.meta.env.DEV && !MATRIX_HUD) return null;

    const testId = crashTestId({
        map: ENABLE_MAPBOX,
        motion: ENABLE_SHEET_MOTION,
        pull: ENABLE_MASCOT_PULL_REFRESH,
    });
    const cardMatrix = renderMatrixTestId({
        map: ENABLE_MAPBOX,
        limit: VENUE_RENDER_LIMIT,
        motion: ENABLE_SHEET_MOTION,
    });
    const lines = formatIsolationHudLines();
    const recent = getIsolationEvents().slice(-8);
    const mapSession = getMapLifecycleSnapshot();

    return (
        <aside
            data-testid="isolation-dev-log"
            data-crash-test={testId}
            className="pointer-events-none fixed left-1 top-14 z-[240] max-h-[38vh] max-w-[220px] overflow-auto rounded-lg bg-slate-950/80 px-2 py-1.5 font-mono text-[10px] leading-snug text-amber-100 shadow-lg"
            aria-hidden="true"
        >
            <p>test {testId}</p>
            <p>cards {cardMatrix}</p>
            <p>flag-map:{mapSurfaceMode()}</p>
            <p>flag-motion:{sheetSurfaceMode()}</p>
            <p>flag-pull:{venueListMode()}</p>
            <p>flag-limit:{VENUE_RENDER_MODE === 'progressive' ? 'progressive' : (VENUE_RENDER_LIMIT ?? 'all')}</p>
            <p>flag-will:{SHEET_WILL_CHANGE_MODE}</p>
            <p>flag-blur:{SHEET_BACKDROP_MODE}</p>
            <p>flag-life:{MAP_LIFECYCLE}</p>
            <p>map-mounts:{mapSession.mountCount}</p>
            <p>map-removes:{mapSession.removeCount}</p>
            <p>map-live:{mapSession.liveInstances}</p>
            <p>map-camera:{mapSession.cameraRestore}</p>
            <p>map-duplicate:{mapSession.duplicateDetected ? '1' : '0'}</p>
            {mapSession.lastUnmountAt != null ? <p>map-unmount-at:{mapSession.lastUnmountAt}</p> : null}
            {mapSession.lastRemountDurationMs != null ? <p>map-remount-ms:{mapSession.lastRemountDurationMs}</p> : null}
            {formatResumeHudLines(getResumeTimingSnapshot()).map((line) => (
                <p key={line}>{line}</p>
            ))}
            {lines.map((line) => (
                <p key={line}>{line}</p>
            ))}
            {recent.map((event, index) => (
                <p key={`${event.at}-${index}`}>
                    {event.kind}:{event.message}
                </p>
            ))}
        </aside>
    );
}
