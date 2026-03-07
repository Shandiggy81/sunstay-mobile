import React, { useRef } from 'react';
import { motion } from 'framer-motion';

const CategoryPills = ({ categories, activeCategory, onCategoryChange }) => {
    const scrollRef = useRef(null);

    return (
        <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35, type: 'spring', damping: 24, stiffness: 200 }}
            className="px-3 pt-1.5 pb-0"
        >
            <div
                ref={scrollRef}
                className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {categories.map((cat) => {
                    const isActive = activeCategory === cat.id;
                    return (
                        <motion.button
                            key={cat.id}
                            whileTap={{ scale: 0.93 }}
                            onClick={() => onCategoryChange(cat.id)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap flex-shrink-0 transition-all shadow-sm ${
                                isActive
                                    ? 'bg-amber-500 text-white shadow-amber-200 shadow-md'
                                    : 'bg-white/95 text-gray-700 border border-gray-100 hover:bg-white'
                            }`}
                        >
                            <span className="text-[12px] leading-none">{cat.icon}</span>
                            <span>{cat.label}</span>
                        </motion.button>
                    );
                })}
            </div>
        </motion.div>
    );
};

export default CategoryPills;
