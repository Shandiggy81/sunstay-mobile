import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { FILTER_CATEGORIES } from '../data/demoVenues';

const FilterSheet = ({
    isOpen,
    onClose,
    activeFilters,
    onToggleFilter,
    onClearAll,
    customFilters,
    newCustomFilter,
    setNewCustomFilter,
    onAddCustomFilter,
    resultCount
}) => {
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
                            {activeFilters.length > 0 && (
                                <button onClick={onClearAll} className="ss-filter-sheet-clear">Clear all</button>
                            )}
                            <button onClick={onClose} className="ss-filter-sheet-close">
                                <X size={18} />
                            </button>
                        </div>
                        
                        <div className="ss-filter-chip-grid">
                            {FILTER_CATEGORIES.map(filter => {
                                const isActive = activeFilters.includes(filter.id);
                                return (
                                    <button
                                        key={filter.id}
                                        onClick={() => onToggleFilter(filter.id)}
                                        className={`ss-filter-chip ${isActive ? 'ss-filter-chip--active' : ''}`}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span>{filter.icon}</span>
                                            <span>{filter.label}</span>
                                        </div>
                                        {isActive && <Check size={14} className="text-blue-600" />}
                                    </button>
                                );
                            })}
                        </div>
                        
                        <div className="custom-filter-section">
                            <p className="filter-section-label">YOUR FILTERS</p>
                            <div className="custom-filter-chips">
                                {customFilters.map(f => (
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
