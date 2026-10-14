import React, { useMemo } from 'react';
import { formatGuestWindows } from '../utils/balconySunEngine.js';
import { timelineSegments, timelineTicks, timelineMarker } from '../utils/comfortDisplay.js';

export default function SunDayTimeline({ daily, timeZone, now, label = 'Balcony sun' }) {
    const segments = useMemo(() => timelineSegments(daily.windows, daily.dayStart, daily.dayEnd), [daily]);
    const ticks = useMemo(() => timelineTicks(daily.dayStart, daily.dayEnd, timeZone), [daily, timeZone]);
    const marker = timelineMarker(now, daily.dayStart, daily.dayEnd);
    return (
        <div className="mt-4 mb-4" role="img" aria-label={`${label}: ${daily.windows.length ? formatGuestWindows(daily.windows, timeZone) : 'no direct sun'}. Amber shows sun; slate shows shade.${marker === null ? '' : ' Marker shows now.'}`}>
            <div className="relative h-3 rounded-full bg-slate-100" aria-hidden="true">
                <div className="absolute inset-0 overflow-hidden rounded-full">
                    {segments.map((segment, index) => <span key={index} className="absolute inset-y-0 bg-amber-400" style={{ left: `${segment.left}%`, width: `${segment.width}%` }} />)}
                </div>
                {marker !== null && <span className="absolute -top-1 h-5 w-0.5 bg-slate-800" style={{ left: `${marker}%` }} title="Now" />}
            </div>
            <div className="relative mt-2 h-4 text-[10px] font-medium text-slate-500" aria-hidden="true">
                {ticks.map((tick, index) => <span key={index} className="absolute whitespace-nowrap" style={{ left: `${tick.left}%`, transform: index === 0 ? undefined : index === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{tick.label}</span>)}
            </div>
        </div>
    );
}
