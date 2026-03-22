import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Thermometer, Wind, Sun, CloudRain, Camera, Share2,
    Calendar, MapPin, Flame, Droplets, ChevronDown, ChevronUp,
    Shield, Check
} from 'lucide-react';
import { useWeather } from '../context/WeatherContext';
import { getWindProfile, calculateApparentTemp } from '../data/windIntelligence';
import { calculateDynamicToday } from '../util/sunCalcLogic';

const StatBox = ({ icon, value, label, highlight, accent }) => (
    <div className={`rounded-2xl p-3 text-center border ${
        highlight ? 'bg-amber-50 border-amber-200' :
        accent ? 'bg-sky-50 border-sky-100' :
        'bg-gray-50 border-gray-100'
    }`}>
        <div className={`flex justify-center mb-1 ${highlight ? 'text-amber-500' : accent ? 'text-sky-500' : 'text-gray-400'}`}>
            {icon}
        </div>
        <div className={`text-sm font-black leading-none ${highlight ? 'text-amber-700' : accent ? 'text-sky-700' : 'text-gray-800'}`}>
            {value}
        </div>
        <div className="text-[9px] text-gray-400 mt-0.5 uppercase tracking-wider font-medium">{label}</div>
    </div>
);

const TagPill = ({ tag }) => (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-100">
        {tag}
    </span>
);

const SunBar = ({ score }) => {
    const color = score >= 75 ? 'from-amber-400 to-yellow-300'
        : score >= 50 ? 'from-orange-400 to-amber-300'
        : 'from-sky-400 to-blue-300';
    const label = score >= 75 ? 'Excellent' : score >= 50 ? 'Good' : 'Fair';
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sunstay Score</span>
                <span className={`text-sm font-black bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
                    {score} · {label}
                </span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
                    className={`h-full rounded-full bg-gradient-to-r ${color}`}
                />
            </div>
        </div>
    );
};

const WindInfo = ({ weather, venue }) => {
    if (!weather) return null;
    const windSpeed = Math.round((weather.wind?.speed || 0) * 3.6);
    const windProfile = getWindProfile(venue);
    const apparentTemp = calculateApparentTemp(
        weather.main?.temp || 20,
        weather.wind?.speed || 0,
        weather.main?.humidity || 50
    );

    const getWindLabel = (speed) => {
        if (speed < 15) return { label: 'Calm', color: 'text-green-600', bg: 'bg-green-50', icon: '🌿' };
        if (speed < 30) return { label: 'Breezy', color: 'text-blue-600', bg: 'bg-blue-50', icon: '🌬️' };
        if (speed < 50) return { label: 'Windy', color: 'text-orange-600', bg: 'bg-orange-50', icon: '💨' };
        return { label: 'Very windy', color: 'text-red-600', bg: 'bg-red-50', icon: '🌀' };
    };

    const windInfo = getWindLabel(windSpeed);

    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${windInfo.bg} border-opacity-50 ${
            windInfo.bg.replace('bg-', 'border-').replace('-50', '-100')
        }`}>
            <span className="text-2xl">{windInfo.icon}</span>
            <div className="flex-1">
                <p className={`text-sm font-bold ${windInfo.color}`}>{windInfo.label} · {windSpeed} km/h</p>
                <p className="text-xs text-gray-500 mt-0.5">Feels like {Math.round(apparentTemp)}° · {windProfile?.shelter || 'Check conditions'}</p>
            </div>
        </div>
    );
};

const CameraButton = () => {
    const [toast, setToast] = useState(false);
    const inputRef = useRef(null);

    const handleCapture = (e) => {
        if (e.target.files?.length > 0) {
            setToast(true);
            setTimeout(() => setToast(false), 3000);
        }
        e.target.value = '';
    };

    return (
        <div className="relative">
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCapture}
            />
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => inputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-900 text-white font-semibold text-sm"
            >
                <Camera size={16} />
                <span>Take Live Photo</span>
            </motion.button>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 text-white text-xs font-medium px-3 py-2 rounded-xl flex items-center gap-2 shadow-xl"
                    >
                        <Check size={12} className="text-green-400" />
                        Photo captured — demo mode only, not saved
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const VenueDetail = ({ venue, onClose, weather }) => {
    const { calculateSunstayScore, getTemperature } = useWeather();
    const [showMore, setShowMore] = useState(false);

    const sunstayScore = calculateSunstayScore(venue);
    const temperature = getTemperature();
    const isRaining = (weather?.weather?.[0]?.main || '').toLowerCase().includes('rain');
    const windSpeedKmh = weather?.wind?.speed != null ? Math.round(weather.wind.speed * 3.6) : null;
    const uvIndex = weather?.uvi;

    const sunLeft = useMemo(() => {
        if (!weather?.sys?.sunset) return null;
        const now = new Date();
        const sunset = new Date(weather.sys.sunset * 1000);
        const diff = sunset - now;
        if (diff <= 0) return { text: 'Sun set', icon: '🌙' };
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        return { text: h > 0 ? `${h}h ${m}m` : `${m}m`, icon: h > 1 ? '☀️' : '🌅' };
    }, [weather]);

    const hasFireplace = venue.tags?.includes('Fireplace');
    const hasHeaters = venue.tags?.includes('Heaters');
    const heatingActive = (hasFireplace || hasHeaters) && (temperature == null || temperature < 18);

    const optimalWindow = useMemo(() => {
        const room = (venue.roomTypes || []).find(r => r.hasBalcony || r.hasOutdoorArea);
        if (!room) return null;
        try {
            const today = calculateDynamicToday(
                venue.lat, venue.lng, room.orientation,
                (weather?.clouds?.all || 0) / 100,
                room.obstructionLevel
            );
            return today?.optimalWindow || null;
        } catch { return null; }
    }, [venue, weather]);

    const typeLabel = venue.typeCategory === 'Hotel' || venue.typeCategory === 'ShortStay'
        ? venue.typeLabel
        : venue.vibe || 'Venue';

    return (
        <div className="px-4 pb-8 pt-2">
            {/* Venue header */}
            <div className="flex items-start gap-3 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-3xl flex-shrink-0 border border-gray-100">
                    {venue.emoji}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                    <h2 className="font-black text-gray-900 text-base leading-tight">{venue.venueName}</h2>
                    <p className="text-gray-500 text-xs mt-0.5">{typeLabel} · {venue.suburb}</p>
                    {venue.address && (
                        <div className="flex items-center gap-1 mt-1">
                            <MapPin size={10} className="text-gray-300 flex-shrink-0" />
                            <span className="text-[10px] text-gray-400 truncate">{venue.address}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Sun score bar */}
            <div className="mb-4">
                <SunBar score={sunstayScore} />
            </div>

            {/* Optimal window */}
            {optimalWindow && (
                <div className="mb-4 flex items-center gap-2.5 px-4 py-2.5 bg-amber-50 border border-amber-100 rounded-2xl">
                    <span className="text-xl">☀️</span>
                    <div>
                        <p className="text-xs font-bold text-amber-700">Best time to visit</p>
                        <p className="text-sm font-black text-amber-800">{optimalWindow}</p>
                    </div>
                </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <StatBox
                    icon={<Thermometer size={14} />}
                    value={temperature != null ? `${temperature}°` : '--'}
                    label="Temp"
                />
                <StatBox
                    icon={<span className="text-sm">{sunLeft?.icon ?? '☀️'}</span>}
                    value={sunLeft?.text ?? '--'}
                    label="Sun left"
                    highlight={!!sunLeft && !isRaining}
                />
                <StatBox
                    icon={<Wind size={14} />}
                    value={windSpeedKmh != null ? `${windSpeedKmh}` : '--'}
                    label="Wind km/h"
                    accent={windSpeedKmh != null && windSpeedKmh > 30}
                />
            </div>

            {/* Wind info */}
            <div className="mb-4">
                <WindInfo weather={weather} venue={venue} />
            </div>

            {/* Heating badge */}
            {(hasFireplace || hasHeaters) && (
                <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl mb-4 border ${
                    heatingActive ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'
                }`}>
                    <Flame size={16} className={heatingActive ? 'text-orange-500' : 'text-gray-400'} />
                    <div>
                        <p className={`text-xs font-bold ${heatingActive ? 'text-orange-700' : 'text-gray-600'}`}>
                            {hasFireplace ? 'Fireplace' : 'Heaters'} · {heatingActive ? 'Active now' : 'Available evenings'}
                        </p>
                        <p className="text-[10px] text-gray-400">Great for cold nights</p>
                    </div>
                </div>
            )}

            {/* Tags */}
            {venue.tags && venue.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                    {venue.tags.map((tag, i) => <TagPill key={i} tag={tag} />)}
                </div>
            )}

            {/* Pro tip */}
            {venue.proTip && (
                <div className="mb-4 px-4 py-3 bg-sky-50 border border-sky-100 rounded-2xl">
                    <p className="text-xs font-bold text-sky-700 mb-0.5">Local tip</p>
                    <p className="text-sm text-sky-800">{venue.proTip}</p>
                </div>
            )}

            {/* More details toggle */}
            {(uvIndex != null || venue.notes) && (
                <div className="mb-4">
                    <button
                        onClick={() => setShowMore(s => !s)}
                        className="w-full flex items-center justify-between py-2 text-gray-400 text-xs font-semibold"
                    >
                        <span>{showMore ? 'Less details' : 'More details'}</span>
                        {showMore ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <AnimatePresence>
                        {showMore && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                            >
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <StatBox
                                        icon={<Shield size={13} />}
                                        value={uvIndex != null ? uvIndex : '--'}
                                        label="UV Index"
                                    />
                                    <StatBox
                                        icon={<Droplets size={13} />}
                                        value={isRaining ? 'Yes' : 'No'}
                                        label="Rain"
                                        accent={isRaining}
                                    />
                                    <StatBox
                                        icon={<span className="text-xs">{isRaining ? '🌧️' : '☀️'}</span>}
                                        value={weather?.main?.humidity != null ? `${weather.main.humidity}%` : '--'}
                                        label="Humidity"
                                    />
                                </div>
                                {venue.notes && (
                                    <p className="text-xs text-gray-500 mt-3 leading-relaxed">{venue.notes}</p>
                                )}
                                {venue.typeCategory === 'ShortStay' && venue.nightlyPriceDemo && (
                                    <p className="text-sm font-bold text-amber-600 mt-2">
                                        {venue.nightlyPriceDemo} per night · Up to {venue.guests} guests
                                    </p>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
                <motion.button
                    whileTap={{ scale: 0.96 }}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-amber-500 text-white font-bold text-sm shadow-lg shadow-amber-200"
                >
                    <span>☀️ BOOK FOR SUNSHINE</span>
                </motion.button>
                <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                        if (navigator.share) {
                            navigator.share({ title: venue.venueName, url: window.location.href });
                        } else {
                            navigator.clipboard?.writeText(window.location.href);
                        }
                    }}
                    className="w-12 h-12 flex items-center justify-center rounded-2xl bg-gray-100 text-gray-600"
                >
                    <Share2 size={16} />
                </motion.button>
            </div>

            {/* Camera */}
            <div className="mt-2">
                <CameraButton />
            </div>
        </div>
    );
};

export default VenueDetail;
