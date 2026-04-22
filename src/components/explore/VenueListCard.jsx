import React from 'react';
import { motion } from 'framer-motion';
import { Flame, MapPin } from 'lucide-react';
import { useWeather } from '../../context/WeatherContext';
import { calculateLiveSunScore, getComfortTier } from '../../util/sunScore';
import { getHappyHourBadge } from '../../util/happyHour';

const VenueListCard = ({ venue, isSelected, onClick, weather }) => {
    const { cozyMode } = useWeather();
    const liveInput = {
        shortwaveRadiation: weather?.shortwaveRadiation ?? 0,
        apparentTemp: weather?.main?.feels_like ?? weather?.main?.temp ?? 20,
        precipProbability: weather?.precipProbability ?? 0,
        cloudCover: weather?.cloudCoverPct ?? weather?.clouds?.all ?? 0,
        windGusts: weather?.windGusts ?? (weather?.wind?.speed ?? 0) * 3.6,
        isDay: weather?.isDay ?? 1,
    };
    const tags = venue.tags || [];
    const hasHeat =
        tags.includes('Fireplace') ||
        tags.includes('Heaters') ||
        venue?.heating ||
        venue?.fireplace;
    const isCozyPick = cozyMode?.isActive && hasHeat;
    const baseScore = calculateLiveSunScore(liveInput).score;
    const displayScore = Math.min(100, baseScore + (isCozyPick ? 22 : 0));
    const tier = getComfortTier(displayScore);
    const scorePillStyle = {
        prime:    { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: '☀️'  },
        good:     { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: '🌤️' },
        moderate: { bg: 'bg-gray-100',    text: 'text-gray-600',    icon: '⛅'  },
        cosy:     { bg: 'bg-blue-50',     text: 'text-blue-600',    icon: '🛋️' },
    }[tier];
    const hasOutdoor = tags.some(t =>
        ['Beer Garden', 'Rooftop', 'Waterfront', 'Outdoor Seating'].includes(t)
    );
    const primaryTag = venue.tags?.[0];
    const hhBadge = getHappyHourBadge(venue.happyHour);

    return (
        <motion.button
            whileTap={{ scale: 0.985 }}
            onClick={onClick}
            className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all ${
                isSelected
                    ? 'bg-amber-50'
                    : isCozyPick
                        ? 'bg-gradient-to-r from-amber-50 via-orange-50 to-white hover:from-amber-50 hover:via-orange-50 hover:to-white active:bg-amber-50'
                        : 'bg-white hover:bg-gray-50/80 active:bg-gray-50'
            } ${isCozyPick ? 'ring-1 ring-amber-200/70 shadow-[0_8px_24px_rgba(245,158,11,0.08)]' : ''}`}
        >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
                isSelected
                    ? 'bg-amber-100'
                    : isCozyPick
                        ? 'bg-gradient-to-br from-amber-100 to-orange-100'
                        : 'bg-gray-100'
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
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full flex-shrink-0 ${scorePillStyle.bg}`}>
                        <span className="text-[10px]">{scorePillStyle.icon}</span>
                        <span className={`text-[10px] font-bold tabular-nums ${scorePillStyle.text}`}>{displayScore}</span>
                    </div>
                </div>

                {(primaryTag || hasOutdoor || isCozyPick || hhBadge.show) && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                        {hhBadge.show && (
                            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                                hhBadge.color === 'amber'
                                    ? 'text-amber-700 bg-amber-100 border-amber-200'
                                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            }`}>
                                <span>{hhBadge.icon}</span>
                                <span>{hhBadge.label}</span>
                            </span>
                        )}
                        {isCozyPick && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                                <Flame size={10} />
                                Cozy Pick
                            </span>
                        )}
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
