import React, { useDeferredValue, useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronRight, ListFilter, MapPin, Search, X } from 'lucide-react';
import headerLogo from '../assets/logo-header.png';
import { presentWind } from '../utils/presentWind';
import { resolveFiltersControls } from '../utils/filtersControls';
import { headerWeatherSummary } from '../utils/headerWeatherSummary';
import { weatherClayIcon } from '../utils/weatherClayIcon';
import ClayIcon from './common/ClayIcon.jsx';
import VenueIcon from './common/VenueIcon';
import { venueIcon } from '../utils/clayIcons';
import { searchSuggestions } from '../utils/searchSuggestions.js';
import { venueTypeLabel } from '../utils/venueTypeLabel';
import SunnyMascot from './SunnyMascot.jsx';
import './ExploreHeader.css';
import './MapFirstTopBar.css';

const LOGO_W = 251;
const LOGO_H = 192;

/** Floating map controls; all weather, search and Sunny behavior remains shared. */
const suggestionType = venue => venueTypeLabel(venue?.typeLabel || venue?.vibe || '');

const TopBar = ({ weather, onFiltersOpen, comfort, searchQuery = '', onSearchChange, onSearchSubmit, venues = null, onSuggestionSelect, isChatOpen, onSunnyClick, selectedVenue }) => {
    const [open, setOpen] = useState(false);
    // Type-ahead: venues by name, then suburbs (utils/searchSuggestions.js).
    const [searchFocused, setSearchFocused] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const listboxId = useId();
    const typed = useDeferredValue(searchQuery);
    const suggestions = useMemo(
        () => (searchFocused && onSuggestionSelect ? searchSuggestions(typed, venues, { typeLabel: suggestionType }) : { venues: [], places: [] }),
        [searchFocused, typed, venues, onSuggestionSelect],
    );
    const options = useMemo(() => [
        ...suggestions.venues.map(s => ({ kind: 'venue', key: `v-${s.venue.id}`, ...s })),
        ...suggestions.places.map(p => ({ kind: 'place', key: `p-${p.label}`, ...p })),
        ...(suggestions.venues.length || suggestions.places.length ? [{ kind: 'all', key: 'all' }] : []),
    ], [suggestions]);
    const showSuggestions = searchFocused && options.length > 0;
    const choose = (option, input) => {
        if (!option) return;
        input?.blur?.();
        setSearchFocused(false);
        setActiveIndex(-1);
        if (option.kind === 'venue') onSuggestionSelect?.(option.venue);
        else if (option.kind === 'place') { onSearchChange?.(option.label); onSearchSubmit?.(); }
        else onSearchSubmit?.();
    };
    const reducedMotion = useReducedMotion();
    const detailsId = useId();
    const windView = presentWind(weather);
    const filtersUi = resolveFiltersControls();
    const summary = headerWeatherSummary(weather, { windView, comfort });

    return (
        <motion.header
            initial={reducedMotion ? false : { y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
            className={`ss-explore-topbar ss-map-first-topbar ${showSuggestions ? 'ss-map-first-topbar--suggesting' : ''}`}
        >
            <div className="ss-map-first-topbar-row">
                <img src={headerLogo} alt="Sunstay" width={LOGO_W} height={LOGO_H}
                    draggable={false} decoding="async" className="ss-map-first-brand" />
                <div className="ss-map-first-search-column">
                    <div className="ss-map-first-search-pill" role="search">
                        <Search size={16} aria-hidden="true" className="ss-map-first-search-icon" />
                        <input type="text" inputMode="search" aria-label="Search venues" placeholder="Find me a sunny spot…"
                            role="combobox" aria-autocomplete="list" aria-expanded={showSuggestions} aria-controls={listboxId}
                            aria-activedescendant={showSuggestions && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
                            value={searchQuery} onChange={event => { onSearchChange?.(event.target.value); setActiveIndex(-1); }}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => { setSearchFocused(false); setActiveIndex(-1); }}
                            onKeyDown={event => {
                                if (showSuggestions && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                                    event.preventDefault();
                                    const step = event.key === 'ArrowDown' ? 1 : -1;
                                    setActiveIndex(index => (index + step + options.length) % options.length);
                                    return;
                                }
                                if (event.key === 'Escape' && showSuggestions) { event.preventDefault(); setActiveIndex(-1); event.currentTarget.blur(); return; }
                                if (event.key !== 'Enter') return;
                                if (showSuggestions && activeIndex >= 0) { event.preventDefault(); choose(options[activeIndex], event.currentTarget); return; }
                                // The keyboard's Search key shows the results and drops the keyboard.
                                if (searchQuery.trim()) { event.preventDefault(); event.currentTarget.blur(); onSearchSubmit?.(); }
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
            {showSuggestions ? (
                <ul id={listboxId} role="listbox" aria-label="Search suggestions" className="ss-search-suggestions">
                    {options.map((option, index) => (
                        <li key={option.key} id={`${listboxId}-${index}`} role="option" aria-selected={index === activeIndex}
                            className={`ss-search-suggestion ${index === activeIndex ? 'ss-search-suggestion--active' : ''} ${option.kind === 'all' ? 'ss-search-suggestion--all' : ''}`}
                            // Keep focus in the input until the tap lands, so the list doesn't vanish first.
                            onPointerDown={event => event.preventDefault()}
                            onClick={() => choose(option, document.activeElement)}>
                            {option.kind === 'venue' ? <>
                                <span className="ss-search-suggestion-icon"><VenueIcon icon={venueIcon(option.venue)} size={26} /></span>
                                <span className="ss-search-suggestion-text"><strong>{option.name}</strong>{option.detail ? <small>{option.detail}</small> : null}</span>
                            </> : option.kind === 'place' ? <>
                                <span className="ss-search-suggestion-icon"><MapPin size={18} aria-hidden="true" /></span>
                                <span className="ss-search-suggestion-text"><strong>{option.label}</strong><small>{option.count.toLocaleString('en-AU')} {option.count === 1 ? 'venue' : 'venues'}</small></span>
                            </> : <>
                                <span className="ss-search-suggestion-text"><strong>Show all results</strong></span>
                                <ChevronRight size={16} aria-hidden="true" />
                            </>}
                        </li>
                    ))}
                </ul>
            ) : null}
            {open && !showSuggestions && summary.details.length ? (
                <dl id={detailsId} className="ss-explore-weather-details ss-map-first-weather-details">
                    {summary.details.map(item => <div key={item.label} className="ss-explore-weather-detail">
                        <dt className="text-[11px] font-medium text-slate-500">{item.label}</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-slate-800">{item.value}</dd>
                        {item.note ? <dd className="text-[11px] text-slate-500">{item.note}</dd> : null}
                    </div>)}
                </dl>
            ) : null}
        </motion.header>
    );
};

export default TopBar;
