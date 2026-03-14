import React from 'react';
import { motion } from 'framer-motion';

export const VenueListPanel = ({ venue, isSelected, onClick, weather }) => {
    const condition = (weather?.weather?.[0]?.main || '').toLowerCase();
    const emoji = condition.includes('rain') ? '🌧️' : condition.includes('cloud') ? '☁️' : '☀️';
    return (
        <motion.button
            layout
            whileHover={{ x: 2, backgroundColor: 'rgba(255,255,255,0.05)' }}
            whileTap={{ scale: 0.985 }}
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left border ${isSelected ? 'bg-amber-500/10 border-amber-400/25' : 'border-transparent hover:border-white/8'}`}
        >
            <span className="text-xl flex-shrink-0 leading-none">{venue.emoji}</span>
            <div className="flex-1 min-w-0">
                <div className="text-white font-semibold text-sm truncate leading-tight">{venue.venueName}</div>
                <div className="text-white/40 text-xs truncate mt-0.5">
                    {venue.typeCategory === 'ShortStay' || venue.typeCategory === 'Hotel' ? venue.typeLabel : venue.vibe}
                    {venue.suburb ? ` · ${venue.suburb}` : ''}
                </div>
            </div>
            <span className="text-sm flex-shrink-0 opacity-70">{emoji}</span>
        </motion.button>
    );
};
