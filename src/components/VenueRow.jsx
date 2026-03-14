import React from 'react';
import { motion } from 'framer-motion';
import { Wind, Sun, CloudRain } from 'lucide-react';

const getSunBadge = (weather) => {
    if (!weather) return { label: 'Check conditions', color: 'text-gray-400', bg: 'bg-gray-50' };
    const condition = (weather.weather?.[0]?.main || '').toLowerCase();
    const temp = Math.round(weather.main?.temp || 0);
    const windSpeed = Math.round((weather.wind?.speed || 0) * 3.6);

    if (condition.includes('rain')) return { label: 'Rainy', color: 'text-blue-600', bg: 'bg-blue-50', icon: '🌧️' };
    if (windSpeed > 40) return { label: `Windy ${windSpeed}km/h`, color: 'text-slate-600', bg: 'bg-slate-50', icon: '💨' };
    if (condition.includes('clear') && temp >= 18) return { label: 'Great outdoors', color: 'text-amber-600', bg: 'bg-amber-50', icon: '☀️' };
    if (condition.includes('cloud')) return { label: 'Overcast', color: 'text-gray-500', bg: 'bg-gray-50', icon: '☁️' };
    return { label: `${temp}° · Mild`, color: 'text-green-600', bg: 'bg-green-50', icon: '🌤️' };
};

const VenueRow = ({ venue, isSelected, onClick, weather }) => {
    const badge = getSunBadge(weather);
    const primaryTag = venue.tags?.[0];
    const hasOutdoor = (venue.tags || []).some(t => ['Beer Garden', 'Rooftop', 'Waterfront', 'Outdoor Seating'].includes(t));

    return (
        <motion.button
            whileTap={{ scale: 0.985 }}
            onClick={onClick}
            className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                isSelected ? 'bg-amber-50' : 'bg-white hover:bg-gray-50/80 active:bg-gray-50'
            }`}
        >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${isSelected ? 'bg-amber-100' : 'bg-gray-100'}`}>
                {venue.emoji}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className={`font-semibold text-sm leading-tight truncate ${isSelected ? 'text-amber-700' : 'text-gray-900'}`}>
                            {venue.venueName}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {venue.vibe || venue.segment} · {venue.suburb}
                        </p>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full flex-shrink-0 ${badge.bg}`}>
                        {badge.icon && <span className="text-xs">{badge.icon}</span>}
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

export default VenueRow;
