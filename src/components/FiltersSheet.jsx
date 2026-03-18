import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const FiltersSheet = ({ onClose, venueCount }) => {
  const [selectedFilters, setSelectedFilters] = useState(['Bar', '☀️ Sunny Now', 'Outdoor Seating']);

  const sections = [
    {
      label: 'Vibe',
      pills: ['Bar', 'Cafe', 'Beer Garden', 'Rooftop', 'Park']
    },
    {
      label: 'Sun Timing',
      pills: ['☀️ Sunny Now', '🌅 Golden Hour', '🌤 Sunny This Arvo', '🌧 Rain OK']
    },
    {
      label: 'Features',
      pills: ['Outdoor Seating', 'Dog Friendly', 'Live Music', 'Food Available']
    }
  ];

  const toggleFilter = (pill) => {
    setSelectedFilters(prev => 
      prev.includes(pill) ? prev.filter(f => f !== pill) : [...prev, pill]
    );
  };

  return (
    <>
      {/* Overlay */}
      <div 
        onClick={onClose}
        className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-[4px]"
      />
      
      {/* Sheet Container */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed bottom-0 left-0 right-0 z-[1001] bg-[#FFFDF5] rounded-t-[24px] p-6 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] flex flex-col pointer-events-auto"
      >
        {/* Drag Handle */}
        <div className="w-12 h-1.5 rounded-full bg-[#F59E0B] mx-auto mb-4" />

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-[20px] font-[800] text-[#1A1A1A]">Filters</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 text-[#1A1A1A] hover:bg-black/10 transition-colors"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Sections */}
        <div className="flex flex-col gap-6 overflow-y-auto max-h-[60vh] pb-4">
          {sections.map(section => (
            <div key={section.label}>
              <h3 className="text-[12px] font-bold text-[#4A4A4A]/60 uppercase tracking-widest mb-3">{section.label}</h3>
              <div className="flex flex-wrap gap-2">
                {section.pills.map(pill => {
                  const isSelected = selectedFilters.includes(pill);
                  return (
                    <button
                      key={pill}
                      onClick={() => toggleFilter(pill)}
                      className={`
                        px-4 py-2 rounded-full text-[13px] font-semibold transition-all duration-200
                        ${isSelected 
                          ? 'bg-[#FFF7ED] border-2 border-[#F59E0B] text-[#92400E]' 
                          : 'bg-white border border-[#D1D5DB] text-[#4A4A4A] hover:border-[#F59E0B]/50'
                        }
                      `}
                    >
                      {pill}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="mt-6 w-full bg-[#F59E0B] text-white text-[16px] font-[800] py-4 rounded-xl shadow-[0_8px_20px_rgba(245,158,11,0.3)] hover:brightness-105 transition-all active:scale-[0.98]"
        >
          Show {venueCount ?? 0} Sunny Spots
        </button>
      </motion.div>
    </>
  );
};

export default FiltersSheet;
