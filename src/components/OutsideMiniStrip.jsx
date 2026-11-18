import React from 'react';
import './OutsideMiniStrip.css';

/**
 * A list row's miniature of the venue card's "Today outside" strip: the day's
 * sun over its wind, with a tick at the app's chosen hour. Decoration only:
 * the row's own words and label already say the sun and the wind.
 *
 * @param {{ strip: ReturnType<typeof import('../utils/outsideToday.js').miniStrip> }} props
 */
export default function OutsideMiniStrip({ strip }) {
    if (!strip) return null;
    return (
        <div className="ss-mini-outside" data-row-outside aria-hidden="true">
            <i style={{ background: strip.sun }} />
            {strip.wind ? <i className="is-wind" style={{ background: strip.wind }} /> : null}
            <span style={{ left: `${(strip.marker * 100).toFixed(2)}%` }} />
        </div>
    );
}
