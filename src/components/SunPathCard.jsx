import React, { useEffect, useId, useMemo, useState } from 'react';
import CompassDial from './common/CompassDial';
import { buildSunPath } from '../utils/sunPath';
import { checkIfShaded } from '../utils/solarMath.js';
import { cardinal } from '../utils/compass';

const CARD =
    'rounded-3xl border border-slate-900/[0.06] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.18)]';

const fmtTime = (d) =>
    d instanceof Date && Number.isFinite(d.getTime())
        ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
        : '–';

// Chart geometry (SVG user units; scales to card width).
const W = 320;
const H = 132;
const PAD_X = 14;
const HORIZON_Y = 112;
const ARC_H = 92;

function toXY(t, altitude, scale) {
    return [PAD_X + t * (W - PAD_X * 2), HORIZON_Y - (Math.max(0, altitude) / scale) * ARC_H];
}

function pathFrom(points, scale) {
    return points
        .map((p, i) => {
            const [x, y] = toXY(p.t, p.altitude, scale);
            return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');
}

function getStatus({ path, venue, sunWindow, contextIsRaining, contextCloudCover }) {
    const alt = path.current.altitude;
    if (alt <= 0) {
        return path.progress < 0
            ? { text: 'Before sunrise', tone: 'night' }
            : { text: 'Night', tone: 'night' };
    }
    const shaded = checkIfShaded(alt, venue?.obstacle_height ?? 2, venue?.obstacle_distance ?? 1);
    if (shaded) return { text: 'Shaded by surroundings', tone: 'muted' };
    if (contextIsRaining) return { text: 'Raining right now', tone: 'muted' };
    if (contextCloudCover > 75) return { text: 'Behind cloud', tone: 'muted' };
    if (sunWindow instanceof Date) return { text: `Direct sun until ${fmtTime(sunWindow)}`, tone: 'sun' };
    return { text: 'Direct sun', tone: 'sun' };
}

const TONE = {
    sun: 'bg-amber-50 text-amber-800 ring-amber-500/20',
    muted: 'bg-slate-100 text-slate-700 ring-slate-900/[0.06]',
    night: 'bg-indigo-50 text-indigo-800 ring-indigo-500/15',
};

/**
 * Where the sun is right now and the path it takes today: a compass for
 * direction and an altitude arc from sunrise to sunset.
 */
export default function SunPathCard({ lat, lng, venue, sunWindow, contextIsRaining, contextCloudCover }) {
    const gradId = useId().replace(/:/g, '');
    // Re-render every minute so the sun marker moves while the sheet is open.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);

    const path = useMemo(() => buildSunPath(lat, lng, now), [lat, lng, now]);
    if (!path) return null;

    const { current, progress, points } = path;
    const isUp = current.altitude > 0;
    const dir = cardinal(current.bearing);
    const status = getStatus({ path, venue, sunWindow, contextIsRaining, contextCloudCover });

    const scale = Math.max(path.maxAltitude, 35);
    const fullPath = pathFrom(points, scale);
    const p = Math.max(0, Math.min(1, progress));
    const elapsed = points.filter((pt) => pt.t <= p);
    // Close the elapsed segment exactly at "now" so the fill meets the marker.
    const [sx, sy] = toXY(p, isUp ? current.altitude : 0, scale);
    const elapsedPath = elapsed.length ? `${pathFrom(elapsed, scale)} L${sx.toFixed(1)} ${sy.toFixed(1)}` : '';
    const areaPath = elapsedPath
        ? `${elapsedPath} L${sx.toFixed(1)} ${HORIZON_Y} L${PAD_X} ${HORIZON_Y} Z`
        : '';
    const [noonX] = toXY(0.5, 0, scale);

    const headline = isUp
        ? `Sun in the ${dir?.long ?? '–'}`
        : progress < 0
            ? `Rises in the ${cardinal(bearingAt(lat, lng, path.sunrise))?.long ?? 'east'}`
            : 'Sun has set';
    const detail = isUp
        ? `${Math.round(current.altitude)}° above the horizon · sets ${fmtTime(path.sunset)}`
        : progress < 0
            ? `Sunrise ${fmtTime(path.sunrise)} · peaks at ${Math.round(path.maxAltitude)}°`
            : `Set ${fmtTime(path.sunset)} in the ${cardinal(bearingAt(lat, lng, path.sunset))?.short ?? 'west'} · rises ~${fmtTime(path.sunrise)}`;

    return (
        <section className={`${CARD} flex flex-col gap-4 p-4`} aria-label="Sun position">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-[17px] font-bold tracking-[-0.01em] text-slate-900">Sun position</h3>
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${TONE[status.tone]}`}>
                    {status.text}
                </span>
            </div>

            <div className="flex items-center gap-3.5">
                <CompassDial
                    bearing={isUp ? current.bearing : null}
                    variant="sun"
                    size={68}
                    muted={!isUp}
                    label={isUp ? `Sun bearing ${Math.round(current.bearing)} degrees, ${dir?.long}` : 'Sun below horizon'}
                />
                <div className="min-w-0">
                    <p className="text-[19px] font-bold leading-tight tracking-[-0.015em] text-slate-900">
                        {headline}
                    </p>
                    <p className="mt-1 text-[13px] font-medium leading-snug text-slate-500">{detail}</p>
                </div>
            </div>

            <div>
                <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
                    aria-label={`Sun path from ${fmtTime(path.sunrise)} to ${fmtTime(path.sunset)}`}>
                    <defs>
                        <linearGradient id={`${gradId}-fill`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id={`${gradId}-line`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#fb923c" />
                            <stop offset="50%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#f97316" />
                        </linearGradient>
                    </defs>

                    {/* noon guide */}
                    <line x1={noonX} y1={HORIZON_Y - ARC_H - 4} x2={noonX} y2={HORIZON_Y}
                        stroke="#e2e8f0" strokeDasharray="2 3" />
                    {/* horizon */}
                    <line x1="0" y1={HORIZON_Y} x2={W} y2={HORIZON_Y} stroke="#cbd5e1" strokeWidth="1" />
                    <rect x="0" y={HORIZON_Y} width={W} height={H - HORIZON_Y} fill="#f1f5f9" />

                    {/* remaining path */}
                    <path d={fullPath} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="1 5"
                        strokeLinecap="round" />
                    {/* travelled path */}
                    {areaPath && <path d={areaPath} fill={`url(#${gradId}-fill)`} />}
                    {elapsedPath && (
                        <path d={elapsedPath} fill="none" stroke={`url(#${gradId}-line)`} strokeWidth="3"
                            strokeLinecap="round" strokeLinejoin="round" />
                    )}

                    {/* sunrise / sunset ticks */}
                    {[0, 1].map((t) => {
                        const [x] = toXY(t, 0, scale);
                        return <circle key={t} cx={x} cy={HORIZON_Y} r="3" fill="#fff" stroke="#94a3b8" strokeWidth="1.5" />;
                    })}

                    {/* now marker */}
                    {isUp ? (
                        <g>
                            <circle cx={sx} cy={sy} r="13" fill="#fbbf24" opacity="0.22" />
                            <circle cx={sx} cy={sy} r="7.5" fill="#f59e0b" stroke="#fff" strokeWidth="2.5" />
                        </g>
                    ) : (
                        <circle cx={sx} cy={HORIZON_Y} r="5.5" fill="#64748b" stroke="#fff" strokeWidth="2" />
                    )}
                </svg>

                <div className="mt-1.5 grid grid-cols-3 text-[12px] font-medium text-slate-500">
                    <span>
                        <span className="block text-[14px] font-semibold tabular-nums text-slate-900">{fmtTime(path.sunrise)}</span>
                        Sunrise
                    </span>
                    <span className="text-center">
                        <span className="block text-[14px] font-semibold tabular-nums text-slate-900">{fmtTime(path.solarNoon)}</span>
                        Highest · {Math.round(path.maxAltitude)}°
                    </span>
                    <span className="text-right">
                        <span className="block text-[14px] font-semibold tabular-nums text-slate-900">{fmtTime(path.sunset)}</span>
                        Sunset
                    </span>
                </div>
            </div>
        </section>
    );
}

function bearingAt(lat, lng, date) {
    return buildSunPath(lat, lng, date)?.current.bearing ?? null;
}
