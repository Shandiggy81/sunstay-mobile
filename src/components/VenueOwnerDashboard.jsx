import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Wind, Sun, Cloud, CloudRain, AlertTriangle,
    Camera, Clock,
    Zap, Heart, MessageCircle, Tag, ToggleLeft, ToggleRight,
    Bell, Shield, Sparkles, Megaphone, ShieldCheck,
    ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { useWeather } from '../context/WeatherContext';
import {
    getWindProfile, calculateApparentTemp, getComfortZone,
    generateHourlyForecast, getOptimalBookingTime,
    getWindWarning,
} from '../data/windIntelligence';
import { getPhotosForVenue } from './PhotoUpload';

// ── Helpers ──────────────────────────────────────────────────────

const fmtHour = (h) => {
    if (h === 0 || h === 24) return '12am';
    if (h === 12) return '12pm';
    return h > 12 ? `${h - 12}pm` : `${h}am`;
};

const getUVIndex = (hour, cloudCover) => {
    // Simulate UV index based on time of day and cloud cover
    const solarPeak = [0, 0, 0, 0, 0, 0, 1, 2, 4, 6, 8, 10, 11, 10, 8, 6, 4, 2, 1, 0, 0, 0, 0, 0];
    const baseUV = solarPeak[hour] || 0;
    const cloudFactor = cloudCover === 'clear' ? 1.0 : cloudCover === 'clouds' ? 0.6 : 0.3;
    return Math.round(baseUV * cloudFactor);
};

const getUVLevel = (uv) => {
    if (uv <= 2) return { label: 'Low', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: '✅' };
    if (uv <= 5) return { label: 'Moderate', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: '🟡' };
    if (uv <= 7) return { label: 'High', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', icon: '🟠' };
    if (uv <= 10) return { label: 'Very High', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: '🔴' };
    return { label: 'Extreme', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', icon: '🟣' };
};

const getWeatherEmoji = (condition) => {
    const c = (condition || '').toLowerCase();
    if (c.includes('clear') || c.includes('sunny')) return '☀️';
    if (c.includes('cloud')) return '☁️';
    if (c.includes('rain') || c.includes('drizzle')) return '🌧️';
    if (c.includes('storm') || c.includes('thunder')) return '⛈️';
    return '🌤️';
};

// ── Sub-components ───────────────────────────────────────────────

const LiveWeatherCard = ({ weather, venue, forecast }) => {
    const temp = Math.round(weather.main?.temp);
    const profile = getWindProfile(venue);
    const feelsLike = Math.round(
        calculateApparentTemp(weather.main?.temp, weather.wind?.speed, weather.main?.humidity, profile.shelterFactor)
    );
    const comfort = getComfortZone(feelsLike);
    const windKmh = Math.round((weather.wind?.speed || 0) * 3.6);
    const effectiveWindKmh = Math.round((weather.wind?.speed || 0) * profile.exposure * 3.6);
    const condition = weather.weather?.[0]?.main || 'Clear';
    const description = weather.weather?.[0]?.description || 'clear sky';
    const hour = new Date().getHours();
    const cloudType = condition.toLowerCase();
    const uvIndex = getUVIndex(hour, cloudType);
    const uvLevel = getUVLevel(uvIndex);
    const humidity = weather.main?.humidity || 50;

    return (
        <div className="od-live-card">
            <div className="od-live-header">
                <div className="od-live-badge">
                    <span className="od-live-dot" />
                    <span>LIVE</span>
                </div>
                <span className="od-live-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            {/* Main temp display */}
            <div className="od-live-main">
                <div className="od-live-temp-block">
                    <span className="od-live-emoji">{getWeatherEmoji(condition)}</span>
                    <div>
                        <span className="od-live-temp">{temp}°</span>
                        <span className={`od-live-feels ${comfort.color}`}>Feels {feelsLike}° {comfort.icon}</span>
                    </div>
                </div>
                <div className="od-live-desc">{description}</div>
            </div>

            {/* Stat chips */}
            <div className="od-live-chips">
                <div className="od-chip">
                    <Wind size={13} className="text-blue-500" />
                    <span>{windKmh}km/h</span>
                    {effectiveWindKmh !== windKmh && (
                        <span className="od-chip-sub">({effectiveWindKmh} at venue)</span>
                    )}
                </div>
                <div className="od-chip">
                    <Sun size={13} className={uvLevel.color} />
                    <span>UV {uvIndex}</span>
                    <span className={`od-chip-badge ${uvLevel.bg} ${uvLevel.color} ${uvLevel.border}`}>
                        {uvLevel.label}
                    </span>
                </div>
                <div className="od-chip">
                    <Cloud size={13} className="text-gray-400" />
                    <span>{humidity}% humidity</span>
                </div>
            </div>
        </div>
    );
};

const MiniForecasT = ({ forecast }) => {
    // Next 3 hours
    const next3 = forecast.slice(1, 4);
    const current = forecast[0];

    // Trend analysis
    const tempTrend = next3[2]?.temp - current.temp;
    const windTrend = next3[2]?.wind - current.wind;

    const trends = [];
    if (tempTrend >= 2) trends.push({ icon: <ArrowUpRight size={12} />, text: 'Warming up', color: 'text-orange-500' });
    else if (tempTrend <= -2) trends.push({ icon: <ArrowDownRight size={12} />, text: 'Cooling down', color: 'text-blue-500' });

    if (windTrend >= 5) trends.push({ icon: <ArrowUpRight size={12} />, text: 'Wind increasing', color: 'text-amber-500' });
    else if (windTrend <= -5) trends.push({ icon: <ArrowDownRight size={12} />, text: 'Wind easing', color: 'text-green-500' });

    // Sun/cloud transition detection
    const currentComfort = current.comfort.level;
    const futureComfort = next3[2]?.comfort?.level;
    if ((currentComfort === 'cool' || currentComfort === 'cold') && (futureComfort === 'mild' || futureComfort === 'warm')) {
        trends.push({ icon: <Sun size={12} />, text: 'Sun breaking through', color: 'text-amber-400' });
    }

    return (
        <div className="od-forecast-section">
            <div className="od-section-label">
                <Clock size={12} />
                <span>3-Hour Outlook</span>
            </div>
            <div className="od-forecast-strip">
                {next3.map((h, i) => (
                    <div key={i} className="od-forecast-hour">
                        <span className="od-forecast-time">{h.label}</span>
                        <span className="od-forecast-icon">{h.comfort.icon}</span>
                        <span className={`od-forecast-temp ${h.comfort.color}`}>{h.feelsLike}°</span>
                        <span className="od-forecast-wind">{h.wind}km/h</span>
                    </div>
                ))}
            </div>
            {trends.length > 0 && (
                <div className="od-trend-tags">
                    {trends.map((t, i) => (
                        <span key={i} className={`od-trend-tag ${t.color}`}>
                            {t.icon} {t.text}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

const AlertBadges = ({ weather, venue, forecast }) => {
    const alerts = [];
    const hour = new Date().getHours();

    // Wind warning
    const windWarning = getWindWarning(weather.wind?.speed, venue);
    if (windWarning.level === 'orange' || windWarning.level === 'red') {
        alerts.push({
            type: 'wind',
            icon: '🌬️',
            lucideIcon: <Wind size={14} />,
            title: windWarning.label,
            desc: windWarning.advice,
            color: windWarning.level === 'red' ? 'od-alert-red' : 'od-alert-orange',
        });
    }

    // UV alert
    const cloudType = (weather.weather?.[0]?.main || '').toLowerCase();
    const uvIndex = getUVIndex(hour, cloudType);
    if (uvIndex >= 8) {
        alerts.push({
            type: 'uv',
            icon: '☀️',
            lucideIcon: <Sun size={14} />,
            title: `UV Index: ${uvIndex} — ${getUVLevel(uvIndex).label}`,
            desc: 'Promote shade areas and apply sunscreen reminders',
            color: 'od-alert-orange',
        });
    }

    // Rain approaching (check next 3 hours)
    const next3 = forecast.slice(1, 4);
    const currentTemp = forecast[0]?.temp || 20;
    const futureTemps = next3.map(h => h.temp);
    const tempDrop = currentTemp - Math.min(...futureTemps);
    if (tempDrop > 5) {
        alerts.push({
            type: 'temp',
            icon: '🌧️',
            lucideIcon: <CloudRain size={14} />,
            title: 'Temperature dropping',
            desc: `${Math.round(tempDrop)}° drop expected — prepare indoor backup`,
            color: 'od-alert-blue',
        });
    }

    if (alerts.length === 0) return null;

    return (
        <div className="od-alerts-section">
            <div className="od-section-label">
                <AlertTriangle size={12} />
                <span>Active Alerts</span>
                <span className="od-alert-count">{alerts.length}</span>
            </div>
            <div className="od-alerts-list">
                {alerts.map((alert, i) => (
                    <motion.div
                        key={alert.type}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className={`od-alert-card ${alert.color}`}
                    >
                        <div className="od-alert-icon">{alert.icon}</div>
                        <div className="od-alert-body">
                            <div className="od-alert-title">{alert.title}</div>
                            <div className="od-alert-desc">{alert.desc}</div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

const EngagementAnalytics = ({ photos, weather, venue }) => {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const total = photos.length;
    const thisWeek = photos.filter(p => new Date(p.timestamp) >= weekAgo).length;

    // Weather impact analysis
    const sunnyPhotos = photos.filter(p => {
        const s = (p.weather?.sunshineStatus || '').toLowerCase();
        return s.includes('sunny') || s.includes('clear');
    }).length;
    const sunnyPct = total > 0 ? Math.round((sunnyPhotos / total) * 100) : 0;

    // Peak hours analysis (from photo timestamps)
    const hourBuckets = new Array(24).fill(0);
    photos.forEach(p => {
        const h = new Date(p.timestamp).getHours();
        hourBuckets[h]++;
    });
    const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
    const peakLabel = total > 0 ? fmtHour(peakHour) : 'N/A';

    // Most tagged weather
    const weatherCounts = {};
    photos.forEach(p => {
        const s = p.weather?.sunshineStatus || 'Unknown';
        weatherCounts[s] = (weatherCounts[s] || 0) + 1;
    });
    const topWeather = Object.entries(weatherCounts).sort((a, b) => b[1] - a[1])[0];

    return (
        <div className="od-engagement-section">
            <div className="od-section-label">
                <Camera size={12} />
                <span>Guest Engagement</span>
            </div>

            {/* Photo counter card */}
            <div className="od-engagement-hero">
                <div className="od-engagement-count">
                    <motion.span
                        key={thisWeek}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="od-big-number"
                    >
                        {thisWeek}
                    </motion.span>
                    <span className="od-engagement-text">
                        guest{thisWeek !== 1 ? 's' : ''} shared photos this week
                    </span>
                </div>
                <div className="od-engagement-total">
                    <Camera size={14} className="text-gray-400" />
                    <span>{total} total uploads</span>
                </div>
            </div>

            {/* Weather impact */}
            <div className="od-engagement-grid">
                <div className="od-engage-card">
                    <div className="od-engage-card-icon">☀️</div>
                    <div className="od-engage-card-value">{sunnyPct}%</div>
                    <div className="od-engage-card-label">
                        Sunny days = more uploads
                    </div>
                </div>
                <div className="od-engage-card">
                    <div className="od-engage-card-icon">📸</div>
                    <div className="od-engage-card-value">{peakLabel}</div>
                    <div className="od-engage-card-label">
                        Peak engagement time
                    </div>
                </div>
                <div className="od-engage-card">
                    <div className="od-engage-card-icon">
                        {topWeather ? getWeatherEmoji(topWeather[0]) : '🌤️'}
                    </div>
                    <div className="od-engage-card-value">
                        {topWeather ? topWeather[0] : 'None'}
                    </div>
                    <div className="od-engage-card-label">
                        Most active weather
                    </div>
                </div>
            </div>

            {/* Weather comparison insight */}
            {total > 2 && sunnyPct > 0 && (
                <div className="od-insight-card">
                    <Sparkles size={13} className="text-amber-500 flex-shrink-0" />
                    <span>
                        Sunny days drive <strong>{sunnyPct}% more</strong> photo uploads.
                        {sunnyPct > 60 ? ' Your outdoor spaces are the star!' : ' Consider promoting shaded areas on cloudy days.'}
                    </span>
                </div>
            )}
        </div>
    );
};

const AIRecommendations = ({ weather, venue, forecast }) => {
    const recs = useMemo(() => {
        const suggestions = [];
        const windWarning = getWindWarning(weather.wind?.speed, venue);
        const hour = new Date().getHours();
        const cloudType = (weather.weather?.[0]?.main || '').toLowerCase();
        const uvIndex = getUVIndex(hour, cloudType);
        const temp = weather.main?.temp || 20;
        const profile = getWindProfile(venue);
        const feelsLike = calculateApparentTemp(temp, weather.wind?.speed, weather.main?.humidity, profile.shelterFactor);
        const comfort = getComfortZone(feelsLike);
        const optimalWindow = getOptimalBookingTime(forecast);

        // Wind-based
        if (windWarning.level === 'orange' || windWarning.level === 'red') {
            suggestions.push({
                priority: 'high',
                icon: '🌬️',
                title: 'High wind forecast',
                action: 'Send push notification about indoor seating availability',
                category: 'operations',
            });
        }

        // UV-based
        if (uvIndex >= 8) {
            suggestions.push({
                priority: 'high',
                icon: '☀️',
                title: 'UV index extreme',
                action: 'Promote covered patio and shaded areas',
                category: 'marketing',
            });
        } else if (uvIndex >= 5) {
            suggestions.push({
                priority: 'medium',
                icon: '🧴',
                title: 'High UV this afternoon',
                action: 'Offer complimentary sunscreen for outdoor diners',
                category: 'service',
            });
        }

        // Weekend sunny forecast
        const dayOfWeek = new Date().getDay();
        if ((dayOfWeek === 4 || dayOfWeek === 5) && cloudType.includes('clear')) {
            suggestions.push({
                priority: 'medium',
                icon: '🌞',
                title: 'Sunny weekend approaching',
                action: 'Activate outdoor seating campaign — boost social media posts',
                category: 'marketing',
            });
        }

        // Cold comfort
        if (comfort.level === 'cold' || comfort.level === 'cool') {
            suggestions.push({
                priority: 'medium',
                icon: '🔥',
                title: 'Chilly conditions detected',
                action: 'Highlight fireplace seating and warm drink specials',
                category: 'operations',
            });
        }

        // Optimal booking window
        if (optimalWindow) {
            suggestions.push({
                priority: 'low',
                icon: '📅',
                title: `Optimal window: ${optimalWindow.startLabel}–${optimalWindow.endLabel}`,
                action: `${optimalWindow.reason} — push bookings for this window`,
                category: 'booking',
            });
        }

        // Rain
        if (cloudType.includes('rain') || cloudType.includes('drizzle')) {
            suggestions.push({
                priority: 'high',
                icon: '🌧️',
                title: 'Rain detected',
                action: 'Switch outdoor reservations to covered areas — notify guests',
                category: 'operations',
            });
        }

        // Hot weather
        if (comfort.level === 'hot' || comfort.level === 'extreme') {
            suggestions.push({
                priority: 'high',
                icon: '🥤',
                title: 'Extreme heat conditions',
                action: 'Activate misting fans, promote cold beverages and shaded spaces',
                category: 'operations',
            });
        }

        // Low engagement prompt
        if (suggestions.length === 0) {
            suggestions.push({
                priority: 'low',
                icon: '✨',
                title: 'Conditions look great',
                action: 'Perfect time to post outdoor photos and attract walk-ins!',
                category: 'marketing',
            });
        }

        return suggestions;
    }, [weather, venue, forecast]);

    const priorityColors = {
        high: 'od-rec-high',
        medium: 'od-rec-medium',
        low: 'od-rec-low',
    };

    const categoryIcons = {
        operations: <Shield size={10} />,
        marketing: <Megaphone size={10} />,
        service: <Heart size={10} />,
        booking: <Clock size={10} />,
    };

    return (
        <div className="od-recs-section">
            <div className="od-section-label">
                <Sparkles size={12} />
                <span>AI Recommendations</span>
                <span className="od-rec-badge">Smart</span>
            </div>
            <div className="od-recs-list">
                {recs.map((rec, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className={`od-rec-card ${priorityColors[rec.priority]}`}
                    >
                        <span className="od-rec-icon">{rec.icon}</span>
                        <div className="od-rec-body">
                            <div className="od-rec-title">{rec.title}</div>
                            <div className="od-rec-action">{rec.action}</div>
                        </div>
                        <div className="od-rec-cat">
                            {categoryIcons[rec.category]}
                            <span>{rec.category}</span>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

const ResponseTools = ({ venue, weather }) => {
    const [outdoorOpen, setOutdoorOpen] = useState(true);
    const [showPromo, setShowPromo] = useState(false);
    const [promoSent, setPromoSent] = useState(false);
    const [likedPhotos, setLikedPhotos] = useState(new Set());

    const windWarning = getWindWarning(weather.wind?.speed, venue);
    const isWindy = windWarning.level === 'orange' || windWarning.level === 'red';

    const handleToggleOutdoor = () => {
        setOutdoorOpen(!outdoorOpen);
    };

    const handleSendPromo = () => {
        setPromoSent(true);
        setTimeout(() => setPromoSent(false), 3000);
    };

    const handleLikePhoto = (photoId) => {
        setLikedPhotos(prev => {
            const next = new Set(prev);
            if (next.has(photoId)) next.delete(photoId);
            else next.add(photoId);
            return next;
        });
    };

    // Get recent guest photos
    const recentPhotos = useMemo(() => {
        return getPhotosForVenue(venue.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 4);
    }, [venue.id]);

    return (
        <div className="od-tools-section">
            <div className="od-section-label">
                <Zap size={12} />
                <span>Quick Actions</span>
            </div>

            {/* Availability Toggle */}
            <div className="od-tool-card">
                <div className="od-tool-row">
                    <div className="od-tool-info">
                        <span className="od-tool-title">Outdoor Spaces</span>
                        <span className={`od-tool-status ${outdoorOpen ? 'text-green-600' : 'text-red-500'}`}>
                            {outdoorOpen ? '✅ Open' : '❌ Closed'}
                        </span>
                    </div>
                    <button
                        onClick={handleToggleOutdoor}
                        className={`od-toggle-btn ${outdoorOpen ? 'od-toggle-on' : 'od-toggle-off'}`}
                        id="outdoor-toggle"
                    >
                        {outdoorOpen ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                    </button>
                </div>
                {isWindy && outdoorOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="od-tool-warning"
                    >
                        <AlertTriangle size={12} />
                        <span>Wind warning active — consider closing outdoor spaces</span>
                    </motion.div>
                )}
            </div>

            {/* Guest Photo Interactions */}
            {recentPhotos.length > 0 && (
                <div className="od-tool-card">
                    <div className="od-tool-title-row">
                        <Camera size={13} className="text-purple-500" />
                        <span className="od-tool-title">Recent Guest Photos</span>
                    </div>
                    <div className="od-guest-photos">
                        {recentPhotos.map((photo) => (
                            <div key={photo.id} className="od-guest-photo">
                                <img
                                    src={photo.dataUrl}
                                    alt="Guest upload"
                                    className="od-guest-photo-img"
                                />
                                <div className="od-guest-photo-actions">
                                    <button
                                        onClick={() => handleLikePhoto(photo.id)}
                                        className={`od-photo-action-btn ${likedPhotos.has(photo.id) ? 'od-liked' : ''}`}
                                        id={`like-photo-${photo.id}`}
                                    >
                                        <Heart size={12} fill={likedPhotos.has(photo.id) ? '#ef4444' : 'none'} />
                                    </button>
                                    <button className="od-photo-action-btn" id={`comment-photo-${photo.id}`}>
                                        <MessageCircle size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Promote Deal */}
            <div className="od-tool-card">
                <div className="od-tool-title-row">
                    <Tag size={13} className="text-emerald-500" />
                    <span className="od-tool-title">Promote a Deal</span>
                </div>

                {!showPromo ? (
                    <div className="od-promo-suggestions">
                        <button
                            onClick={() => setShowPromo(true)}
                            className="od-promo-btn"
                            id="promo-windy-day"
                        >
                            <span>🌬️</span>
                            <span>Windy day special — 20% off indoor tables</span>
                        </button>
                        <button
                            onClick={() => setShowPromo(true)}
                            className="od-promo-btn"
                            id="promo-sunny-day"
                        >
                            <span>☀️</span>
                            <span>Sunny session — free welcome drink with outdoor booking</span>
                        </button>
                        <button
                            onClick={() => setShowPromo(true)}
                            className="od-promo-btn"
                            id="promo-rain-day"
                        >
                            <span>🌧️</span>
                            <span>Rainy day escape — 15% off all cozy corners</span>
                        </button>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="od-promo-active"
                    >
                        <div className="od-promo-preview">
                            <div className="od-promo-preview-header">
                                <Megaphone size={14} className="text-emerald-500" />
                                <span>Deal Ready to Send</span>
                            </div>
                            <div className="od-promo-preview-body">
                                <span className="od-promo-emoji">🌬️</span>
                                <div>
                                    <p className="od-promo-preview-title">Windy Day Special</p>
                                    <p className="od-promo-preview-desc">20% off indoor tables — today only at {venue.venueName}</p>
                                </div>
                            </div>
                        </div>
                        <div className="od-promo-actions">
                            <button
                                onClick={() => { setShowPromo(false); }}
                                className="od-promo-cancel"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSendPromo}
                                className="od-promo-send"
                                id="send-promo"
                            >
                                {promoSent ? (
                                    <>✅ Sent!</>
                                ) : (
                                    <>
                                        <Bell size={13} />
                                        Send to Guests
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

// ── Main Dashboard ───────────────────────────────────────────────

const VenueOwnerDashboard = ({ venue, onClose }) => {
    const { weather } = useWeather();

    const forecast = useMemo(() => {
        if (!weather || !venue) return [];
        return generateHourlyForecast(
            weather.main?.temp, weather.wind?.speed, weather.main?.humidity, venue
        );
    }, [weather, venue]);

    const photos = useMemo(() => {
        return venue ? getPhotosForVenue(venue.id) : [];
    }, [venue]);

    if (!weather || !venue) return null;

    return (
        <>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/50 z-[70]"
            />

            {/* Dashboard Panel */}
            <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.95 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed inset-x-3 top-[3%] bottom-[3%] z-[71] mx-auto max-w-lg overflow-hidden"
            >
                <div className="od-panel">
                    {/* Header */}
                    <div className="od-header">
                        <div className="od-header-left">
                            <div className="od-header-icon">
                                <ShieldCheck size={20} className="text-blue-500" />
                            </div>
                            <div>
                                <h2 className="od-header-title">Venue Dashboard</h2>
                                <p className="od-header-subtitle">{venue.venueName}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="od-close-btn" id="od-close">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="od-content">
                        {/* Real-Time Weather Monitor */}
                        <LiveWeatherCard weather={weather} venue={venue} forecast={forecast} />

                        {/* 3-Hour Mini Forecast */}
                        <MiniForecasT forecast={forecast} />

                        {/* Alert Badges */}
                        <AlertBadges weather={weather} venue={venue} forecast={forecast} />

                        {/* Engagement Analytics */}
                        <EngagementAnalytics photos={photos} weather={weather} venue={venue} />

                        {/* AI Recommendations */}
                        <AIRecommendations weather={weather} venue={venue} forecast={forecast} />

                        {/* Response Tools */}
                        <ResponseTools venue={venue} weather={weather} />

                        <div className="h-6" />
                    </div>
                </div>
            </motion.div>
        </>
    );
};

export default VenueOwnerDashboard;
