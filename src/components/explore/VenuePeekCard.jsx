import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import { getSunBadge } from './WeatherBadgeRow';

const VenuePeekCard = ({ venue, weather, onExpand, onClose }) => {
    if (!venue) return null;
    const badge = getSunBadge(weather);
    const primaryTag = (venue.tags || []).find(t =>
        ['Beer Garden', 'Rooftop', 'Waterfront', 'Outdoor Seating', 'Fireplace', 'Heaters'].includes(t)
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
        >
            <div className="flex items-center gap-2.5 px-3 py-2.5">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">
                    {venue.emoji}
                </div>

                <button className="flex-1 min-w-0 text-left" onClick={onExpand}>
                    <p className="font-bold text-gray-900 text-[13px] leading-tight truncate">
                        {venue.venueName}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.color}`}>
                            {badge.icon} {badge.label}
                        </span>
                        {primaryTag && (
                            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full font-medium">
                                {primaryTag}
                            </span>
                        )}
                    </div>
                </button>

                <button
                    onClick={onExpand}
                    className="flex-shrink-0 w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center"
                >
                    <ChevronRight size={13} className="text-white" />
                </button>

                <button
                    onClick={onClose}
                    className="flex-shrink-0 w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center"
                >
                    <X size={12} className="text-gray-500" />
                </button>
            </div>
        </motion.div>
    );
};

export default VenuePeekCard;
