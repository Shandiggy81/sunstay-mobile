import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, ChevronRight } from 'lucide-react';
import WeatherBadgeRow, { getSunBadge } from './WeatherBadgeRow';

const VenuePeekCard = ({ venue, weather, onExpand, onClose }) => {
    if (!venue) return null;
    const badge = getSunBadge(weather);
    const hasOutdoor = (venue.tags || []).some(t =>
        ['Beer Garden', 'Rooftop', 'Waterfront', 'Outdoor Seating'].includes(t)
    );
    const primaryTag = (venue.tags || []).find(t =>
        ['Beer Garden', 'Rooftop', 'Waterfront', 'Outdoor Seating', 'Fireplace', 'Heaters'].includes(t)
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mx-3 mb-2"
        >
            <button
                className="w-full flex items-center gap-3 p-3 text-left"
                onClick={onExpand}
            >
                <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
                    {venue.emoji}
                </div>

                <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm leading-tight truncate">
                        {venue.venueName}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                        <MapPin size={9} className="text-gray-400 flex-shrink-0" />
                        <p className="text-[11px] text-gray-400 truncate">
                            {venue.vibe || venue.segment} · {venue.suburb}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <WeatherBadgeRow weather={weather} compact />
                        {hasOutdoor && primaryTag && (
                            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full font-medium">
                                {primaryTag}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    <ChevronRight size={16} className="text-gray-400" />
                </div>
            </button>
        </motion.div>
    );
};

export default VenuePeekCard;
