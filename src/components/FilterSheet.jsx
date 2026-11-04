import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { clayIconFor, clayIconUrls } from '../utils/clayFilterIcons';
import { SHOW_CUSTOM_FILTERS } from '../utils/demoDeadEnds';
import { quickPicks, filterSheetGroups, groupSelectedCount } from '../utils/filterSheetGroups.js';

// Hashed /assets/<name>-<hash>.webp URLs, so new artwork is never cached stale.
const CLAY_ICON_URLS = clayIconUrls(
    import.meta.glob('../assets/clay/*.webp', { eager: true, import: 'default' })
);

const QUICK_PICKS = quickPicks();
const FILTER_GROUPS = filterSheetGroups();

const FilterSheet = ({
    isOpen,
    onClose = () => {},
    activeFilters = [],
    onToggleFilter = () => {},
    onClearAll = () => {},
    customFilters = [],
    newCustomFilter = '',
    setNewCustomFilter = () => {},
    onAddCustomFilter = () => {},
    resultCount = 0
}) => {
    const safeActiveFilters = Array.isArray(activeFilters) ? activeFilters : [];
    const safeCustomFilters = Array.isArray(customFilters) ? customFilters : [];

    const [openGroups, setOpenGroups] = React.useState([]);
    const closeRef = React.useRef(null);
    const panelRef = React.useRef(null);
    const quickSelected = QUICK_PICKS.filter(filter => safeActiveFilters.includes(filter.id)).length;

    // Keep focus inside the dialog, then restore its opener on every close path.
    React.useEffect(() => {
        if (!isOpen) return undefined;
        const previous = document.activeElement instanceof HTMLButtonElement
            ? document.activeElement : document.querySelector('.ss-map-first-filters');
        setOpenGroups([]);
        closeRef.current?.focus({ preventScroll: true });
        const onKeyDown = event => {
            if (event.key === 'Escape') onClose();
            if (event.key !== 'Tab') return;
            const controls = [...(panelRef.current?.querySelectorAll('button:not(:disabled), input, [tabindex="0"]') ?? [])]
                .filter(element => element.getClientRects().length > 0);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
        };
    }, [isOpen, onClose]);

    const renderFilter = (filter, quick = false) => {
        const isActive = safeActiveFilters.includes(filter.id);
        const clayIcon = clayIconFor(filter.id, CLAY_ICON_URLS);
        return <button key={filter.id} type="button" onClick={() => onToggleFilter(filter.id)}
            className={`ss-filter-chip${quick ? '' : ' ss-filter-chip--row'}${isActive ? ' ss-filter-chip--active' : ''}`}
            aria-pressed={isActive}>
            {clayIcon ? <img src={clayIcon} alt="" width={quick ? 22 : 28} height={quick ? 22 : 28}
                loading="lazy" decoding="async" draggable={false} className="ss-filter-chip-icon" />
                : <span className="ss-filter-chip-emoji" aria-hidden="true">{filter.icon}</span>}
            <span>{filter.label}</span>
            {isActive ? <Check className="ss-filter-chip-check" size={16} strokeWidth={2.5} aria-hidden="true" /> : null}
        </button>;
    };

    // Let the overlay's z-index apply above the venue list, outside .ss-main.
    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="ss-filter-sheet-backdrop"
                    />
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="ss-filter-sheet"
                        ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="ss-filter-sheet-title"
                    >
                        <div className="ss-filter-sheet-handle" aria-hidden="true"><span /></div>
                        <div className="ss-filter-sheet-head">
                            <div>
                                <h3 id="ss-filter-sheet-title">Filters</h3>
                                <p>Find your kind of place</p>
                            </div>
                            <button ref={closeRef} type="button" onClick={onClose} className="ss-filter-sheet-close" aria-label="Close filters">
                                <X size={20} aria-hidden="true" />
                            </button>
                        </div>
                        <div className="ss-filter-sheet-scroll">
                            <section>
                                <div className="ss-filter-sheet-section-head">
                                    <h4 id="ss-filter-quick-heading">Quick picks</h4>
                                    {quickSelected > 0 ? <span>{quickSelected} selected</span> : null}
                                </div>
                                <div className="ss-filter-quick-picks" role="group" aria-labelledby="ss-filter-quick-heading">
                                    {QUICK_PICKS.map(filter => renderFilter(filter, true))}
                                </div>
                            </section>
                            <section className="ss-filter-all" aria-labelledby="ss-filter-all-heading">
                                <h4 id="ss-filter-all-heading">All filters</h4>
                                {FILTER_GROUPS.map(group => {
                                    const expanded = openGroups.includes(group.id);
                                    const selected = groupSelectedCount(group, safeActiveFilters);
                                    const panelId = `ss-filter-group-${group.id}`;
                                    return <section key={group.id} className="ss-filter-group">
                                        <h5>
                                            <button type="button" className="ss-filter-group-toggle" aria-expanded={expanded} aria-controls={panelId}
                                                onClick={() => setOpenGroups(current => expanded ? current.filter(id => id !== group.id) : [...current, group.id])}>
                                                <img src={CLAY_ICON_URLS[group.icon]} alt="" width={28} height={28} draggable={false} />
                                                <span className="ss-filter-group-title">{group.title}</span>
                                                <span className={`ss-filter-group-count${selected > 0 ? ' ss-filter-group-count--selected' : ''}`}>{selected > 0 ? `${selected} selected` : group.size}</span>
                                                <ChevronDown size={18} aria-hidden="true" />
                                            </button>
                                        </h5>
                                        <div id={panelId} hidden={!expanded} className="ss-filter-group-options">
                                            {group.sections.map((section, index) => <div key={section.title ?? index}>
                                                {section.title ? <h6>{section.title}</h6> : null}
                                                {section.filters.map(filter => renderFilter(filter))}
                                            </div>)}
                                        </div>
                                    </section>;
                                })}
                            </section>

                        {SHOW_CUSTOM_FILTERS && (
                        <div className="custom-filter-section">
                            <p className="filter-section-label">YOUR FILTERS</p>
                            <div className="custom-filter-chips">
                                {safeCustomFilters.map(f => (
                                    <span key={f} className="filter-chip custom">✏️ {f}</span>
                                ))}
                            </div>
                            <div className="add-filter-row">
                                <input
                                    type="text"
                                    placeholder="Add your own filter..."
                                    value={newCustomFilter}
                                    onChange={e => setNewCustomFilter(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && onAddCustomFilter()}
                                    className="custom-filter-input"
                                />
                                <button onClick={onAddCustomFilter} className="add-filter-btn">+</button>
                            </div>
                        </div>
                        )}

                        </div>

                        {/* The footer stays outside the scrolling filter inventory. */}
                        <div className="ss-filter-sheet-footer">
                            <button type="button" onClick={onClearAll} disabled={safeActiveFilters.length === 0} className="ss-filter-sheet-clear">Clear all</button>
                            <button
                                className="ss-filter-sheet-apply"
                                onClick={onClose}
                                type="button"
                            >
                                <span>Show {resultCount} venue{resultCount !== 1 ? 's' : ''}</span>
                                <ChevronRight size={18} aria-hidden="true" />
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body,
    );
};

export default FilterSheet;
