import React from 'react';
import { motion } from 'framer-motion';
import { Map, List } from 'lucide-react';

const MapListToggle = ({ mode, onChange }) => {
    return (
        <div className="flex items-center bg-white/95 border border-gray-200 rounded-full shadow-md p-0.5">
            <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={() => onChange('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                    mode === 'map'
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'text-gray-500'
                }`}
            >
                <Map size={12} />
                <span>Map</span>
            </motion.button>
            <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={() => onChange('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                    mode === 'list'
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'text-gray-500'
                }`}
            >
                <List size={12} />
                <span>List</span>
            </motion.button>
        </div>
    );
};

export default MapListToggle;
