import React from 'react';
import { motion } from 'framer-motion';
import { FILTER_CATEGORIES } from '../data/demoVenues';

const FilterBar = ({ activeFilters, onFilterToggle, onClearFilters }) => {
    return (
        <div className="w-full overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 pb-2 px-1 min-w-max">
                {/* Clear All button - only show when filters active */}
                {activeFilters.length > 0 && (
                    <motion.button
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onClearFilters}
                        className="px-4 py-2 rounded-full text-sm font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors whitespace-nowrap"
                    >
                        Clear All ✕
                    </motion.button>
                )}

                {/* Filter chips */}
                {FILTER_CATEGORIES.map((filter, index) => {
                    const isActive = activeFilters.includes(filter.id);

                    return (
                        <motion.button
                            key={filter.id}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onFilterToggle(filter.id)}
                            className={`px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 touch-pan-x ${isActive
                                ? 'bg-orange-50 text-[#c2410c] border-[#c2410c] shadow-sm'
                                : 'bg-white/80 text-gray-700 hover:bg-white border border-gray-200'
                                }`}
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
