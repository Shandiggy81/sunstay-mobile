import React from 'react';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { getSunBadge } from './WeatherBadgeRow';

const VenueListCard = ({ venue, isSelected, onClick, weather }) => {
    const badge = getSunBadge(weather);
    const hasOutdoor = (venue.tags || []).some(t =>
        ['Beer Garden', 'Rooftop', 'Waterfront', 'Outdoor Seating'].includes(t)
    );
    const primaryTag = venue.tags?.[0];

    return (
        <motion.button
            whileTap={{ scale: 0.985 }}
            onClick={onClick}
            className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                isSelected ? 'bg-amber-50' : 'bg-white hover:bg-gray-50/80 active:bg-gray-50'
            }`}
        >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
                isSelected ? 'bg-amber-100' : 'bg-gray-100'
            }`}>
                {venue.emoji}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className={`font-semibold text-[13px] leading-tight truncate ${
                            isSelected ? 'text-amber-700' : 'text-gray-900'
                        }`}>
                            {venue.venueName}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                            <MapPin size={9} className="text-gray-400 flex-shrink-0" />
                            <p className="text-[11px] text-gray-400 truncate">
                                {venue.vibe || venue.segment} · {venue.suburb}
                            </p>
                        </div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full flex-shrink-0 ${badge.bg}`}>
                        {badge.icon && <span className="text-[10px]">{badge.icon}</span>}
                        <span className={`text-[10px] font-semibold ${badge.color}`}>{badge.label}</span>
                    </div>
                </div>

                {(primaryTag || hasOutdoor) && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                        {hasOutdoor && (
                            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full font-medium">
                                Outdoor
                            </span>
                        )}
                        {primaryTag && !['Beer Garden', 'Rooftop', 'Waterfront'].includes(primaryTag) && (
                            <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full font-medium">
                                {primaryTag}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </motion.button>
    );
};

export default VenueListCard;
