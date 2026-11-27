import React, { useMemo } from 'react';
import { compassArcPath, compassPointAt, sideWind, sunCompassView } from '../utils/sunCompass.js';
import { compassPoint } from '../utils/comfortDisplay.js';
import { stayRoomDisplay } from '../utils/stayRoomTypes.js';
import './SunCompass.css';

const CARDINALS = ['N', 'E', 'S', 'W'];
const ARC_RADIUS = 42, SUN_RADIUS = 58;

/**
 * A compass of the building: one arc per side, gold where the modelled direct
 * sun reaches it now, with the sun marked on its bearing. The list beside it
 * carries the same facts in words; the drawing is decorative. `sky` is the
 * sky-now verdict: while rain or cloud blocks the sun, no side is drawn or
 * worded as in the sun now.
 */
export default function SunCompass({ rooms, venue, date = null, now, wind = null, sky = null }) {
    const blocksSun = sky?.blocksSun === true;
    const view = useMemo(() => sunCompassView({
        rooms, venue, date, now, sky: { blocksSun },
        titleFor: (room) => {
            try { return stayRoomDisplay(venue, room, { now })?.title ?? null; } catch { return null; }
        },
    }), [rooms, venue, date, now, blocksSun]);
    if (!view) return null;
    const sunAt = view.sun ? compassPointAt(view.sun.bearing, SUN_RADIUS) : null;
    const rayFrom = view.sun ? compassPointAt(view.sun.bearing, 20) : null;
    const rayTo = view.sun ? compassPointAt(view.sun.bearing, SUN_RADIUS - 10) : null;
    // Wind is today's, so it is only drawn when the compass shows now.
    const windFrom = view.live && Number.isFinite(wind?.from) ? wind.from : null;
    const windTail = windFrom === null ? null : compassPointAt(windFrom, 36);
    const windTip = windFrom === null ? null : compassPointAt(windFrom, 19);
    const windName = windFrom === null ? null : compassPoint(windFrom);

    return (
        <div className="ss-compass" data-sun-compass>
            <svg viewBox="-68 -68 136 136" width="136" height="136" aria-hidden="true" focusable="false">
                <circle r={ARC_RADIUS} className="ss-compass__ring" />
                <rect x="-12" y="-12" width="24" height="24" rx="5" transform={`rotate(${view.buildingRotation})`} className="ss-compass__building" />
                {CARDINALS.map((letter, index) => {
                    const point = compassPointAt(index * 90, 27);
                    return <text key={letter} x={point.x} y={point.y} className="ss-compass__cardinal">{letter}</text>;
                })}
                {view.sides.map(side => (
                    <path key={side.id} d={compassArcPath(side.bearing, view.spread, ARC_RADIUS)} className="ss-compass__side" data-state={side.display} />
                ))}
                {windTip ? (
                    <g className="ss-compass__wind">
                        <line x1={windTail.x} y1={windTail.y} x2={windTip.x} y2={windTip.y} />
                        <circle cx={windTip.x} cy={windTip.y} r="3" />
                    </g>
                ) : null}
                {sunAt ? (
                    <>
                        <line x1={rayFrom.x} y1={rayFrom.y} x2={rayTo.x} y2={rayTo.y} className="ss-compass__ray" />
                        <circle cx={sunAt.x} cy={sunAt.y} r="9" className="ss-compass__halo" />
                        <circle cx={sunAt.x} cy={sunAt.y} r="5.5" className="ss-compass__sun" />
                    </>
                ) : null}
            </svg>
            <div className="ss-compass__body">
                <p className="ss-compass__label">
                    {view.live ? (view.night ? 'The sun is down' : 'Where the sun is now') : 'Sun by side on this date'}
                </p>
                <ul className="ss-compass__list">
                    {view.ranked.map(side => (
                        <li key={side.id}>
                            <i data-state={side.display} aria-hidden="true" />
                            <span>
                                <strong>{side.title}</strong>
                                {/* Under a blocked sky the total is clear-sky sun, not today's. */}
                                <span>{side.status}{side.totalMinutes > 0 ? ` · ${side.total}${view.live && !view.blocked ? ' today' : ''}` : ''}</span>
                                {windFrom !== null && sideWind(side.bearing, windFrom) ? <span className="ss-compass__side-wind" data-side-wind={sideWind(side.bearing, windFrom).key}>{sideWind(side.bearing, windFrom).text}</span> : null}
                            </span>
                        </li>
                    ))}
                </ul>
                <p className="ss-compass__note">
                    Clear-sky estimate from the sun’s path and nearby buildings.
                    {windFrom !== null ? ` Wind${windName ? ` from ${windName}` : ''}${Number.isFinite(wind?.kmh) ? `, ${Math.round(wind.kmh)} km/h in the open` : ''}: by side it is an estimate from the way each side faces.` : ''}
                </p>
            </div>
        </div>
    );
}
