import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { FILTER_CATEGORIES } from '../data/demoVenues';
import { clayIconFor, clayIconUrls } from '../utils/clayFilterIcons';

// Hashed /assets/<name>-<hash>.webp URLs, so new artwork is never cached stale.
const CLAY_ICON_URLS = clayIconUrls(
    import.meta.glob('../assets/clay/*.webp', { eager: true, import: 'default' })
);

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

    return (
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
                    >
                        <div className="ss-filter-sheet-head">
                            <h3>Filters</h3>
                            {safeActiveFilters.length > 0 && (
                                <button type="button" onClick={onClearAll} className="ss-filter-sheet-clear">Clear all</button>
                            )}
                            <button type="button" onClick={onClose} className="ss-filter-sheet-close" aria-label="Close filters">
                                <X size={18} />
                            </button>
                        </div>
                        
                        <div className="ss-filter-chip-grid">
                            {FILTER_CATEGORIES.map(filter => {
                                const isActive = safeActiveFilters.includes(filter.id);
                                const clayIcon = clayIconFor(filter.id, CLAY_ICON_URLS);
                                return (
                                    <button
                                        key={filter.id}
                                        type="button"
                                        onClick={() => onToggleFilter(filter.id)}
                                        className={`ss-filter-chip ${isActive ? 'ss-filter-chip--active' : ''}`}
                                        aria-pressed={isActive}
                                    >
                                        {clayIcon ? (
                                            <img
                                                src={clayIcon}
                                                alt=""
                                                width={44}
                                                height={44}
                                                loading="lazy"
                                                decoding="async"
                                                draggable={false}
                                                className="ss-filter-chip-icon"
                                            />
                                        ) : (
                                            <span className="ss-filter-chip-emoji" aria-hidden="true">{filter.icon}</span>
                                        )}
                                        <span>{filter.label}</span>
                                        {isActive && (
                                            <span className="ss-filter-chip-check" aria-hidden="true">
                                                <Check size={13} strokeWidth={3} />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        
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

                        {/* Sticky Apply Button */}
                        <div className="ss-filter-sheet-footer">
                            <button
                                className="ss-filter-sheet-apply"
                                onClick={onClose}
                                type="button"
                            >
                                Show {resultCount} venue{resultCount !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default FilterSheet;
