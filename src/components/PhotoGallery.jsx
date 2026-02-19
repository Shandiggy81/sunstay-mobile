import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ImageIcon, X, Clock, MapPin, Camera,
    Sun, Cloud, CloudRain, Wind, Droplets,
    ChevronLeft, ChevronRight, Filter,
    Thermometer, Eye, Heart, Sparkles, Zap
} from 'lucide-react';
import { getPhotosForVenue } from './PhotoUpload';

// ── Filter Definitions ────────────────────────────────────────────
const FILTERS = [
    { id: 'all', label: 'All Weather', icon: null, emoji: '🌤️' },
    { id: 'sunny', label: 'Sunny Only', icon: null, emoji: '☀️' },
    { id: 'recent', label: 'Recent (24hrs)', icon: null, emoji: '🕐' },
];

// ── Helpers ───────────────────────────────────────────────────────

const getRelativeTime = (isoString) => {
    const now = new Date();
    const then = new Date(isoString);
    const diffMs = now - then;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const getFormattedDateTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getWeatherEmoji = (status) => {
    switch (status?.toLowerCase()) {
        case 'sunny': case 'clear': return '☀️';
        case 'cloudy': case 'clouds': return '☁️';
        case 'rainy': case 'rain': case 'drizzle': return '🌧️';
        default: return '🌤️';
    }
};

const WeatherIconComponent = ({ status, size = 20 }) => {
    switch (status?.toLowerCase()) {
        case 'sunny': case 'clear': return <Sun size={size} className="text-amber-400" />;
        case 'cloudy': case 'clouds': return <Cloud size={size} className="text-gray-300" />;
        case 'rainy': case 'rain': case 'drizzle': return <CloudRain size={size} className="text-blue-400" />;
        default: return <Sun size={size} className="text-amber-300" />;
    }
};

const isRecent = (isoString) => {
    const now = new Date();
    const then = new Date(isoString);
    return now - then < 24 * 60 * 60 * 1000;
};

const isSunny = (photo) => {
    const status = photo.weather?.sunshineStatus?.toLowerCase();
    return status === 'sunny' || status === 'clear';
};

// ── Lazy Image Component ──────────────────────────────────────────

const LazyImage = ({ src, alt, className }) => {
    const [loaded, setLoaded] = useState(false);
    const [inView, setInView] = useState(false);
    const imgRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setInView(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '100px' }
        );
        if (imgRef.current) observer.observe(imgRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={imgRef} className={className} style={{ position: 'relative' }}>
            {!loaded && <div className="photo-shimmer absolute inset-0 bg-gray-100 animate-pulse" />}
            {inView && (
                <img
                    src={src}
                    alt={alt}
                    className={`photo-gallery-img w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setLoaded(true)}
                />
            )}
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────

const PhotoGallery = ({ venueId, refreshTrigger, categoryConfig }) => {
    const [allPhotos, setAllPhotos] = useState([]);
    const [activeFilter, setActiveFilter] = useState('all');
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [likedPhotos, setLikedPhotos] = useState(new Set());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (venueId) {
            setIsLoading(true);
            const timer = setTimeout(() => {
                const venuePhotos = getPhotosForVenue(venueId);
                setAllPhotos(venuePhotos);
                setIsLoading(false);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [venueId, refreshTrigger]);

    const isDemo = useMemo(() => allPhotos.some(p => p.isDemo), [allPhotos]);

    const filteredPhotos = useMemo(() => {
        let result = [...allPhotos];
        if (activeFilter === 'sunny') result = result.filter(isSunny);
        else if (activeFilter === 'recent') result = result.filter((p) => isRecent(p.timestamp));
        result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return result;
    }, [allPhotos, activeFilter]);

    const toggleLike = useCallback((id, e) => {
        if (e) e.stopPropagation();
        setLikedPhotos(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const currentIndex = useMemo(() => {
        if (!selectedPhoto) return -1;
        return filteredPhotos.findIndex((p) => (p.id || p.timestamp) === (selectedPhoto.id || selectedPhoto.timestamp));
    }, [selectedPhoto, filteredPhotos]);

    const goToPhoto = useCallback((direction) => {
        const nextIndex = currentIndex + direction;
        if (nextIndex >= 0 && nextIndex < filteredPhotos.length) {
            setSelectedPhoto(filteredPhotos[nextIndex]);
        }
    }, [currentIndex, filteredPhotos]);

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 gap-3 mt-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="aspect-square bg-gray-50 rounded-3xl animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="photo-gallery-section mt-4">
            {/* Header & Badges */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <ImageIcon size={16} className="text-orange-500" />
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">
                        Community Feed
                    </h3>
                </div>
                {isDemo && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded-lg border border-amber-100">
                        <Sparkles size={10} className="text-amber-500" />
                        <span className="text-[9px] font-black text-amber-500 uppercase">Sample photos</span>
                    </div>
                )}
            </div>

            {/* Filter Chips */}
            <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar">
                {FILTERS.map((f) => {
                    const isActive = activeFilter === f.id;
                    return (
                        <button
                            key={f.id}
                            onClick={() => setActiveFilter(f.id)}
                            className={`px-4 py-2.5 rounded-2xl text-[11px] font-black transition-all flex items-center gap-2 whitespace-nowrap shadow-sm border ${isActive
                                ? 'bg-black text-white border-black shadow-lg shadow-black/10 scale-105'
                                : 'bg-white text-gray-500 border-gray-100 hover:border-gray-300'
                                }`}
                        >
                            <span>{f.emoji}</span>
                            {f.label}
                        </button>
                    );
                })}
            </div>

            {/* Photo Grid */}
            {filteredPhotos.length === 0 ? (
                <div className="py-12 bg-gray-50/50 rounded-[32px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-gray-300 mb-4 shadow-inner">
                        <Camera size={24} />
                    </div>
                    <p className="text-sm font-black text-gray-900">No photos match this weather</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-[180px]">Be the first to share one!</p>
                    <button
                        onClick={() => setActiveFilter('all')}
                        className="mt-6 text-[10px] font-black text-orange-500 uppercase tracking-widest hover:text-orange-600 transition-colors"
                    >
                        Reset Filters
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3">
                    {filteredPhotos.map((photo, index) => (
                        <motion.div
                            key={photo.id || index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            onClick={() => setSelectedPhoto(photo)}
                            className="aspect-square relative rounded-[28px] overflow-hidden group cursor-pointer bg-gray-100 border border-gray-100 shadow-sm hover:shadow-xl transition-all"
                        >
                            <LazyImage
                                src={photo.url || photo.dataUrl}
                                alt=""
                                className="w-full h-full"
                            />

                            {/* Metadata Badges */}
                            <div className="absolute top-3 left-3 flex items-center gap-1">
                                <span className="px-1.5 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[9px] text-white font-black flex items-center gap-1 border border-white/10">
                                    {getWeatherEmoji(photo.weather?.sunshineStatus)}
                                    {photo.weather?.temp || photo.weather?.temperature}°C
                                </span>
                            </div>

                            {/* Bottom Row */}
                            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 duration-300">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-white drop-shadow-md">
                                        {photo.author || 'Guest'}
                                    </span>
                                    <span className="text-[8px] font-black text-white/70 drop-shadow-md">
                                        {getRelativeTime(photo.timestamp)}
                                    </span>
                                </div>
                                <button
                                    onClick={(e) => toggleLike(photo.id, e)}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${likedPhotos.has(photo.id)
                                        ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30 grow-0 scale-110'
                                        : 'bg-white/20 text-white hover:bg-white/40'
                                        }`}
                                >
                                    <Heart size={14} fill={likedPhotos.has(photo.id) ? "currentColor" : "none"} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Lightbox */}
            <AnimatePresence>
                {selectedPhoto && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedPhoto(null)}
                            className="fixed inset-0 bg-black/90 z-[70]"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="fixed inset-0 z-[71] flex flex-col items-center justify-center p-6"
                        >
                            <div className="w-full max-w-lg flex items-center justify-between mb-4">
                                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                                    {currentIndex + 1} / {filteredPhotos.length}
                                </p>
                                <button onClick={() => setSelectedPhoto(null)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="relative w-full max-w-lg aspect-square mb-8 overflow-hidden rounded-[40px] shadow-2xl bg-white/5">
                                <motion.img
                                    key={selectedPhoto.id || selectedPhoto.timestamp}
                                    src={selectedPhoto.url || selectedPhoto.dataUrl}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="w-full h-full object-cover"
                                />

                                {currentIndex > 0 && (
                                    <button onClick={() => goToPhoto(-1)} className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-all">
                                        <ChevronLeft size={24} />
                                    </button>
                                )}
                                {currentIndex < filteredPhotos.length - 1 && (
                                    <button onClick={() => goToPhoto(1)} className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-all">
                                        <ChevronRight size={24} />
                                    </button>
                                )}
                            </div>

                            <div className="w-full max-w-lg bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-[32px]">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl border border-white/5">
                                            {getWeatherEmoji(selectedPhoto.weather?.sunshineStatus)}
                                        </div>
                                        <div>
                                            <p className="text-white font-black text-lg leading-tight">
                                                {selectedPhoto.weather?.sunshineStatus}
                                            </p>
                                            <p className="text-white/40 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                                <MapPin size={10} className="text-orange-500" />
                                                {selectedPhoto.venueName}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => toggleLike(selectedPhoto.id)}
                                        className={`px-4 py-2 rounded-xl font-black text-xs flex items-center gap-2 transition-all ${likedPhotos.has(selectedPhoto.id)
                                            ? 'bg-rose-500 text-white'
                                            : 'bg-white/10 text-white hover:bg-white/20'
                                            }`}
                                    >
                                        <Heart size={14} fill={likedPhotos.has(selectedPhoto.id) ? "currentColor" : "none"} />
                                        {likedPhotos.has(selectedPhoto.id) ? 'Liked' : 'Like'}
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="px-4 py-3 bg-white/5 rounded-2xl border border-white/5">
                                        <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">Time Shared</p>
                                        <p className="text-xs font-bold text-white/90">{getFormattedDateTime(selectedPhoto.timestamp)}</p>
                                    </div>
                                    <div className="px-4 py-3 bg-white/5 rounded-2xl border border-white/5">
                                        <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">Temperature</p>
                                        <p className="text-xs font-bold text-white/90">{selectedPhoto.weather?.temp || selectedPhoto.weather?.temperature}°C</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PhotoGallery;
