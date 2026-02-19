import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MapPin, Thermometer, CloudRain, Sun, Cloud, Wind, Sunset,
    Flame, BarChart3, ShieldCheck, TrendingUp, X, Clock, Loader2,
    Calendar, Users, Mail, User, MessageSquare, CheckCircle2,
    ChevronDown, Sparkles, ChevronRight
} from 'lucide-react';
import { useRef, useEffect } from 'react';
import { useWeather } from '../context/WeatherContext';
import { getCompanyForVenue } from '../data/demoVenues';
import { getVenueCategoryConfig } from '../data/venueCategories';
import { getWindProfile, calculateApparentTemp, getComfortZone } from '../data/windIntelligence';
import { getSunProtectionAdvice, getBestSunSafeTimes, getUVConfig } from '../data/uvIntelligence';
import { getRainTiming, getRainSuggestion, getRainWindowFinder } from '../data/rainIntelligence';
import { getSunScoreLabel } from '../util/sunScore';
import { calculateDynamicToday } from '../util/sunCalcLogic';
import PhotoUpload from './PhotoUpload';
import PhotoGallery from './PhotoGallery';
import PhotoDashboard from './PhotoDashboard';
import WindComfortPanel from './WindComfortPanel';
import VenueOwnerDashboard from './VenueOwnerDashboard';
import HourlyTimeline from './HourlyTimeline';

const VenueCard = ({ venue, onClose }) => {
    const {
        calculateSunstayScore,
        getFireplaceMode,
        getTemperature,
        getWeatherDescription,
        getCardBackground,
        getCardAccent,
        theme,
        weather
    } = useWeather();

    const [galleryRefresh, setGalleryRefresh] = useState(0);
    const [showDashboard, setShowDashboard] = useState(false);
    const [showOwnerDash, setShowOwnerDash] = useState(false);
    const [isBookingLoading, setIsBookingLoading] = useState(false);
    const [bookingSuccess, setBookingSuccess] = useState(false);
    const [bookingData, setBookingData] = useState({
        date: new Date().toISOString().split('T')[0],
        time: '19:00',
        guests: 2,
        occasion: 'Casual drinks',
        name: '',
        email: ''
    });

    const bookingRef = useRef(null);
    const scrollContainerRef = useRef(null);

    const handleBooking = useCallback(() => {
        if (bookingRef.current && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
                top: bookingRef.current.offsetTop - 100,
                behavior: 'smooth'
            });
        }
    }, []);

    const handleSendRequest = () => {
        setIsBookingLoading(true);
        setTimeout(() => {
            setIsBookingLoading(false);
            setBookingSuccess(true);
        }, 1200);
    };

    const handlePhotoUploaded = useCallback(() => {
        setGalleryRefresh(prev => prev + 1);
    }, []);

    if (!venue) return null;

    const sunstayScore = calculateSunstayScore(venue);
    const isFireplaceMode = getFireplaceMode();
    const temperature = getTemperature();
    const weatherDescription = getWeatherDescription(venue);
    const cardBackground = getCardBackground();
    const cardAccent = getCardAccent();
    const hasFireplace = venue.tags?.includes('Fireplace');
    const company = getCompanyForVenue(venue);

    // Detect venue category for contextual photo upload prompts
    const categoryConfig = useMemo(
        () => getVenueCategoryConfig(venue, company),
        [venue, company]
    );

    // Score color gradient
    const getScoreColor = (score) => {
        if (score >= 80) return 'from-green-400 to-emerald-500';
        if (score >= 60) return 'from-yellow-400 to-amber-500';
        return 'from-orange-400 to-red-500';
    };

    // Weather icon based on theme
    const WeatherIcon = () => {
        switch (theme) {
            case 'rainy':
                return <CloudRain className="w-5 h-5 text-blue-500" />;
            case 'cloudy':
                return <Cloud className="w-5 h-5 text-gray-500" />;
            default:
                return <Sun className="w-5 h-5 text-amber-500" />;
        }
    };

    // Calculate wind factor from API
    const getWindFactor = () => {
        const windSpeed = weather?.wind?.speed;
        if (windSpeed === undefined || windSpeed === null) return { label: 'Unknown', color: 'text-gray-500' };

        if (windSpeed < 3) return { label: 'Calm', color: 'text-blue-400', icon: '🍃' };
        if (windSpeed < 6) return { label: 'Low Wind', color: 'text-blue-500', icon: '🌿' };
        if (windSpeed < 10) return { label: 'Breezy', color: 'text-blue-600', icon: '💨' };
        return { label: 'Windy', color: 'text-blue-700', icon: '🌬️' };
    };

    // Calculate sunshine hours remaining
    const getSunshineHours = () => {
        if (!weather?.sys?.sunset) return null;
        const now = new Date();
        const sunset = new Date(weather.sys.sunset * 1000);
        const diffMs = sunset - now;

        if (diffMs <= 0) return { hours: 0, label: 'Sun has set', icon: '🌙' };

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours === 0) {
            return { hours: 0, minutes, label: `${minutes}min of sun left`, icon: '🌅' };
        }
        return { hours, minutes, label: `~${hours}h ${minutes}m of sun remaining`, icon: '☀️' };
    };

    // Fireplace status logic
    const getFireplaceStatus = () => {
        if (!hasFireplace) return null;
        const temp = temperature || 20;
        const hour = new Date().getHours();

        if (temp < 15) {
            return { status: 'ON Now', color: 'text-red-600', bgColor: 'bg-red-50', active: true };
        } else if (temp < 20 && hour >= 17) {
            return { status: 'ON from 5PM', color: 'text-red-500', bgColor: 'bg-red-50/50', active: true };
        } else if (hour >= 18) {
            return { status: 'ON from 6PM', color: 'text-red-400', bgColor: 'bg-red-50/30', active: false };
        }
        return { status: 'Available evenings', color: 'text-gray-500', bgColor: 'bg-gray-50', active: false };
    };

    const windFactor = getWindFactor();
    const sunshineHours = getSunshineHours();
    const fireplaceStatus = getFireplaceStatus();

    // Map orientation to Emoji
    const getOrientationEmoji = (orientation) => {
        const map = {
            "N": "☀️", "NE": "☀️", "E": "🌅", "SE": "🌅",
            "S": "🌿", "SW": "🌇", "W": "🌇", "NW": "🌇"
        };
        return map[orientation] || "☀️";
    };

    // New: Cozy Mode state for manual override or rainy detection
    const [cozyMode, setCozyMode] = useState(isFireplaceMode || false);

    // Room Card Component
    const RoomCard = ({ room }) => {
        const dynamicToday = calculateDynamicToday(
            venue.lat, venue.lng, room.orientation,
            weather?.clouds?.all / 100 || 0,
            room.obstructionLevel
        );
        const scoreInfo = getSunScoreLabel(room.sunScore);
        const isInterior = !room.hasBalcony && !room.hasOutdoorArea;

        return (
            <div className={`p-4 rounded-[24px] border border-gray-100 bg-white shadow-sm flex flex-col gap-3 ${isInterior ? 'opacity-60 grayscale' : ''}`}>
                <div className="flex items-start justify-between">
                    <div>
                        <h4 className="text-[14px] font-black text-gray-800 leading-tight">{room.name}</h4>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-lg">{getOrientationEmoji(room.orientation)}</span>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">
                                {room.orientation}-facing {room.hasBalcony ? '· Balcony' : room.hasOutdoorArea ? '· Outdoor Area' : ''}
                            </span>
                        </div>
                    </div>
                    <div className={`px-2 py-1 rounded-lg ${scoreInfo.color} font-black text-[9px] uppercase tracking-wider shadow-sm`}>
                        {scoreInfo.label} ({room.sunScore})
                    </div>
                </div>

                {isInterior ? (
                    <div className="py-2 px-3 bg-gray-50 rounded-xl text-[10px] font-medium text-gray-400 italic">
                        Interior room – no private outdoor sun data
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-gray-50 p-2 rounded-xl">
                                <p className="text-[9px] font-bold text-gray-400 uppercase">Proprietary Hours</p>
                                <p className="text-[11px] font-black text-gray-700">
                                    {room.sunProfile.summerHours}h Summer
                                </p>
                                <p className="text-[11px] font-black text-gray-500">
                                    {room.sunProfile.winterHours}h Winter
                                </p>
                            </div>
                            <div className="bg-orange-50/50 p-2 rounded-xl border border-orange-100/50">
                                <p className="text-[9px] font-bold text-orange-400 uppercase">Live Today</p>
                                <p className="text-[11px] font-black text-orange-700">
                                    {dynamicToday.predictedHours}h Predicted
                                </p>
                                <p className="text-[11px] font-bold text-orange-500">
                                    Peak {dynamicToday.optimalWindow}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-[11px]">
                                <span className="font-bold text-gray-500">Best for:</span>
                                <span className="font-black text-indigo-600">{room.sunProfile.useCase}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px]">
                                <span className="font-bold text-gray-500">Popular with:</span>
                                <span className="text-gray-600">Couples & Photographers</span>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    };

    // Get button gradient based on weather
    const getButtonGradient = () => {
        switch (theme) {
            case 'rainy':
                return 'from-blue-500 via-indigo-500 to-purple-500';
            case 'cloudy':
                return 'from-slate-500 via-gray-500 to-slate-600';
            default:
                return 'from-yellow-400 via-orange-500 to-pink-500';
        }
    };

    return (
        <AnimatePresence>
            {venue && (
                <>
                    {/* Backdrop overlay — no blur, just dim */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/25 z-40"
                    />

                    {/* Bottom sheet card */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 32, stiffness: 300 }}
                        className="fixed inset-0 z-50 flex flex-col pt-[2vh] sm:pt-0"
                    >
                        <div className={`relative flex-1 min-h-0 bg-white rounded-t-[40px] shadow-[-10px_0_30px_rgba(0,0,0,0.15)] border-t ${cardAccent} flex flex-col overflow-hidden mx-auto max-w-2xl w-full`}>

                            {/* Sticky Premium Header */}
                            <div className={`sticky top-0 z-[60] px-6 py-4 bg-gradient-to-r ${getButtonGradient()} flex items-center justify-between shadow-md`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl shadow-inner border border-white/10">
                                        {venue.emoji}
                                    </div>
                                    <div className="flex flex-col">
                                        <h3 className="text-white font-black text-lg leading-tight truncate max-w-[200px] sm:max-w-xs">{venue.venueName || venue.name}</h3>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-white/90 uppercase tracking-widest">
                                                {venue.typeCategory === 'Hotel' || venue.typeCategory === 'ShortStay'
                                                    ? `${venue.typeLabel} · ${venue.suburb}`
                                                    : `${venue.vibe} · ${venue.suburb}`}
                                            </span>
                                            {cozyMode && (
                                                <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm px-1.5 py-0.5 rounded-md border border-white/10">
                                                    <Flame size={10} className="text-orange-300" />
                                                    <span className="text-[8px] font-black text-white uppercase tracking-tighter">Cozy</span>
                                                </div>
                                            )}
                                            <div className="w-1 h-1 rounded-full bg-white/40" />
                                            <div className="flex items-center gap-1">
                                                <span className="relative flex h-1.5 w-1.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-200 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400"></span>
                                                </span>
                                                <span className="text-[9px] font-bold text-white/70 uppercase tracking-wider">Live</span>
                                            </div>
                                        </div>
                                        {venue.typeCategory === 'ShortStay' && venue.nightlyPriceDemo && (
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] font-black text-emerald-300 uppercase tracking-wider">{venue.nightlyPriceDemo}</span>
                                                <span className="text-[9px] text-white/40">•</span>
                                                <span className="text-[10px] font-bold text-white/60 uppercase racking-tight">Max {venue.guests} Guests</span>
                                            </div>
                                        )}
                                        <span className="text-[9px] font-medium text-white/60 truncate max-w-[220px] sm:max-w-xs mt-0.5">
                                            {venue.address || 'Address not confirmed'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={onClose}
                                        className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all active:scale-90 group"
                                        aria-label="Close"
                                    >
                                        <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                                    </button>
                                </div>

                                {/* Drag Indicator — swipe down to close (mobile) */}
                                <div
                                    className="absolute -top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gray-200/50 rounded-full sm:hidden cursor-grab active:cursor-grabbing"
                                    onTouchStart={(e) => {
                                        const startY = e.touches[0].clientY;
                                        const handleMove = (mv) => {
                                            if (mv.touches[0].clientY - startY > 150) {
                                                onClose();
                                                document.removeEventListener('touchmove', handleMove);
                                            }
                                        };
                                        const handleEnd = () => document.removeEventListener('touchmove', handleMove);
                                        document.addEventListener('touchmove', handleMove);
                                        document.addEventListener('touchend', handleEnd, { once: true });
                                    }}
                                />
                            </div>

                            <div
                                className="flex-1 overflow-y-auto overscroll-contain p-6 pb-20 custom-scrollbar"
                                style={{ touchAction: 'pan-y' }}
                                ref={scrollContainerRef}
                            >
                                {/* Action Buttons (Book Now) */}
                                <div className="mb-6">
                                    <button
                                        onClick={handleBooking}
                                        className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl shadow-lg font-black text-[13px] uppercase tracking-wider hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Calendar size={18} />
                                        Book Now
                                    </button>
                                </div>

                                {/* Venue Address */}
                                <div className="flex items-center justify-center gap-2 text-gray-400 mb-4">
                                    <MapPin size={14} className="text-orange-300" />
                                    <span className="text-[12px] font-medium tracking-wide">{venue.address || 'Address not confirmed'}</span>
                                </div>

                                {/* ===== WEATHER INTELLIGENCE SECTION ===== */}
                                <div className="bg-gray-50 rounded-[32px] p-6 mb-6 border border-gray-100 shadow-inner">
                                    <div className="flex items-center gap-2 mb-5">
                                        <TrendingUp size={16} className="text-orange-500" />
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                            Weather Intelligence
                                        </h3>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Temperature with Feels Like */}
                                        {temperature !== null && (() => {
                                            const wp = getWindProfile(venue);
                                            const feelsLike = calculateApparentTemp(
                                                weather?.main?.temp, weather?.wind?.speed,
                                                weather?.main?.humidity, wp.shelterFactor
                                            );
                                            const feelsLikeRound = feelsLike != null ? Math.round(feelsLike) : null;
                                            const diff = feelsLikeRound != null ? temperature - feelsLikeRound : 0;
                                            const comfort = getComfortZone(feelsLikeRound);
                                            return (
                                                <div className={`flex items-center gap-2 p-2 rounded-xl col-span-2 ${comfort.bgColor} border ${comfort.borderColor}`}>
                                                    <Thermometer className={`w-5 h-5 ${comfort.color}`} />
                                                    <div className="flex-1">
                                                        <div className="flex items-baseline gap-2">
                                                            <p className="text-lg font-bold text-gray-800">{temperature}°C</p>
                                                            {feelsLikeRound != null && feelsLikeRound !== temperature && (
                                                                <p className={`text-sm font-semibold ${comfort.color}`}>
                                                                    (Feels like {feelsLikeRound}°C{Math.abs(diff) >= 2
                                                                        ? diff > 0 ? ' with wind' : ' calm'
                                                                        : ''})
                                                                </p>
                                                            )}
                                                        </div>
                                                        <p className={`text-xs font-medium ${comfort.color}`}>
                                                            {comfort.icon} {comfort.label}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Wind Factor */}
                                        <div className="flex items-center gap-2 p-2 bg-white/70 rounded-xl">
                                            <Wind className={`w-5 h-5 ${windFactor.color}`} />
                                            <div>
                                                <p className={`text-sm font-bold ${windFactor.color}`}>
                                                    {windFactor.icon} {windFactor.label}
                                                </p>
                                                <p className="text-xs text-gray-500">Wind Factor</p>
                                            </div>
                                        </div>

                                        {/* Sunshine Hours */}
                                        {sunshineHours && (
                                            <div className="flex items-center gap-2 p-2 bg-white/70 rounded-xl">
                                                <Sunset className="w-5 h-5 text-orange-400" />
                                                <div>
                                                    <p className="text-sm font-bold text-gray-800">
                                                        {sunshineHours.icon} {sunshineHours.label}
                                                    </p>
                                                    <p className="text-xs text-gray-500">Sunshine</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Fireplace Status */}
                                        {fireplaceStatus && (
                                            <div className={`flex items-center gap-2 p-2 ${fireplaceStatus.bgColor} rounded-xl col-span-2 border ${fireplaceStatus.active ? 'border-orange-300' : 'border-transparent'}`}>
                                                <Flame className={`w-5 h-5 ${fireplaceStatus.color}`} />
                                                <div>
                                                    <p className={`text-sm font-bold ${fireplaceStatus.color}`}>
                                                        🔥 Fireplace: {fireplaceStatus.status}
                                                    </p>
                                                    <p className="text-xs text-gray-500">Cozy Mode</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* UV INDEX & SUN PROTECTION */}
                                        {(() => {
                                            const uvi = weather?.uvi ?? 0;
                                            const uvAdvice = getSunProtectionAdvice(venue, uvi);
                                            const uvConfig = getUVConfig(uvi);
                                            const bestTimes = getBestSunSafeTimes(venue, uvi);
                                            return (
                                                <div className={`flex flex-col gap-2 p-3 rounded-xl col-span-2 ${uvConfig.bgColor} border border-orange-100`}>
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-2xl">{uvAdvice.icon}</span>
                                                            <div>
                                                                <p className={`text-sm font-bold ${uvAdvice.color}`}>{uvAdvice.label}</p>
                                                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Sun Protection</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[10px] font-bold text-gray-500 uppercase">Best Sun-Safe Time</p>
                                                            <p className={`text-xs font-bold ${uvAdvice.color}`}>{bestTimes}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden flex gap-0.5">
                                                            <div className={`h-full ${uvi >= 1 ? 'bg-green-500' : 'bg-gray-200'}`} style={{ width: '20%' }} />
                                                            <div className={`h-full ${uvi >= 3 ? 'bg-yellow-500' : 'bg-gray-200'}`} style={{ width: '30%' }} />
                                                            <div className={`h-full ${uvi >= 6 ? 'bg-orange-500' : 'bg-gray-200'}`} style={{ width: '20%' }} />
                                                            <div className={`h-full ${uvi >= 8 ? 'bg-red-500' : 'bg-gray-200'}`} style={{ width: '30%' }} />
                                                        </div>
                                                        <p className="text-[10px] font-bold text-gray-500">{uvAdvice.detail}</p>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* HOURLY TIMELINE */}
                                        <div className="col-span-2">
                                            <HourlyTimeline
                                                venue={venue}
                                                hourlyData={weather?.hourly || []}
                                            />
                                        </div>

                                        {/* RAIN RADAR & TIMING */}
                                        {(() => {
                                            const rainTiming = getRainTiming(weather);
                                            const suggestion = getRainSuggestion(venue, weather);
                                            const dryWindow = getRainWindowFinder(weather);

                                            if (rainTiming.minutes === -1 && !rainTiming.active) return null;

                                            return (
                                                <div className={`flex flex-col gap-2 p-3 rounded-xl col-span-2 ${rainTiming.active ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'} border`}>
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-2xl animate-pulse">
                                                                {rainTiming.active ? '🌧️' : '⛈️'}
                                                            </span>
                                                            <div>
                                                                <p className={`text-sm font-bold ${rainTiming.active ? 'text-blue-600' : 'text-slate-700'}`}>
                                                                    {rainTiming.label}
                                                                </p>
                                                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Rain Radar</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[10px] font-bold text-gray-500 uppercase">Rain Window Finder</p>
                                                            <p className="text-xs font-bold text-blue-600">{dryWindow}</p>
                                                        </div>
                                                    </div>
                                                    {suggestion && (
                                                        <div className="mt-1 p-2 bg-white/60 rounded-lg text-[11px] font-bold text-gray-700 flex items-center gap-2 border border-white/50">
                                                            <span>💡</span> {suggestion}
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                            <motion.div
                                                                className="h-full bg-blue-500"
                                                                initial={{ width: '0%' }}
                                                                animate={{ width: rainTiming.active ? '100%' : `${100 - (rainTiming.minutes / 60 * 100)}%` }}
                                                                transition={{ duration: 1.5, ease: 'easeOut' }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] font-bold text-gray-400">Storm approach active</span>
                                                    </div>
                                                </div>
                                            );
                                        })()
                                        }
                                    </div>

                                    {/* Weather Description */}
                                    <div className={`mt-3 p-3 rounded-xl ${theme === 'sunny' ? 'bg-amber-100/70' :
                                        theme === 'rainy' ? 'bg-blue-100/70' :
                                            'bg-gray-100/70'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            <WeatherIcon />
                                            <p className="text-sm text-gray-700 font-medium">
                                                {weatherDescription}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* ===== ROOMS & SUNLIGHT SECTION ===== */}
                                {venue.roomTypes && venue.roomTypes.length > 0 && (
                                    <div className="mb-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Sparkles size={16} className="text-amber-500" />
                                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                                Rooms & Sunlight Intelligence
                                            </h3>
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            {venue.roomTypes.map(room => (
                                                <RoomCard key={room.id} room={room} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ===== WIND & COMFORT INTELLIGENCE ===== */}
                                <div className="mb-4">
                                    <WindComfortPanel venue={venue} />
                                </div>

                                {/* Sunstay Score */}
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                            <img src="/assets/sun-badge.jpg" alt="Score" className="w-5 h-5 rounded-full" />
                                            Sunstay Score
                                            {weather && (
                                                <span className="text-xs text-gray-400 font-normal">(Live)</span>
                                            )}
                                        </span>
                                        <span className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                                            {sunstayScore}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${sunstayScore}%` }}
                                            transition={{ duration: 1, ease: 'easeOut' }}
                                            className={`h-full bg-gradient-to-r ${getScoreColor(sunstayScore)} rounded-full`}
                                        />
                                    </div>
                                </div>

                                {/* Tags */}
                                <div className="flex flex-wrap gap-1.5 mb-4 justify-center">
                                    {venue.tags.map((tag, index) => (
                                        <motion.span
                                            key={index}
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: index * 0.05 }}
                                            className="px-3 py-1 bg-white/80 backdrop-blur-sm rounded-full text-xs font-semibold text-gray-700 border border-gray-200"
                                        >
                                            {tag}
                                        </motion.span>
                                    ))}
                                </div>

                                {/* COMMUNITY INTELLIGENCE / ANALYTICS SECTION */}
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <BarChart3 size={14} className="text-orange-500" />
                                            Photo Intelligence
                                        </h3>
                                        {galleryRefresh > 0 && (
                                            <span className="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full animate-pulse">
                                                LIVE UPDATE
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-white/50 backdrop-blur-sm p-3 rounded-2xl border border-gray-100 flex flex-col items-center justify-center text-center">
                                            <div className="text-xl font-black text-gray-800">{galleryRefresh > 0 ? 'Updating...' : 'Verified'}</div>
                                            <div className="text-[10px] text-gray-400 uppercase font-black">Feed Status</div>
                                        </div>
                                        <div className="bg-white/50 backdrop-blur-sm p-3 rounded-2xl border border-gray-100 flex flex-col items-center justify-center text-center">
                                            <div className="text-xl font-black text-orange-500">
                                                <TrendingUp size={18} className="inline mr-1" />
                                                Active
                                            </div>
                                            <div className="text-[10px] text-gray-400 uppercase font-black">Engagement</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Share Photo Button */}
                                <div className="mb-3">
                                    <PhotoUpload venue={venue} onPhotoUploaded={handlePhotoUploaded} categoryConfig={categoryConfig} />
                                </div>

                                {/* Community Photo Gallery */}
                                <PhotoGallery venueId={venue.id} refreshTrigger={galleryRefresh} categoryConfig={categoryConfig} />

                                {/* Analytics Buttons */}
                                <div className="flex justify-center gap-2 mt-3">
                                    <button
                                        onClick={() => {
                                            console.log(`[VenueCard] Triggering PhotoAnalytics for ${venue.id}`);
                                            setShowDashboard(true);
                                        }}
                                        className="dash-trigger-btn"
                                        id="open-photo-dashboard"
                                    >
                                        <BarChart3 size={14} />
                                        <span>Photo Analytics</span>
                                    </button>
                                    <button
                                        onClick={() => setShowOwnerDash(true)}
                                        className="dash-trigger-btn od-trigger-btn"
                                        id="open-owner-dashboard"
                                    >
                                        <ShieldCheck size={14} />
                                        <span>Venue Dashboard</span>
                                    </button>
                                </div>

                                {/* Photo Dashboard Modal (as PhotoAnalytics mount) */}
                                <AnimatePresence>
                                    {showDashboard && (
                                        <PhotoDashboard
                                            venueId={venue.id}
                                            venueName={venue.venueName}
                                            refreshTrigger={galleryRefresh}
                                            onClose={() => setShowDashboard(false)}
                                        />
                                    )}
                                </AnimatePresence>

                                {/* Venue Owner Dashboard Modal */}
                                <AnimatePresence>
                                    {showOwnerDash && (
                                        <VenueOwnerDashboard
                                            venue={venue}
                                            onClose={() => setShowOwnerDash(false)}
                                        />
                                    )}
                                </AnimatePresence>

                                {/* Inline Booking Section — High Polish Card */}
                                <div className="mt-12 mb-12 border-t border-gray-100 pt-10 pb-12" ref={bookingRef}>
                                    <div className="flex items-center gap-3 mb-6 px-4">
                                        <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-sm">
                                            <Calendar size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest leading-none mb-1">
                                                Request a booking
                                            </h3>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Demo mode · Instant enquiry</p>
                                        </div>
                                    </div>

                                    <div className="bg-white border border-gray-100 rounded-[32px] p-6 sm:p-8 pb-10 pt-10 shadow-xl shadow-orange-900/5 transition-all">
                                        {bookingSuccess ? (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className="bg-emerald-50 border border-emerald-100 rounded-2xl p-8 text-center py-10"
                                            >
                                                <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
                                                    <CheckCircle2 size={32} />
                                                </div>
                                                <h4 className="text-emerald-900 text-xl font-black mb-2">Request Sent!</h4>
                                                <p className="text-emerald-700 font-medium mb-6">Your booking request has been sent for demo purposes. The venue will get back to you soon.</p>
                                                <div className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white rounded-full text-[11px] text-emerald-600 font-black uppercase tracking-wider shadow-sm border border-emerald-100">
                                                    <Sparkles size={12} />
                                                    <span>Sunstay Priority Active</span>
                                                </div>
                                            </motion.div>
                                        ) : (
                                            <div className="flex flex-col gap-6">
                                                {/* Date */}
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Preferred Date</label>
                                                    <input
                                                        type="date"
                                                        value={bookingData.date}
                                                        onChange={e => setBookingData({ ...bookingData, date: e.target.value })}
                                                        className="w-full h-14 px-5 bg-gray-50 border border-gray-100 rounded-2xl text-[15px] font-bold text-gray-800 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none"
                                                    />
                                                </div>

                                                {/* Time */}
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Arrival Time</label>
                                                    <div className="relative">
                                                        <select
                                                            value={bookingData.time}
                                                            onChange={e => setBookingData({ ...bookingData, time: e.target.value })}
                                                            className="w-full h-14 px-5 bg-gray-50 border border-gray-100 rounded-2xl text-[15px] font-bold text-gray-800 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none appearance-none"
                                                        >
                                                            {['12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'].map(t => (
                                                                <option key={t}>{t}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                    </div>
                                                </div>

                                                {/* Guests */}
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Number of Guests</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="50"
                                                        value={bookingData.guests}
                                                        onChange={e => setBookingData({ ...bookingData, guests: parseInt(e.target.value) || 1 })}
                                                        className="w-full h-14 px-5 bg-gray-50 border border-gray-100 rounded-2xl text-[15px] font-bold text-gray-800 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none"
                                                    />
                                                </div>

                                                {/* Occasion */}
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Occasion</label>
                                                    <div className="relative">
                                                        <select
                                                            value={bookingData.occasion}
                                                            onChange={e => setBookingData({ ...bookingData, occasion: e.target.value })}
                                                            className="w-full h-14 px-5 bg-gray-50 border border-gray-100 rounded-2xl text-[15px] font-bold text-gray-800 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none appearance-none"
                                                        >
                                                            {['Casual drinks', 'Birthday', 'Wedding', 'Corporate', 'Other'].map(o => (
                                                                <option key={o}>{o}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                    </div>
                                                </div>

                                                {/* Name */}
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Your Full Name</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. James Smith"
                                                        value={bookingData.name}
                                                        onChange={e => setBookingData({ ...bookingData, name: e.target.value })}
                                                        className="w-full h-14 px-5 bg-gray-50 border border-gray-100 rounded-2xl text-[15px] font-bold text-gray-800 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none placeholder:text-gray-300 placeholder:font-medium"
                                                    />
                                                </div>

                                                {/* Email */}
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                                                    <input
                                                        type="email"
                                                        placeholder="e.g. james@example.com"
                                                        value={bookingData.email}
                                                        onChange={e => setBookingData({ ...bookingData, email: e.target.value })}
                                                        className="w-full h-14 px-5 bg-gray-50 border border-gray-100 rounded-2xl text-[15px] font-bold text-gray-800 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none placeholder:text-gray-300 placeholder:font-medium"
                                                    />
                                                </div>

                                                <button
                                                    onClick={handleSendRequest}
                                                    disabled={isBookingLoading}
                                                    className="w-full max-w-xs mx-auto h-16 mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[13px] uppercase tracking-[0.25em] rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-3 group disabled:opacity-70 disabled:grayscale overflow-hidden relative"
                                                >
                                                    {isBookingLoading ? (
                                                        <Loader2 size={24} className="animate-spin" />
                                                    ) : (
                                                        <>
                                                            <span>Send booking request</span>
                                                            <ChevronRight size={18} className="group-hover:translate-x-1.5 transition-transform" />
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Final breathing room padding at the very bottom */}
                                    <div className="h-16" />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default VenueCard;
