import { useEffect, useState } from 'react';
import {
    ENABLE_MAPBOX,
    ENABLE_MASCOT_PULL_REFRESH,
    ENABLE_SHEET_MOTION,
    crashTestId,
    mapSurfaceMode,
    sheetSurfaceMode,
    venueListMode,
} from '../utils/iosCrashIsolation';
import {
    formatIsolationHudLines,
    getIsolationEvents,
    subscribeIsolationLog,
} from '../utils/iosCrashLog';

/**
 * DEV-only HUD. Renders small strings only — never API payloads.
 * Temporary with the iOS crash isolation matrix.
 */
export default function IsolationDevLog() {
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!import.meta.env.DEV) return undefined;
        return subscribeIsolationLog(() => setTick((n) => n + 1));
    }, []);

    if (!import.meta.env.DEV) return null;

    const testId = crashTestId({
        map: ENABLE_MAPBOX,
        motion: ENABLE_SHEET_MOTION,
        pull: ENABLE_MASCOT_PULL_REFRESH,
    });
    const lines = formatIsolationHudLines();
    const recent = getIsolationEvents().slice(-8);

    return (
        <aside
            data-testid="isolation-dev-log"
            data-crash-test={testId}
            className="pointer-events-none fixed left-1 top-14 z-[240] max-h-[38vh] max-w-[220px] overflow-auto rounded-lg bg-slate-950/80 px-2 py-1.5 font-mono text-[10px] leading-snug text-amber-100 shadow-lg"
            aria-hidden="true"
        >
            <p>test {testId}</p>
            <p>map:{mapSurfaceMode()}</p>
            <p>motion:{sheetSurfaceMode()}</p>
            <p>pull:{venueListMode()}</p>
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
