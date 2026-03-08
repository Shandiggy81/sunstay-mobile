import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';

const FILTER_GROUPS = [
    {
        label: 'Outdoor type',
        ids: ['rooftop', 'beer-garden', 'shade'],
    },
    {
        label: 'Sun preference',
        ids: ['sun-morning', 'sun-sunset', 'sun-allday', 'sun-shaded'],
    },
    {
        label: 'Accessibility',
        ids: ['pram-friendly', 'wheelchair'],
    },
    {
        label: 'Venue features',
        ids: ['pet-friendly', 'smoking', 'large-groups', 'live-music'],
    },
    {
        label: 'Food & drink',
        ids: ['gluten-free', 'vegan', 'craft-beer', 'specialty-coffee'],
    },
];

const FilterChip = ({ filter, active, onToggle }) => (
    <button
        onClick={() => onToggle(filter.id)}
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-sm font-medium border transition-all w-full text-left ${
            active
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-gray-50 border-gray-100 text-gray-700 hover:border-gray-200'
        }`}
    >
        <span className="text-base leading-none flex-shrink-0">{filter.icon}</span>
        <span className="flex-1">{filter.label}</span>
        {active && <Check size={14} className="text-amber-500 flex-shrink-0" />}
    </button>
);

const FiltersPanel = ({ isOpen, onClose, filterCategories, activeFilters, onFilterToggle }) => {
    const activeCount = activeFilters.length;

    const getFilter = (id) => filterCategories.find(f => f.id === id);

    const handleClearAll = () => {
        activeFilters.forEach(f => onFilterToggle(f));
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/20"
                        style={{ pointerEvents: 'auto' }}
                    />
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 280, mass: 0.8 }}
                        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl"
                        style={{ maxHeight: '75vh' }}
                    >
                        <div className="flex-shrink-0 pt-3 pb-0 flex justify-center">
                            <div className="w-9 h-1 rounded-full bg-gray-200" />
                        </div>

                        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100">
                            <div>
                                <h2 className="font-bold text-gray-900 text-base">Filters</h2>
                                {activeCount > 0 && (
                                    <p className="text-xs text-amber-600 font-medium mt-0.5">{activeCount} active</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {activeCount > 0 && (
                                    <button
                                        onClick={handleClearAll}
                                        className="text-xs font-semibold text-gray-500 px-3 py-1.5 rounded-full bg-gray-100"
                                    >
                                        Clear all
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
                                >
                                    <X size={13} className="text-gray-500" />
                                </button>
                            </div>
                        </div>

                        <div className="overflow-y-auto px-4 py-4 space-y-5" style={{ maxHeight: 'calc(75vh - 100px)', WebkitOverflowScrolling: 'touch' }}>
                            {FILTER_GROUPS.map(group => {
                                const filters = group.ids.map(id => getFilter(id)).filter(Boolean);
                                if (filters.length === 0) return null;
                                return (
                                    <div key={group.label}>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
                                            {group.label}
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {filters.map(filter => (
                                                <FilterChip
                                                    key={filter.id}
                                                    filter={filter}
                                                    active={activeFilters.includes(filter.id)}
                                                    onToggle={onFilterToggle}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="px-4 pb-6 pt-2 border-t border-gray-100">
                            <button
                                onClick={onClose}
                                className="w-full py-3.5 bg-gray-900 text-white font-bold text-sm rounded-2xl"
                            >
                                {activeCount > 0 ? `Show results · ${activeCount} filter${activeCount > 1 ? 's' : ''} active` : 'Done'}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default FiltersPanel;
