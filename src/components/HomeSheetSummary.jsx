import { useLayoutEffect, useRef } from 'react';
import ClayIcon from './common/ClayIcon.jsx';
import HomeSheetMode from './HomeSheetMode.jsx';
import HomePopover from './HomePopover.jsx';
import DataBadge from './DataBadge.jsx';
import { Info } from 'lucide-react';

export function HomeDiscoveryInfo({ experienceContext, dataLabel, captionBadge, cozy }) {
    return <div className="ss-home-info-line"><span>Melbourne time · sun is modelled</span>
        <HomePopover label="About this map preview" className="ss-home-info" trigger={<Info size={18} aria-hidden="true" />}>
            <p>{experienceContext}</p><p>{dataLabel}</p>
            <p>Sun hours on café rows are direct sun at the venue's mapped point on a clear day.</p>
            {captionBadge && <DataBadge {...captionBadge} />}
            {cozy && <p>Cozy filter on</p>}
        </HomePopover>
    </div>;
}

export default function HomeSheetSummary({ mode, onModeChange, count, clause, onExpand }) {
    const row = useRef(null);
    const peek = Boolean(onExpand);
    useLayoutEffect(() => {
        if (!peek) return;
        const sheet = row.current.closest('.ss-home-sheet-peek');
        const home = sheet.closest('.ss-map-first-home');
        // Measure only the UI peek; map resize, camera and lifecycle stay untouched.
        const measure = () => home.style.setProperty('--home-peek-height', `${sheet.getBoundingClientRect().height}px`);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(sheet);
        return () => { observer.disconnect(); home.style.removeProperty('--home-peek-height'); };
    }, [peek]);
    const copy = <><span className="ss-home-count">{mode === 'after-dark' ? "Tonight's events" : count}</span>
        {mode === 'sun' && clause && <span className="ss-home-sun-clause"><ClayIcon name="sun" size={18} />{clause}</span>}</>;
    return <div ref={row} className="ss-home-summary-row">
        {onExpand ? <button type="button" className="ss-home-summary-copy" aria-label={mode === 'after-dark' ? "Show tonight's events" : 'Show venue list'}
            onClick={event => { event.stopPropagation(); onExpand(); }}>{copy}</button>
            : <div className="ss-home-summary-copy" role="heading" aria-level={2} aria-describedby={mode === 'sun' ? 'home-list-context' : undefined} id="mobile-discovery-results" tabIndex={-1}>{copy}</div>}
        <HomeSheetMode mode={mode} onChange={onModeChange} size="compact" />
    </div>;
}
