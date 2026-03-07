import React, { useRef } from 'react';
import { motion } from 'framer-motion';

const CategoryPills = ({ categories, activeCategory, onCategoryChange }) => {
    const scrollRef = useRef(null);

    return (
        <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35, type: 'spring', damping: 24, stiffness: 200 }}
            className="px-3 py-2"
        >
            <div
                ref={scrollRef}
                className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {categories.map((cat) => {
                    const isActive = activeCategory === cat.id;
                    return (
                        <motion.button
                            key={cat.id}
                            whileTap={{ scale: 0.93 }}
                            onClick={() => onCategoryChange(cat.id)}
                            className={`
                                flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0 transition-all shadow-sm
                                ${isActive
                                    ? 'bg-amber-500 text-white shadow-amber-200 shadow-md'
                                    : 'bg-white/92 text-gray-700 border border-gray-100 hover:bg-white'
                                }
                            `}
                        >
                            <span className="text-sm leading-none">{cat.icon}</span>
                            <span>{cat.label}</span>
                        </motion.button>
                    );
                })}
            </div>
        </motion.div>
    );
};

export default CategoryPills;
