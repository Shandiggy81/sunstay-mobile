import React, { useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ListFilter, Search, X } from 'lucide-react';
import headerLogo from '../assets/logo-header.png';
import { presentWind } from '../utils/presentWind';
import { resolveFiltersControls } from '../utils/filtersControls';
import { headerWeatherSummary } from '../utils/headerWeatherSummary';
import { weatherClayIcon } from '../utils/weatherClayIcon';
import ClayIcon from './common/ClayIcon.jsx';
import SunnyMascot from './SunnyMascot.jsx';
import './ExploreHeader.css';
import './MapFirstTopBar.css';

const LOGO_W = 251;
const LOGO_H = 192;

/** Floating map controls; all weather, search and Sunny behavior remains shared. */
const TopBar = ({ weather, onFiltersOpen, comfort, searchQuery = '', onSearchChange, onSearchSubmit, isChatOpen, onSunnyClick, selectedVenue }) => {
    const [open, setOpen] = useState(false);
    const reducedMotion = useReducedMotion();
    const detailsId = useId();
    const windView = presentWind(weather);
    const filtersUi = resolveFiltersControls();
    const summary = headerWeatherSummary(weather, { windView, comfort });

    return (
        <motion.div
            initial={reducedMotion ? false : { y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
            className="ss-explore-topbar ss-map-first-topbar"
        >
            <div className="ss-map-first-topbar-row">
                <img src={headerLogo} alt="Sunstay" width={LOGO_W} height={LOGO_H}
                    draggable={false} decoding="async" className="ss-map-first-brand" />
                <div className="ss-map-first-search-column">
                    <div className="ss-map-first-search-pill">
                        <Search size={16} aria-hidden="true" className="ss-map-first-search-icon" />
                        <input type="text" inputMode="search" aria-label="Search venues" placeholder="Find me a sunny spot…"
                            value={searchQuery} onChange={event => onSearchChange?.(event.target.value)}
                            onKeyDown={event => {
                                // The keyboard's Search key shows the results and drops the keyboard.
                                if (event.key === 'Enter' && searchQuery.trim()) { event.preventDefault(); event.currentTarget.blur(); onSearchSubmit?.(); }
                            }}
                            autoComplete="off" spellCheck={false} enterKeyHint="search" />
                        {searchQuery && <button type="button" aria-label="Clear search"
                            className="ss-map-first-search-clear" onClick={() => onSearchChange?.('')}><X size={16} /></button>}
                        <SunnyMascot variant="compact" onClick={onSunnyClick} isChatOpen={isChatOpen} selectedVenue={selectedVenue} />
                    </div>
                    <button type="button" onClick={() => setOpen(value => !value)} disabled={!summary.details.length}
                        aria-expanded={open} aria-controls={detailsId} className="ss-map-first-weather">
                        <ClayIcon name={weatherClayIcon(summary.condition, { isNight: weather?.isDay === false })} size={20} />
                        <span><strong>{summary.temperature}</strong> <span>{summary.condition}</span></span>
                        {summary.details.length ? <ChevronDown size={12} aria-hidden="true" className={open ? 'rotate-180' : ''} /> : null}
                    </button>
                </div>
                {typeof onFiltersOpen === 'function' && filtersUi.headerVisible && (
                    <button type="button" onClick={event => { event.stopPropagation(); onFiltersOpen(event); }}
                        className="ss-explore-filter-button ss-map-first-filters" aria-label={filtersUi.headerAccessibleName} title={filtersUi.headerLabel}>
                        <ListFilter size={19} strokeWidth={2.25} aria-hidden="true" />
                    </button>
                )}
            </div>
            {open && summary.details.length ? (
                <dl id={detailsId} className="ss-explore-weather-details ss-map-first-weather-details">
                    {summary.details.map(item => <div key={item.label} className="ss-explore-weather-detail">
                        <dt className="text-[11px] font-medium text-slate-500">{item.label}</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-slate-800">{item.value}</dd>
                        {item.note ? <dd className="text-[11px] text-slate-500">{item.note}</dd> : null}
                    </div>)}
                </dl>
            ) : null}
        </motion.div>
    );
};

export default TopBar;
