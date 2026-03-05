import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import sunBadgeImg from '../assets/sun-badge.jpg';
import {
    X,
    Calendar,
    Thermometer,
    Wind,
    Flame,
    Clock,
    Sparkles,
    TrendingUp,
    BarChart3,
    ShieldCheck,
    ChevronDown,
    ChevronRight,
    Loader2,
    Sunset,
    MapPin,
    Map,
    Share2,
    CloudRain,
    Sun,
    Cloud,
    Users,
    Mail,
    User,
    MessageSquare,
    CheckCircle2
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
import UVIntelligencePanel from './UVIntelligencePanel';
import RainIntelligencePanel from './RainIntelligencePanel';
import ComfortScorePanel from './ComfortScorePanel';
import VenueOwnerDashboard from './VenueOwnerDashboard';
import SunSimulator from './SunSimulator';

const VenueCard = ({ venue, onClose, ownerMode = false }) => {
    const {
        calculateSunstayScore,
        getFireplaceMode,
        getTemperature,
        getWeatherDescription,
        getCardBackground,
        getCardAccent,
        updateOverride,
        overrideType,
        theme,
        weather
    } = useWeather();

    const [activeModal, setActiveModal] = useState(null); // 'comfort', 'wind', 'uv', 'rain'

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
                        transition={{ duration: 0.3 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[999999]"
                    />

                    {/* Bottom sheet card */}
                    <motion.div
                        initial={{ y: '100%', scale: 0.95, opacity: 0 }}
                        animate={{ y: 0, scale: 1, opacity: 1 }}
                        exit={{ y: '100%', scale: 0.95, opacity: 0 }}
                        transition={{
                            type: 'spring',
                            damping: 28,
                            stiffness: 260,
                            mass: 0.8
                        }}
                        className="fixed inset-0 z-[999999] flex flex-col pt-[2vh] sm:pt-0"
                    >
                        <div className={`relative flex-1 min-h-0 bg-white rounded-t-[40px] shadow-[-10px_0_30px_rgba(0,0,0,0.15)] border-t ${cardAccent} flex flex-col overflow-hidden mx-auto max-w-2xl w-full`}>

                            {/* Sticky Premium Header */}
                            <div className={`sticky top-0 z-[999999] px-6 py-4 bg-gradient-to-r ${getButtonGradient()} flex items-center justify-between shadow-md`}>
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
                                {/* Share and Action row */}
                                <div className="flex items-center gap-3 mb-6">
                                    <button
                                        onClick={handleBooking}
                                        className="flex-1 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl shadow-lg font-black text-[13px] uppercase tracking-wider hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Calendar size={18} />
                                        Book Now
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (navigator.share) {
                                                navigator.share({
                                                    title: `Check out ${venue.venueName} on Sunstay`,
                                                    text: `Check out the Sunstay score for ${venue.venueName}!`,
                                                    url: window.location.href,
                                                });
                                            } else {
                                                navigator.clipboard.writeText(window.location.href);
                                                alert('Link copied to clipboard!');
                                            }
                                        }}
                                        className="w-14 h-14 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center text-gray-500 hover:text-amber-500 transition-colors active:scale-90"
                                        aria-label="Share Venue"
                                    >
                                        <Share2 size={20} />
                                    </button>
                                </div>

                                {/* ===== WEATHER FORECAST STRIP ===== */}
                                <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-4 mb-6 border border-amber-100 flex justify-between items-center overflow-x-auto gap-4 custom-scrollbar">
                                    <div className="flex-shrink-0">
                                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Forecast</p>
                                        <p className="text-[11px] font-bold text-gray-700">Next 6 Hours</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {[1, 2, 3, 4, 5, 6].map(offset => (
                                            <div key={offset} className="flex flex-col items-center gap-1 min-w-[40px]">
                                                <span className="text-[9px] font-bold text-gray-400 capitalize">
                                                    {new Date(Date.now() + offset * 3600000).getHours()}:00
                                                </span>
                                                <Sun size={14} className="text-amber-400" />
                                                <span className="text-[10px] font-black text-gray-700">{temperature + Math.round(Math.random() * 2)}°</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Venue Address */}
                                <div className="flex items-center justify-center gap-2 text-gray-400 mb-4">
                                    <MapPin size={14} className="text-orange-300" />
                                    <span className="text-[12px] font-medium tracking-wide">{venue.address || 'Address not confirmed'}</span>
                                </div>

                                {/* ===== ANALYTICS / OWNER VIEW VS CUSTOMER VIEW ===== */}
                                {ownerMode ? (
                                    <div className="space-y-6 mb-6">
                                        <div className="bg-emerald-950/90 rounded-[32px] p-6 border border-emerald-500/30 shadow-2xl relative overflow-hidden group">
                                            {/* Decorative Background Elements */}
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
                                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-emerald-400/5 rounded-full blur-2xl -ml-12 -mb-12" />

                                            <div className="flex items-center justify-between mb-5 relative z-10">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                                                        <TrendingUp size={16} className="text-emerald-400" />
                                                    </div>
                                                    <h3 className="text-xs font-black text-emerald-100 uppercase tracking-widest">
                                                        Revenue Intelligence
                                                    </h3>
                                                </div>
                                                <div className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40">
                                                    <span className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">Live Audit</span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 relative z-10">
                                                <motion.div
                                                    whileHover={{ scale: 1.02 }}
                                                    className="bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/5 shadow-inner"
                                                >
                                                    <p className="text-[9px] font-black text-emerald-500/60 uppercase tracking-tighter mb-1">Impressions</p>
                                                    <p className="text-2xl font-black text-white">47</p>
                                                    <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold mt-1">
                                                        <TrendingUp size={10} /> +12% vs avg
                                                    </div>
                                                </motion.div>

                                                <motion.div
                                                    whileHover={{ scale: 1.02 }}
                                                    className="bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/5 shadow-inner"
                                                >
                                                    <p className="text-[9px] font-black text-emerald-500/60 uppercase tracking-tighter mb-1">Peak Conv.</p>
                                                    <p className="text-2xl font-black text-white">11am-2pm</p>
                                                    <p className="text-[8px] text-emerald-400 font-bold uppercase tracking-tight">Weather Synced</p>
                                                </motion.div>

                                                <motion.div
                                                    whileHover={{ scale: 1.02 }}
                                                    className="col-span-2 bg-gradient-to-br from-emerald-500/10 to-transparent p-4 rounded-2xl border border-emerald-500/20 shadow-inner flex items-center justify-between"
                                                >
                                                    <div>
                                                        <p className="text-[9px] font-black text-emerald-500/60 uppercase tracking-tighter mb-1">Direct ROI</p>
                                                        <p className="text-2xl font-black text-white">$1,450</p>
                                                        <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-tight mt-1">Weather-Driven Revenue</p>
                                                    </div>
                                                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20">
                                                        <BarChart3 className="text-emerald-400 w-6 h-6" />
                                                    </div>
                                                </motion.div>
                                            </div>

                                            <p className="mt-4 text-[9px] text-emerald-500/40 text-center font-bold uppercase tracking-widest">
                                                Generated based on {venue.venueName} weather profile
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6 mb-6">
                                        {/* WEATHER INTELLIGENCE SECTION */}
                                        <div className="bg-gray-50 rounded-[32px] p-6 border border-gray-100 shadow-inner">
                                            <div className="flex items-center gap-2 mb-5">
                                                <TrendingUp size={16} className="text-orange-500" />
                                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                                    Weather Intelligence
                                                </h3>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="mb-3 flex items-center gap-2 col-span-2">
                                                    <span className="relative flex items-center justify-center" aria-hidden="true">
                                                        <span className="absolute inline-flex h-3 w-3 rounded-full bg-emerald-500/40 animate-ping" />
                                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                                    </span>
                                                    <span className="text-[10px] tracking-[0.2em] font-semibold uppercase text-gray-400">
                                                        Live Analysis Active
                                                    </span>
                                                </div>

                                                {/* Hero Comfort Score */}
                                                <motion.div
                                                    whileTap={{ scale: 0.985 }}
                                                    onClick={() => setActiveModal('comfort')}
                                                    className="col-span-2 glass-dark rounded-[2rem] p-5 flex flex-col justify-between min-h-[140px] shadow-xl relative overflow-hidden group border border-white/10 cursor-pointer"
                                                >
                                                    <div className="flex justify-between items-start relative z-10">
                                                        <div>
                                                            <h4 className="text-[10px] tracking-widest uppercase text-gray-400 font-black">Overall Comfort Score</h4>
                                                            <p className="text-xs tracking-widest uppercase mt-1 font-black text-emerald-400">Optimal Conditions</p>
                                                        </div>
                                                        <div className="relative w-16 h-16 flex items-center justify-center">
                                                            <div className="absolute inset-0 flex items-center justify-center border-4 border-emerald-500/20 rounded-full">
                                                                <span className="text-xl font-black text-white">{sunstayScore}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="relative z-10 mt-4">
                                                        <p className="text-[10px] text-gray-400 font-medium leading-relaxed max-w-[80%] uppercase tracking-tight">Tap for breakdown analysis.</p>
                                                    </div>
                                                </motion.div>

                                                {/* Wind (Left) */}
                                                <motion.div
                                                    whileTap={{ scale: 0.985 }}
                                                    onClick={() => setActiveModal('wind')}
                                                    className="glass rounded-[2rem] p-5 flex flex-col justify-between min-h-[120px] shadow-sm relative overflow-hidden cursor-pointer"
                                                >
                                                    <p className="text-[10px] tracking-widest uppercase text-gray-500 font-black">Wind</p>
                                                    <p className="text-3xl font-light text-gray-900 mt-1">{weather?.wind?.speed || 4}<span className="text-xs text-gray-400 font-bold ml-1 uppercase">km/h</span></p>
                                                    <div className="h-1 bg-sky-200 rounded-full overflow-hidden mt-3">
                                                        <div className="h-full bg-sky-500 w-[30%]" />
                                                    </div>
                                                </motion.div>

                                                {/* UV Index (Right) */}
                                                <motion.div
                                                    whileTap={{ scale: 0.985 }}
                                                    onClick={() => setActiveModal('uv')}
                                                    className="glass rounded-[2rem] p-5 flex flex-col justify-between min-h-[120px] shadow-sm relative overflow-hidden cursor-pointer"
                                                >
                                                    <p className="text-[10px] tracking-widest uppercase text-gray-500 font-black">UV Index</p>
                                                    <p className="text-3xl font-light text-gray-900 mt-1">{weather?.uvi || 2}<span className="text-xs text-gray-400 font-bold ml-1 uppercase">/ 11</span></p>
                                                    <div className="h-1 bg-amber-200 rounded-full overflow-hidden mt-3">
                                                        <div className="h-full bg-amber-500 w-[20%]" />
                                                    </div>
                                                </motion.div>

                                                {/* Rain Probability (Bottom col-span-2) */}
                                                <motion.div
                                                    whileTap={{ scale: 0.985 }}
                                                    onClick={() => setActiveModal('rain')}
                                                    className="col-span-2 glass rounded-[2rem] p-5 flex items-center justify-between min-h-[100px] shadow-sm relative overflow-hidden cursor-pointer border border-blue-50"
                                                >
                                                    <div>
                                                        <p className="text-[10px] tracking-widest uppercase text-gray-500 font-black">Rain Pulse</p>
                                                        <p className="text-xl font-black text-gray-800 mt-1">
                                                            {weather?.weather?.[0]?.main?.toLowerCase().includes('rain') ? 'Active Now' : 'No Rain Expected'}
                                                        </p>
                                                    </div>
                                                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                                                        <CloudRain size={24} />
                                                    </div>
                                                </motion.div>
                                            </div>
                                        </div>

                                        {/* SUN SIMULATOR SECTION */}
                                        <div className="mb-6">
                                            <SunSimulator venue={venue} photoUrl={sunBadgeImg} />
                                        </div>
                                    </div>
                                )}

                                {/* Weather Description */}
                                <div className={`p-3 rounded-xl mb-6 ${theme === 'sunny' ? 'bg-amber-100/70' :
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
                                            <img src={`${import.meta.env.BASE_URL}assets/sun-badge.jpg`} alt="Score" className="w-5 h-5 rounded-full" />
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
                                <div className="flex flex-wrap gap-1.5 mb-6 justify-center">
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

                                {/* Action Buttons */}
                                <div className="flex justify-center gap-2 mb-6">
                                    <button
                                        onClick={() => setShowDashboard(true)}
                                        className="dash-trigger-btn"
                                    >
                                        <BarChart3 size={14} />
                                        <span>Photo Analytics</span>
                                    </button>
                                    <button
                                        onClick={() => setShowOwnerDash(true)}
                                        className="dash-trigger-btn od-trigger-btn"
                                    >
                                        <ShieldCheck size={14} />
                                        <span>Venue Dashboard</span>
                                    </button>
                                </div>

                                {/* Final breathing room padding at the very bottom */}
                                <div className="h-16" />
                            </div>
                        </div>
                    </motion.div>

                    {/* Intelligence Detail Modal Overlay */}
                    <AnimatePresence>
                        {activeModal && (
                            <>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setActiveModal(null)}
                                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000000]"
                                />
                                <motion.div
                                    initial={{ y: '100%' }}
                                    animate={{ y: 0 }}
                                    exit={{ y: '100%' }}
                                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                    className="fixed bottom-0 left-0 right-0 z-[1000001] bg-white rounded-t-[32px] p-6 max-h-[85vh] overflow-y-auto mx-auto max-w-2xl"
                                >
                                    <div className="flex justify-end mb-2">
                                        <button
                                            onClick={() => setActiveModal(null)}
                                            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>

                                    {activeModal === 'comfort' && (
                                        <ComfortScorePanel venue={venue} sunstayScore={sunstayScore} weather={weather} />
                                    )}
                                    {activeModal === 'wind' && (
                                        <WindComfortPanel venue={venue} />
                                    )}
                                    {activeModal === 'uv' && (
                                        <UVIntelligencePanel venue={venue} uvi={weather?.uvi || 0} />
                                    )}
                                    {activeModal === 'rain' && (
                                        <RainIntelligencePanel venue={venue} weather={weather} />
                                    )}
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>

                    {/* Photo Dashboard Modal */}
                    {showDashboard && (
                        <PhotoDashboard
                            venueId={venue.id}
                            onClose={() => setShowDashboard(false)}
                        />
                    )}

                    {/* Owner Dashboard Modal */}
                    {showOwnerDash && (
                        <VenueOwnerDashboard
                            venueId={venue.id}
                            onClose={() => setShowOwnerDash(false)}
                        />
                    )}
                </>
            )}
        </AnimatePresence>
    );
};

export default VenueCard;
