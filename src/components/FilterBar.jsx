import React from 'react';
import { motion } from 'framer-motion';
import { FILTER_CATEGORIES } from '../data/demoVenues';

const FilterBar = ({ activeFilters, onFilterToggle, onClearFilters }) => {
    return (
        <div className="w-full overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 pb-1 px-1 min-w-max">
                {activeFilters.length > 0 && (
                    <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.92 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                        onClick={onClearFilters}
                        className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-white/10 text-white/60 border border-white/15 hover:bg-white/15 transition-colors whitespace-nowrap backdrop-blur-sm"
                    >
                        Clear ✕
                    </motion.button>
                )}

                {FILTER_CATEGORIES.map((filter, index) => {
                    const isActive = activeFilters.includes(filter.id);
                    return (
                        <motion.button
                            key={filter.id}
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03, type: 'spring', stiffness: 300, damping: 20 }}
                            whileHover={{ scale: 1.05, y: -1 }}
                            whileTap={{ scale: 0.93 }}
                            onClick={() => {
                                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
                                onFilterToggle(filter.id);
                            }}
                            className={`
                                px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap
                                flex items-center gap-1.5 touch-pan-x backdrop-blur-sm
                                ${isActive
                                    ? 'bg-amber-500/90 text-white border border-amber-400/60 shadow-lg shadow-amber-500/25'
                                    : 'bg-white/10 text-white/70 border border-white/15 hover:bg-white/18 hover:text-white'
                                }
                            `}
                        >
                            <span>{filter.icon}</span>
                            <span>{filter.label}</span>
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
};

export default FilterBar;
