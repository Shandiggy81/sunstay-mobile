import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart3, Camera, Star, StarOff,
    Eye, Calendar, Sun, Cloud, CloudRain,
    X, ChevronRight, Award, Zap, TrendingUp,
} from 'lucide-react';
import { getPhotosForVenue, toggleFeaturedPhoto } from './PhotoUpload';
import PhotoGallery from './PhotoGallery';

// ── Helpers ───────────────────────────────────────────────────────

const getRelativeTime = (isoString) => {
    const now = new Date();
    const then = new Date(isoString);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(isoString).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const getWeatherEmoji = (status) => {
    switch (status?.toLowerCase()) {
        case 'sunny': case 'clear': return '☀️';
        case 'cloudy': case 'clouds': return '☁️';
        case 'rainy': case 'rain': case 'drizzle': return '🌧️';
        default: return '🌤️';
    }
};

/**
 * Compute analytics from a photo array.
 */
const computeAnalytics = (photos) => {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const total = photos.length;
    const thisWeek = photos.filter((p) => new Date(p.timestamp) >= weekAgo).length;
    const featured = photos.filter((p) => p.featured).length;

    const weatherCounts = {};
    photos.forEach((p) => {
        const status = p.weather?.sunshineStatus || 'Unknown';
        weatherCounts[status] = (weatherCounts[status] || 0) + 1;
    });
    const sortedWeather = Object.entries(weatherCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    let engagementScore = 0;
    if (total > 0) {
        const volumeScore = Math.min(total * 5, 35);
        const weeklyScore = Math.min(thisWeek * 10, 35);
        const varietyScore = Math.min(Object.keys(weatherCounts).length * 10, 20);
        const featuredBonus = Math.min(featured * 5, 10);
        engagementScore = Math.min(volumeScore + weeklyScore + varietyScore + featuredBonus, 100);
    }

    const dailyActivity = [];
    for (let i = 29; i >= 0; i--) {
        const dayStart = new Date(now);
        dayStart.setDate(dayStart.getDate() - i);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const count = photos.filter((p) => {
            const ts = new Date(p.timestamp);
            return ts >= dayStart && ts <= dayEnd;
        }).length;

        dailyActivity.push({
            date: dayStart,
            count,
            label: dayStart.toLocaleDateString([], { month: 'short', day: 'numeric' }),
            dayOfWeek: dayStart.toLocaleDateString([], { weekday: 'short' }),
        });
    }

    const maxDaily = Math.max(...dailyActivity.map((d) => d.count), 1);

    return {
        total,
        thisWeek,
        featured,
        sortedWeather,
        engagementScore,
        dailyActivity,
        maxDaily,
    };
};

// ── Activity Chart Component ──────────────────────────────────────

const ActivityChart = ({ dailyActivity, maxDaily }) => (
    <div className="flex items-end gap-[2px] h-20 px-2 mt-4 bg-gray-50/50 rounded-xl py-2">
        {dailyActivity.map((day, idx) => (
            <motion.div
                key={idx}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max((day.count / maxDaily) * 100, 5)}%` }}
                className={`flex-1 rounded-t-[1px] ${day.count > 0 ? 'bg-orange-400' : 'bg-gray-200'}`}
                title={`${day.label}: ${day.count} uploads`}
            />
        ))}
    </div>
);

// ── Main Component ────────────────────────────────────────────────

const PhotoDashboard = ({ venueId, venueName, refreshTrigger, onClose }) => {
    const [photos, setPhotos] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [featuredUpdate, setFeaturedUpdate] = useState(0);

    const AnalyticsCard = TrendingUp;

    useEffect(() => {
        if (venueId) {
            setIsLoading(true);
            const timer = setTimeout(() => {
                const data = getPhotosForVenue(venueId);
                setPhotos(data);
                setIsLoading(false);
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [venueId, refreshTrigger, featuredUpdate]);

    const analytics = useMemo(() => computeAnalytics(photos), [photos]);

    const handleToggleFeatured = useCallback((photoId) => {
        toggleFeaturedPhoto(photoId);
        setFeaturedUpdate((prev) => prev + 1);
    }, []);

    const recentSix = useMemo(() => {
        return [...photos]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 6);
    }, [photos]);

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
                <div className="dash-panel w-full max-w-lg h-[80vh] flex flex-col bg-white overflow-hidden">
                    <div className="p-6 border-b animate-pulse bg-gray-50 h-20" />
                    <div className="flex-1 p-6 space-y-4 overflow-hidden">
                        <div className="grid grid-cols-3 gap-3">
                            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
                            <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
                        </div>
                        <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
                    </div>
                </div>
            </div>
        );
    }

    const isDemo = useMemo(() => photos.some(p => p.isDemo), [photos]);

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/50 z-[60]"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed inset-x-3 top-[5%] bottom-[5%] z-[61] mx-auto max-w-lg overflow-hidden"
            >
                <div className="dash-panel h-full flex flex-col bg-white rounded-[32px] shadow-2xl overflow-hidden border border-gray-100">
                    <div className="dash-header p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-20">
                        <div className="flex items-center gap-3">
                            <div className="dash-header-icon w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600">
                                <BarChart3 size={20} />
                            </div>
                            <div>
                                <h2 className="dash-header-title text-lg font-black text-gray-900 leading-tight">Photo Intelligence</h2>
                                <p className="dash-header-subtitle text-xs text-gray-400 font-bold uppercase tracking-wider">{venueName}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {isDemo && (
                                <span className="px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-black rounded-lg border border-amber-100 uppercase tracking-tight">
                                    Sample Data
                                </span>
                            )}
                            <button onClick={onClose} className="dash-close-btn w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="dash-content flex-1 overflow-y-auto p-6 scroll-smooth custom-scrollbar">
                        {photos.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-16 px-8 h-full">
                                <div className="relative mb-8">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                                        className="absolute -inset-6 border-2 border-dashed border-orange-200/50 rounded-full"
                                    />
                                    <div className="w-24 h-24 rounded-full bg-orange-50 flex items-center justify-center text-orange-500 relative z-10 shadow-inner">
                                        <Camera size={40} />
                                    </div>
                                    <motion.div
                                        animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                                        transition={{ duration: 3, repeat: Infinity }}
                                        className="absolute -top-3 -right-3 text-3xl"
                                    >
                                        ☀️
                                    </motion.div>
                                </div>
                                <h3 className="text-2xl font-black text-gray-900 mb-2">Be the first to share this sunny spot!</h3>
                                <p className="text-gray-500 text-sm mb-10 leading-relaxed px-4">
                                    Photos help others find the perfect weather-ready venue. <br />
                                    <span className="font-bold text-orange-500">Morning sun photos get 2x more engagement!</span>
                                </p>
                                <div className="flex flex-col w-full gap-3 max-w-sm mx-auto">
                                    <button className="w-full py-4.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white font-black rounded-2xl shadow-xl shadow-orange-500/30 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all">
                                        <Camera size={18} />
                                        Take Photo
                                    </button>
                                    <button className="w-full py-4.5 bg-gray-50 text-gray-600 font-black rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors">
                                        Upload from Gallery
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <div className="dash-stats-grid grid grid-cols-3 gap-3">
                                    <div className="dash-stat-card bg-blue-50/50 p-4 rounded-3xl border border-blue-100/50 text-center">
                                        <div className="text-2xl font-black text-blue-600 mb-1">{analytics.total}</div>
                                        <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Total Photos</div>
                                    </div>
                                    <div className="dash-stat-card bg-green-50/50 p-4 rounded-3xl border border-green-100/50 text-center">
                                        <div className="text-2xl font-black text-green-600 mb-1">{analytics.thisWeek}</div>
                                        <div className="text-[9px] font-black text-green-400 uppercase tracking-widest">This Week</div>
                                    </div>
                                    <div className="dash-stat-card bg-amber-50/50 p-4 rounded-3xl border border-amber-100/50 text-center">
                                        <div className="text-2xl font-black text-amber-600 mb-1">{analytics.featured}</div>
                                        <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Featured</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="dash-card bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Award size={14} className="text-orange-500" />
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Radar</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <div className="relative w-24 h-24 flex items-center justify-center">
                                                <svg className="w-full h-full transform -rotate-90">
                                                    <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-100" />
                                                    <motion.circle
                                                        cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                                                        strokeDasharray={251.2}
                                                        initial={{ strokeDashoffset: 251.2 }}
                                                        animate={{ strokeDashoffset: 251.2 - (251.2 * analytics.engagementScore) / 100 }}
                                                        transition={{ duration: 1.5 }}
                                                        className="text-orange-500"
                                                    />
                                                </svg>
                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                    <span className="text-xl font-black text-gray-800">{analytics.engagementScore}%</span>
                                                    <span className="text-[8px] text-gray-400 font-black uppercase">Score</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="dash-card bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Sun size={14} className="text-amber-500" />
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Weather</span>
                                        </div>
                                        <div className="space-y-3">
                                            {analytics.sortedWeather.map(([status, count]) => (
                                                <div key={status} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm">{getWeatherEmoji(status)}</span>
                                                        <span className="text-[11px] font-bold text-gray-600">{status}</span>
                                                    </div>
                                                    <span className="text-[10px] font-black text-gray-400">{count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="dash-card bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-blue-500" />
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Activity</span>
                                        </div>
                                        <span className="text-[9px] font-black text-gray-300 uppercase">30D</span>
                                    </div>
                                    <ActivityChart dailyActivity={analytics.dailyActivity} maxDaily={analytics.maxDaily} />
                                </div>

                                <div className="dash-card bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <Eye size={14} className="text-purple-500" />
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Recent</span>
                                        </div>
                                        <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Community</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {recentSix.map(photo => (
                                            <div key={photo.id} className="relative aspect-square rounded-2xl overflow-hidden group">
                                                <img src={photo.url || photo.dataUrl} alt="" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <div className="absolute bottom-2 left-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-[10px] text-white font-black">{photo.author || 'Guest'}</span>
                                                </div>
                                                <button onClick={() => handleToggleFeatured(photo.id)} className={`absolute top-2 right-2 p-2 rounded-full backdrop-blur-md transition-all ${photo.featured ? 'bg-amber-400 text-white' : 'bg-black/20 text-white/80'}`}>
                                                    <Star size={12} fill={photo.featured ? "currentColor" : "none"} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="dash-gallery mt-8">
                                    <div className="flex items-center gap-2 mb-4">
                                        <ImageIcon size={14} className="text-gray-400" />
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Live Community Gallery</span>
                                    </div>
                                    <PhotoGallery venueId={venueId} refreshTrigger={refreshTrigger + featuredUpdate} />
                                </div>
                            </div>
                        )}
                        <div className="h-10" />
                    </div>
                </div>
            </motion.div>
        </>
    );
};

export default PhotoDashboard;
