import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Wind, Sun, Cloud, CloudRain, AlertTriangle,
    Camera, Clock,
    Zap, Heart, MessageCircle, Tag, ToggleLeft, ToggleRight,
    Bell, Shield, Sparkles, Megaphone, ShieldCheck,
    ArrowUpRight, ArrowDownRight, Check,
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

// ── Promo definitions ─────────────────────────────────────────────

const PROMOS = {
    windy: {
        emoji: '🌬️',
        label: 'Windy day special — 20% off indoor tables',
        title: 'Windy Day Special',
        desc: (venueName) => `20% off indoor tables — today only at ${venueName}`,
    },
    sunny: {
        emoji: '☀️',
        label: 'Sunny session — free welcome drink with outdoor booking',
        title: 'Sunny Session',
        desc: (venueName) => `Free welcome drink with outdoor booking — today only at ${venueName}`,
    },
    rain: {
        emoji: '🌧️',
        label: 'Rainy day escape — 15% off all cozy corners',
        title: 'Rainy Day Escape',
        desc: (venueName) => `15% off all cozy corners — today only at ${venueName}`,
    },
};

// ── Vibe tags (max 8 selectable) ─────────────────────────────────

const ALL_VIBE_TAGS = [
    { key: 'sunny-terrace', label: '☀️ Sunny Terrace' },
    { key: 'cozy-inside', label: '🔥 Cozy Inside' },
    { key: 'dog-friendly', label: '🐶 Dog Friendly' },
    { key: 'live-music', label: '🎸 Live Music' },
    { key: 'harbour-views', label: '⚓ Harbour Views' },
    { key: 'rooftop', label: '🏙️ Rooftop' },
    { key: 'waterfront', label: '🌊 Waterfront' },
    { key: 'shaded-patio', label: '⛱️ Shaded Patio' },
    { key: 'late-night', label: '🌙 Late Night' },
    { key: 'great-coffee', label: '☕ Great Coffee' },
    { key: 'cocktails', label: '🍹 Cocktails' },
    { key: 'family-friendly', label: '👨‍👩‍👧 Family Friendly' },
];

const MAX_TAGS = 8;

// ── Business hours helpers ────────────────────────────────────────

const DEFAULT_HOURS = [
    { day: 'Monday', open: '08:00', close: '22:00', closed: false },
    { day: 'Tuesday', open: '08:00', close: '22:00', closed: false },
    { day: 'Wednesday', open: '08:00', close: '22:00', closed: false },
    { day: 'Thursday', open: '08:00', close: '23:00', closed: false },
    { day: 'Friday', open: '10:00', close: '00:00', closed: false },
    { day: 'Saturday', open: '10:00', close: '00:00', closed: false },
    { day: 'Sunday', open: '10:00', close: '22:00', closed: false },
];

const WEEKEND_DAYS = new Set(['Saturday', 'Sunday', 'Friday']);

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

const MiniForecast = ({ forecast }) => {
    const next3 = forecast.slice(1, 4);
    const current = forecast[0];

    const tempTrend = next3[2]?.temp - current.temp;
    const windTrend = next3[2]?.wind - current.wind;

    const trends = [];
    if (tempTrend >= 2) trends.push({ icon: <ArrowUpRight size={12} />, text: 'Warming up', color: 'text-orange-500' });
    else if (tempTrend <= -2) trends.push({ icon: <ArrowDownRight size={12} />, text: 'Cooling down', color: 'text-blue-500' });

    if (windTrend >= 5) trends.push({ icon: <ArrowUpRight size={12} />, text: 'Wind increasing', color: 'text-amber-500' });
    else if (windTrend <= -5) trends.push({ icon: <ArrowDownRight size={12} />, text: 'Wind easing', color: 'text-green-500' });

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

    const sunnyPhotos = photos.filter(p => {
        const s = (p.weather?.sunshineStatus || '').toLowerCase();
        return s.includes('sunny') || s.includes('clear');
    }).length;
    const sunnyPct = total > 0 ? Math.round((sunnyPhotos / total) * 100) : 0;

    const hourBuckets = new Array(24).fill(0);
    photos.forEach(p => {
        const h = new Date(p.timestamp).getHours();
        hourBuckets[h]++;
    });
    const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
    const peakLabel = total > 0 ? fmtHour(peakHour) : 'N/A';

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

        if (windWarning.level === 'orange' || windWarning.level === 'red') {
            suggestions.push({
                priority: 'high',
                icon: '🌬️',
                title: 'High wind forecast',
                action: 'Send push notification about indoor seating availability',
                category: 'operations',
            });
        }

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

        if (comfort.level === 'cold' || comfort.level === 'cool') {
            suggestions.push({
                priority: 'medium',
                icon: '🔥',
                title: 'Chilly conditions detected',
                action: 'Highlight fireplace seating and warm drink specials',
                category: 'operations',
            });
        }

        if (optimalWindow) {
            suggestions.push({
                priority: 'low',
                icon: '📅',
                title: `Optimal window: ${optimalWindow.startLabel}–${optimalWindow.endLabel}`,
                action: `${optimalWindow.reason} — push bookings for this window`,
                category: 'booking',
            });
        }

        if (cloudType.includes('rain') || cloudType.includes('drizzle')) {
            suggestions.push({
                priority: 'high',
                icon: '🌧️',
                title: 'Rain detected',
                action: 'Switch outdoor reservations to covered areas — notify guests',
                category: 'operations',
            });
        }

        if (comfort.level === 'hot' || comfort.level === 'extreme') {
            suggestions.push({
                priority: 'high',
                icon: '🥤',
                title: 'Extreme heat conditions',
                action: 'Activate misting fans, promote cold beverages and shaded spaces',
                category: 'operations',
            });
        }

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

// ── Vibe Tags Section ─────────────────────────────────────────────

const VibeTags = ({ venueId }) => {
    const storageKey = `vibe-tags-${venueId}`;
    const [selected, setSelected] = useState(() => {
        try {
            const raw = window._vibeTagsStore?.[storageKey];
            return raw ? new Set(raw) : new Set(['sunny-terrace', 'dog-friendly']);
        } catch { return new Set(['sunny-terrace', 'dog-friendly']); }
    });
    const [saved, setSaved] = useState(false);

    const toggle = (key) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else if (next.size < MAX_TAGS) {
                next.add(key);
            }
            return next;
        });
        setSaved(false);
    };

    const handleSave = () => {
        if (!window._vibeTagsStore) window._vibeTagsStore = {};
        window._vibeTagsStore[storageKey] = [...selected];
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const remaining = MAX_TAGS - selected.size;

    return (
        <div className="od-tool-card">
            <div className="od-tool-title-row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={13} className="text-violet-500" />
                    <span className="od-tool-title">Vibe Tags</span>
                </div>
                {/* ── FIX: remaining slots counter, not selected/max ── */}
                <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: remaining === 0 ? '#ef4444' : '#9ca3af',
                    background: remaining === 0 ? '#fef2f2' : '#f3f4f6',
                    padding: '2px 8px', borderRadius: 8,
                }}>
                    {remaining === 0 ? 'Full' : `${remaining} left`}
                </span>
            </div>
            <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, fontWeight: 500 }}>
                Pick up to {MAX_TAGS} tags that describe your venue
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {ALL_VIBE_TAGS.map(({ key, label }) => {
                    const isOn = selected.has(key);
                    const disabled = !isOn && selected.size >= MAX_TAGS;
                    return (
                        <button
                            key={key}
                            onClick={() => !disabled && toggle(key)}
                            style={{
                                padding: '5px 12px',
                                borderRadius: 20,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                opacity: disabled ? 0.35 : 1,
                                border: isOn ? '2px solid #7c3aed' : '1.5px solid #e5e7eb',
                                background: isOn
                                    ? 'linear-gradient(135deg, #ede9fe, #ddd6fe)'
                                    : '#f9fafb',
                                color: isOn ? '#5b21b6' : '#6b7280',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            <button
                onClick={handleSave}
                style={{
                    width: '100%',
                    padding: '9px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: saved
                        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                        : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    color: 'white',
                    transition: 'background 0.3s ease',
                    boxShadow: saved
                        ? '0 2px 8px rgba(34,197,94,0.3)'
                        : '0 2px 8px rgba(124,58,237,0.25)',
                }}
            >
                {saved ? <><Check size={14} /> Saved!</> : 'Save Vibe Tags'}
            </button>
        </div>
    );
};

// ── Business Hours Section ────────────────────────────────────────

const BusinessHours = ({ venueId }) => {
    const [hours, setHours] = useState(DEFAULT_HOURS);
    const [saved, setSaved] = useState(false);

    const update = (idx, field, value) => {
        setSaved(false);
        setHours(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
    };

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="od-tool-card">
            <div className="od-tool-title-row" style={{ marginBottom: 10 }}>
                <Clock size={13} className="text-blue-500" />
                <span className="od-tool-title">Business Hours</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {hours.map((row, idx) => {
                    const isWeekend = WEEKEND_DAYS.has(row.day);
                    return (
                        <div
                            key={row.day}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '7px 10px',
                                borderRadius: 10,
                                /* ── FIX: amber tint for Fri/Sat/Sun ── */
                                background: row.closed
                                    ? '#fafafa'
                                    : isWeekend
                                        ? 'linear-gradient(90deg, #fffbeb, #fef9f0)'
                                        : '#f9fafb',
                                border: isWeekend && !row.closed
                                    ? '1px solid #fde68a'
                                    : '1px solid transparent',
                                opacity: row.closed ? 0.6 : 1,
                            }}
                        >
                            {/* Day label */}
                            <span style={{
                                width: 80, fontSize: 12, fontWeight: 700,
                                color: isWeekend ? '#92400e' : '#374151',
                                flexShrink: 0,
                            }}>
                                {row.day.slice(0, 3)}
                                {isWeekend && <span style={{ marginLeft: 4, fontSize: 9, color: '#f59e0b' }}>★</span>}
                            </span>

                            {row.closed ? (
                                <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>Closed</span>
                            ) : (
                                <>
                                    <input
                                        type="time"
                                        value={row.open}
                                        onChange={e => update(idx, 'open', e.target.value)}
                                        style={{
                                            flex: 1, padding: '3px 6px', borderRadius: 8,
                                            border: '1px solid #e5e7eb', fontSize: 12,
                                            fontWeight: 600, color: '#374151',
                                            background: 'white',
                                        }}
                                    />
                                    <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>–</span>
                                    <input
                                        type="time"
                                        value={row.close}
                                        onChange={e => update(idx, 'close', e.target.value)}
                                        style={{
                                            flex: 1, padding: '3px 6px', borderRadius: 8,
                                            border: '1px solid #e5e7eb', fontSize: 12,
                                            fontWeight: 600, color: '#374151',
                                            background: 'white',
                                        }}
                                    />
                                </>
                            )}

                            {/* Closed toggle */}
                            <button
                                onClick={() => update(idx, 'closed', !row.closed)}
                                style={{
                                    padding: '3px 8px', borderRadius: 8,
                                    border: '1px solid',
                                    borderColor: row.closed ? '#fca5a5' : '#e5e7eb',
                                    background: row.closed ? '#fef2f2' : '#f9fafb',
                                    fontSize: 10, fontWeight: 700,
                                    color: row.closed ? '#ef4444' : '#9ca3af',
                                    cursor: 'pointer', flexShrink: 0,
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                {row.closed ? 'Closed' : 'Open'}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* ── FIX: Save with confirmation ── */}
            <button
                onClick={handleSave}
                style={{
                    marginTop: 12,
                    width: '100%',
                    padding: '9px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: saved
                        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                        : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: 'white',
                    transition: 'background 0.3s ease',
                    boxShadow: saved
                        ? '0 2px 8px rgba(34,197,94,0.3)'
                        : '0 2px 8px rgba(59,130,246,0.25)',
                }}
            >
                {saved ? <><Check size={14} /> Saved!</> : 'Save Hours'}
            </button>
        </div>
    );
};

// ── Response Tools ────────────────────────────────────────────────

const ResponseTools = ({ venue, weather }) => {
    const [outdoorOpen, setOutdoorOpen] = useState(venue.outdoorOpen ?? true);
    const [activePromo, setActivePromo] = useState(null);
    const [promoSent, setPromoSent] = useState(false);
    const [likedPhotos, setLikedPhotos] = useState(new Set());

    const windWarning = getWindWarning(weather.wind?.speed, venue);
    const isWindy = windWarning.level === 'orange' || windWarning.level === 'red';

    const handleToggleOutdoor = () => setOutdoorOpen(prev => !prev);

    const handleSendPromo = () => {
        setPromoSent(true);
        setTimeout(() => {
            setPromoSent(false);
            setActivePromo(null);
        }, 3000);
    };

    const handleLikePhoto = (photoId) => {
        setLikedPhotos(prev => {
            const next = new Set(prev);
            if (next.has(photoId)) next.delete(photoId);
            else next.add(photoId);
            return next;
        });
    };

    const recentPhotos = useMemo(() => {
        return getPhotosForVenue(venue.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 4);
    }, [venue.id]);

    const selectedPromo = activePromo ? PROMOS[activePromo] : null;

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

            {/* Business Hours */}
            <BusinessHours venueId={venue.id} />

            {/* Vibe Tags */}
            <VibeTags venueId={venue.id} />

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

                {!activePromo ? (
                    <div className="od-promo-suggestions">
                        {Object.entries(PROMOS).map(([key, promo]) => (
                            <button
                                key={key}
                                onClick={() => setActivePromo(key)}
                                className="od-promo-btn"
                                id={`promo-${key}`}
                            >
                                <span>{promo.emoji}</span>
                                <span>{promo.label}</span>
                            </button>
                        ))}
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
                                <span className="od-promo-emoji">{selectedPromo.emoji}</span>
                                <div>
                                    <p className="od-promo-preview-title">{selectedPromo.title}</p>
                                    <p className="od-promo-preview-desc">{selectedPromo.desc(venue.venueName)}</p>
                                </div>
                            </div>
                        </div>
                        <div className="od-promo-actions">
                            <button
                                onClick={() => setActivePromo(null)}
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

    if (!weather || !venue) {
        return (
            <>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/50 z-[70]"
                />
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 50, scale: 0.95 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    className="fixed inset-x-3 top-[3%] bottom-[3%] z-[71] mx-auto max-w-lg overflow-hidden"
                >
                    <div className="od-panel">
                        <div className="od-header">
                            <div className="od-header-left">
                                <div className="od-header-icon">
                                    <ShieldCheck size={20} className="text-blue-500" />
                                </div>
                                <div>
                                    <h2 className="od-header-title">Owner Dashboard</h2>
                                    <p className="od-header-subtitle">Loading weather data…</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="od-close-btn" id="od-close">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="od-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                                <div className="od-live-dot" style={{ margin: '0 auto 0.75rem', width: 10, height: 10 }} />
                                <p>Fetching live weather…</p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </>
        );
    }

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
                                <h2 className="od-header-title">{venue.venueName}</h2>
                                <p className="od-header-subtitle">Owner Dashboard · Live weather</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="od-close-btn" id="od-close">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="od-content">
                        <LiveWeatherCard weather={weather} venue={venue} forecast={forecast} />
                        <MiniForecast forecast={forecast} />
                        <AlertBadges weather={weather} venue={venue} forecast={forecast} />
                        <EngagementAnalytics photos={photos} weather={weather} venue={venue} />
                        <AIRecommendations weather={weather} venue={venue} forecast={forecast} />
                        <ResponseTools venue={venue} weather={weather} />
                        <div className="h-6" />
                    </div>
                </div>
            </motion.div>
        </>
    );
};

export default VenueOwnerDashboard;
