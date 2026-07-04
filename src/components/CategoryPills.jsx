// src/components/CategoryPills.jsx
import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PILL_CATEGORIES } from '../data/pillCategories';

const CategoryPills = ({ activeCategory, onCategoryChange }) => {
  const scrollRef = useRef(null);
  const activeRef = useRef(null);

  // Auto-scroll active pill into view when it changes
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeCategory]);

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.35, type: 'spring', damping: 24, stiffness: 200 }}
      className="px-3 pt-1.5 pb-0"
    >
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {PILL_CATEGORIES.map((cat, index) => {
          const isActive = activeCategory === cat.id;
          return (
            <motion.button
              key={cat.id}
              ref={isActive ? activeRef : null}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + index * 0.04, type: 'spring', stiffness: 260, damping: 20 }}
              whileTap={{ scale: 0.91 }}
              whileHover={{ scale: 1.04 }}
              onClick={() => onCategoryChange(cat.id)}
              style={isActive ? {
                background: cat.activeGradient,
                boxShadow: `0 4px 14px ${cat.activeShadow}`,
                border: '1.5px solid transparent',
                color: '#fff',
              } : {
                background: 'rgba(255,255,255,0.92)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                border: '1.5px solid rgba(0,0,0,0.07)',
                color: '#374151',
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11.5px] font-bold whitespace-nowrap flex-shrink-0 transition-colors"
            >
              <span className="text-[13px] leading-none">{cat.icon}</span>
              <span style={{ letterSpacing: '0.01em' }}>{cat.label}</span>
              {isActive && (
                <motion.span
                  layoutId="pill-active-dot"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.7)',
                    display: 'inline-block',
                    marginLeft: 1,
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default CategoryPills;
