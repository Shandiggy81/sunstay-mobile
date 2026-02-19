import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ArrowRight, Star, Users, DollarSign, Cloud, Wind, Sun } from 'lucide-react';
import { useWeather } from '../context/WeatherContext';
import { compareVenues } from '../data/comparisonIntelligence';

const VenueComparison = ({ venues, onClose, onSelect }) => {
    const { weather } = useWeather();
    const comparison = compareVenues(venues, weather);

    if (!comparison) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/35"
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="p-6 bg-gradient-to-r from-amber-400 to-orange-500 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-2xl font-black tracking-tight">Venue Comparison</h2>
                        <p className="text-white/80 text-sm font-medium">Find your perfect sun-safe spot</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Comparison Content */}
                <div className="overflow-auto p-4 md:p-8">
                    <div className="grid grid-cols-[140px_1fr_1fr_1fr] gap-4 min-w-[700px]">
                        {/* Labels Column */}
                        <div className="flex flex-col gap-8 pt-[120px]">
                            <div className="h-16 flex items-center text-sm font-bold text-gray-400 uppercase tracking-widest">Current Weather</div>
                            <div className="h-16 flex items-center text-sm font-bold text-gray-400 uppercase tracking-widest">Weather Trend</div>
                            <div className="h-16 flex items-center text-sm font-bold text-gray-400 uppercase tracking-widest">Price & Cap</div>
                            <div className="h-16 flex items-center text-sm font-bold text-gray-400 uppercase tracking-widest">Features</div>
                        </div>

                        {/* Venue Columns */}
                        {venues.map((venue) => {
                            const report = comparison.reports.find(r => r.venueId === venue.id);
                            const isBest = comparison.bestVenueId === venue.id;

                            return (
                                <div key={venue.id} className={`flex flex-col gap-8 p-4 rounded-2xl transition-all ${isBest ? 'bg-amber-50 ring-2 ring-amber-400 shadow-lg' : 'bg-gray-50'}`}>
                                    {/* Venue Info Card */}
                                    <div className="h-[100px] flex flex-col justify-center items-center text-center relative">
                                        {isBest && (
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-amber-400 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-md uppercase tracking-wider whitespace-nowrap">
                                                ★ Best Choice
                                            </div>
                                        )}
                                        <div className="text-3xl mb-1">{venue.emoji}</div>
                                        <div className="font-black text-gray-800 leading-tight">{venue.venueName}</div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{venue.vibe} · {venue.suburb}</div>
                                    </div>

                                    {/* Weather Row */}
                                    <div className="h-16 flex flex-col justify-center items-center gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-black text-gray-800">{Math.round(weather?.main?.temp || 0)}°</span>
                                            <span className="p-1.5 rounded-lg bg-white shadow-sm border border-gray-100">
                                                {report.windIcon}
                                            </span>
                                        </div>
                                        <div className="text-[10px] font-bold text-gray-500">{report.windLabel} Wind</div>
                                    </div>

                                    {/* Trend Row */}
                                    <div className="h-16 flex flex-col justify-center items-center text-center">
                                        <div className="text-xl mb-1">{report.sunTrendIcon}</div>
                                        <div className="text-[10px] font-bold text-gray-700 leading-tight px-2">{report.sunTrend}</div>
                                    </div>

                                    {/* Price/Cap Row */}
                                    <div className="h-16 flex flex-col justify-center items-center gap-1">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1 text-amber-600 font-black">
                                                <DollarSign className="w-3 h-3" />
                                                <span className="text-xs">{venue.price || '$$'}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-blue-600 font-black">
                                                <Users className="w-3 h-3" />
                                                <span className="text-xs">{venue.capacity || '???'}</span>
                                            </div>
                                        </div>
                                        <div className="text-[10px] font-bold text-gray-500">Avg. Price & Capacity</div>
                                    </div>

                                    {/* Features Row */}
                                    <div className="h-16 flex flex-wrap justify-center content-center gap-1">
                                        {venue.tags.slice(0, 3).map(tag => (
                                            <span key={tag} className="text-[8px] font-black px-2 py-0.5 rounded-md bg-white text-gray-500 border border-gray-100 uppercase">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Action */}
                                    <button
                                        onClick={() => onSelect(venue)}
                                        className={`mt-auto w-full py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 ${isBest
                                            ? 'bg-amber-400 text-white shadow-lg shadow-amber-200 hover:scale-[1.02]'
                                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                                            }`}
                                    >
                                        Book Now <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer Recommendation */}
                <div className="p-6 bg-gray-50 border-t border-gray-100 shrink-0 flex items-center gap-4">
                    <div className="p-3 bg-amber-100 rounded-2xl shrink-0">
                        <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
                    </div>
                    <div>
                        <div className="text-sm font-black text-gray-800">Recommendation</div>
                        <div className="text-xs font-medium text-gray-600 italic">"{comparison.recommendation}"</div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default VenueComparison;
