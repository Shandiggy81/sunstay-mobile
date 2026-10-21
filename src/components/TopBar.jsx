import React, { useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ListFilter } from 'lucide-react';
import headerLogo from '../assets/logo-header.png';
import { presentWind } from '../utils/presentWind';
import { resolveFiltersControls } from '../utils/filtersControls';
import { headerWeatherSummary } from '../utils/headerWeatherSummary';
import ClayIcon from './common/ClayIcon.jsx';
import './ExploreHeader.css';

const LOGO_W = 251;
const LOGO_H = 192;

/**
 * Compact weather header: one line ("22° · Sunny · Melbourne") with the
 * details (wind, rain, cloud, comfort) one tap away, like Google Maps'
 * "Weather in the area" card. Keeps the map as tall as possible on phones.
 */
const TopBar = ({ weather, onFiltersOpen, comfort }) => {
    const [open, setOpen] = useState(false);
    const reducedMotion = useReducedMotion();
    const detailsId = useId();
    const windView = presentWind(weather);
    const filtersUi = resolveFiltersControls();
    const summary = headerWeatherSummary(weather, { windView, comfort });

    return (
        <motion.div
            initial={reducedMotion ? false : { y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : { delay: 0.15, type: 'spring', damping: 24, stiffness: 240 }}
            className="ss-explore-topbar z-40 flex-shrink-0 pt-[env(safe-area-inset-top,0px)]"
        >
            <div className="ss-explore-topbar-surface">
                <div className="ss-explore-topbar-row">
                    <img
                        src={headerLogo}
                        alt="Sunstay"
                        width={LOGO_W}
                        height={LOGO_H}
                        draggable={false}
                        decoding="async"
                        className="ss-explore-brand"
                    />

                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        disabled={!summary.details.length}
                        aria-expanded={open}
                        aria-controls={detailsId}
                        className="ss-explore-weather touch-manipulation"
                    >
                        <ClayIcon name="sun" size={28} />
                        <span className="ss-explore-weather-copy">
                            <span className="ss-explore-weather-headline">
                                <strong>{summary.temperature}</strong>
                                <span>{summary.condition}</span>
                            </span>
                            <span className="ss-explore-weather-place">
                                Melbourne{summary.comfort ? ` · ${summary.comfort}` : ''}
                            </span>
                        </span>
                        {summary.details.length ? <ChevronDown
                            size={16}
                            strokeWidth={2.25}
                            aria-hidden="true"
                            className={`ss-explore-weather-chevron ${open ? 'rotate-180' : ''}`}
                        /> : null}
                    </button>

                    {typeof onFiltersOpen === 'function' && filtersUi.headerVisible && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onFiltersOpen(e);
                            }}
                            className="ss-explore-filter-button touch-manipulation"
                            aria-label={filtersUi.headerAccessibleName}
                            title={filtersUi.headerLabel}
                        >
                            <ListFilter size={16} strokeWidth={2.25} aria-hidden="true" />
                            <span>{filtersUi.headerLabel}</span>
                        </button>
                    )}
                </div>

                {open && summary.details.length ? (
                    <dl
                        id={detailsId}
                        className="ss-explore-weather-details"
                    >
                        {summary.details.map((item) => (
                            <div key={item.label} className="ss-explore-weather-detail">
                                <dt className="text-[11px] font-medium text-slate-500">{item.label}</dt>
                                <dd className="mt-0.5 font-semibold tabular-nums text-slate-800">{item.value}</dd>
                                {item.note ? <dd className="text-[11px] text-slate-500">{item.note}</dd> : null}
                            </div>
                        ))}
                    </dl>
                ) : null}
            </div>
        </motion.div>
    );
};

export default TopBar;
