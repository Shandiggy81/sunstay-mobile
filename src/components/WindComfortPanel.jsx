import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Wind, Thermometer, Shield, AlertTriangle, Clock,
    ChevronRight, ChevronDown, Calendar, TrendingUp,
    TrendingDown, Minus, Bell, Info,
} from 'lucide-react';
import { useWeather } from '../context/WeatherContext';
import {
    getWindProfile,
    getWindWarning,
    calculateApparentTemp,
    getComfortZone,
    generateHourlyForecast,
    getWindTrend,
    getOptimalBookingTime,
    getWindImpactExplanation,
    getWindAlertMessage,
} from '../data/windIntelligence';

// ── Wind Warning Badge ────────────────────────────────────────────

const WindWarningBadge = ({ warning }) => {
    const dotColors = {
        green: 'bg-emerald-500',
        yellow: 'bg-amber-500',
        orange: 'bg-orange-500',
        red: 'bg-red-500',
    };

    return (
        <div className={`wind-warning-badge ${warning.bgColor} border ${warning.borderColor}`}>
            <div className="flex items-center gap-2">
                <span className={`wind-warning-dot ${dotColors[warning.level]}`} />
                <span className={`wind-warning-label ${warning.color}`}>
                    {warning.icon} {warning.label}
                </span>
            </div>
            <p className="wind-warning-advice">{warning.advice}</p>
            <p className="wind-warning-detail">
                Effective wind: {warning.effectiveWind} km/h at venue
            </p>
        </div>
    );
};

// ── Comfort Gauge ─────────────────────────────────────────────────

const ComfortGauge = ({ apparentTemp, comfort, actualTemp }) => {
    // Position on a -5 to 45°C scale
    const min = -5;
    const max = 45;
    const position = Math.max(0, Math.min(100, ((apparentTemp - min) / (max - min)) * 100));

    const zoneColors = [
        { start: 0, end: 20, color: '#3b82f6', label: 'Cold' },
        { start: 20, end: 34, color: '#60a5fa', label: 'Cool' },
        { start: 34, end: 54, color: '#22c55e', label: 'Comfortable' },
        { start: 54, end: 66, color: '#f59e0b', label: 'Warm' },
        { start: 66, end: 80, color: '#f97316', label: 'Hot' },
        { start: 80, end: 100, color: '#ef4444', label: 'Extreme' },
    ];

    return (
        <div className="comfort-gauge">
            <div className="comfort-gauge-temps">
                <div className="comfort-gauge-actual">
                    <span className="comfort-gauge-temp-number">{actualTemp}°C</span>
                    <span className="comfort-gauge-temp-label">Actual</span>
                </div>
                <div className="comfort-gauge-arrow">→</div>
                <div className={`comfort-gauge-feels`}>
                    <span className={`comfort-gauge-temp-number ${comfort.color}`}>
                        {apparentTemp}°C
                    </span>
                    <span className="comfort-gauge-temp-label">Feels Like</span>
                </div>
            </div>

            {/* Visual gauge bar */}
            <div className="comfort-gauge-track">
                {zoneColors.map((zone, i) => (
                    <div
                        key={i}
                        className="comfort-gauge-zone"
                        style={{
                            left: `${zone.start}%`,
                            width: `${zone.end - zone.start}%`,
                            background: zone.color,
                        }}
                    />
                ))}
                {/* Indicator needle */}
                <motion.div
                    className="comfort-gauge-needle"
                    initial={{ left: '50%' }}
                    animate={{ left: `${position}%` }}
                    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                />
            </div>
            <div className="comfort-gauge-labels">
                <span>Cold</span>
                <span>Comfortable</span>
                <span>Hot</span>
            </div>
        </div>
    );
};

// ── Hourly Forecast Strip ─────────────────────────────────────────

const HourlyForecastStrip = ({ forecast, onHourTap }) => {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? forecast.slice(0, 24) : forecast.slice(0, 12);

    return (
        <div className="hourly-forecast-section">
            <div className="hourly-scroll">
                {visible.map((h, i) => {
                    const dotColors = {
                        green: '#22c55e',
                        yellow: '#f59e0b',
                        orange: '#f97316',
                        red: '#ef4444',
                    };

                    return (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.02 }}
                            className={`hourly-item ${h.isCurrent ? 'hourly-item-current' : ''}`}
                            onClick={() => onHourTap && onHourTap(h)}
                        >
                            <span className="hourly-label">{h.label}</span>
                            <span className="hourly-icon">{h.comfort.icon}</span>
                            <span className={`hourly-feels ${h.comfort.color}`}>
                                {h.feelsLike}°
                            </span>
                            <div
                                className="hourly-wind-dot"
                                style={{ background: dotColors[h.windWarning.level] }}
                                title={`${h.wind}km/h — ${h.windWarning.label}`}
                            />
                            <span className="hourly-wind">{h.wind}</span>
                        </motion.div>
                    );
                })}
            </div>
            {forecast.length > 12 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="hourly-expand-btn"
                >
                    {expanded ? 'Show less' : 'Show full 24 hours'}
                    <ChevronDown
                        size={14}
                        className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                </button>
            )}
        </div>
    );
};

// ── Main WindComfortPanel Component ───────────────────────────────

const WindComfortPanel = ({ venue }) => {
    const { weather } = useWeather();
    const [selectedHour, setSelectedHour] = useState(null);
    const [showAlert, setShowAlert] = useState(false);

    const windData = useMemo(() => {
        if (!weather || !venue) return null;

        const temp = weather.main?.temp;
        const feelsLikeApi = weather.main?.feels_like;
        const windSpeed = weather.wind?.speed;
        const humidity = weather.main?.humidity;

        const windProfile = getWindProfile(venue);
        const windWarning = getWindWarning(windSpeed, venue);
        const apparentTemp = calculateApparentTemp(
            temp, windSpeed, humidity, windProfile.shelterFactor
        );
        const comfort = getComfortZone(apparentTemp);
        const hourlyForecast = generateHourlyForecast(temp, windSpeed, humidity, venue);
        const windTrend = getWindTrend(hourlyForecast);
        const optimalBooking = getOptimalBookingTime(hourlyForecast);
        const windImpact = getWindImpactExplanation(temp, windSpeed, apparentTemp, venue);
        const alertMessage = getWindAlertMessage(windWarning, venue.venueName);

        return {
            temp: Math.round(temp),
            feelsLikeApi: Math.round(feelsLikeApi),
            windSpeed,
            humidity,
            windProfile,
            windWarning,
            apparentTemp: Math.round(apparentTemp),
            comfort,
            hourlyForecast,
            windTrend,
            optimalBooking,
            windImpact,
            alertMessage,
        };
    }, [weather, venue]);

    if (!windData) return null;

    const TrendIcon = windData.windTrend.direction === 'building'
        ? TrendingUp
        : windData.windTrend.direction === 'calming'
            ? TrendingDown
            : Minus;

    return (
        <div className="wind-comfort-panel">
            {/* ── Section Title ──────────────────────────── */}
            <div className="wind-section-header">
                <div className="wind-section-title-group">
                    <Shield size={16} className="text-blue-500" />
                    <h3 className="wind-section-title">Wind & Comfort Intelligence</h3>
                </div>
                <button
                    onClick={() => setShowAlert(!showAlert)}
                    className="wind-alert-toggle"
                    title="Show wind alert notification"
                    id="wind-alert-toggle"
                >
                    <Bell size={14} />
                </button>
            </div>

            {/* ── Push Notification Alert ─────────────────── */}
            <AnimatePresence>
                {showAlert && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="wind-push-alert"
                    >
                        <div className={`wind-push-card ${windData.windWarning.bgColor} border ${windData.windWarning.borderColor}`}>
                            <Bell size={14} className={windData.windWarning.color} />
                            <p className="wind-push-text">{windData.alertMessage}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Wind Warning Badge ─────────────────────── */}
            <WindWarningBadge warning={windData.windWarning} />

            {/* ── Venue Wind Note ─────────────────────────── */}
            {windData.windProfile.venueNote && (
                <div className="wind-venue-note">
                    <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <p>{windData.windProfile.venueNote}</p>
                </div>
            )}

            {/* ── Dual Temperature + Comfort Gauge ───────── */}
            <ComfortGauge
                apparentTemp={windData.apparentTemp}
                comfort={windData.comfort}
                actualTemp={windData.temp}
            />

            {/* ── Comfort Zone Badge ─────────────────────── */}
            <div className={`wind-comfort-badge ${windData.comfort.bgColor} border ${windData.comfort.borderColor}`}>
                <span className="text-lg">{windData.comfort.icon}</span>
                <div>
                    <p className={`wind-comfort-label ${windData.comfort.color}`}>
                        {windData.comfort.label}
                    </p>
                    <p className="wind-comfort-advice">{windData.comfort.advice}</p>
                </div>
            </div>

            {/* ── Wind Impact Explanation ─────────────────── */}
            {windData.windImpact && (
                <div className="wind-impact-explainer">
                    <Wind size={13} className="text-blue-400 flex-shrink-0" />
                    <p>{windData.windImpact}</p>
                </div>
            )}

            {/* ── Wind Trend ─────────────────────────────── */}
            <div className="wind-trend-row">
                <TrendIcon size={14} className="text-gray-500" />
                <span className="wind-trend-label">
                    {windData.windTrend.icon} {windData.windTrend.label}
                </span>
            </div>

            {/* ── Hourly Forecast Strip ───────────────────── */}
            <div className="wind-forecast-header">
                <Clock size={13} className="text-gray-400" />
                <span>Hourly Comfort Forecast</span>
                <div className="wind-forecast-legend">
                    <span className="wind-legend-dot" style={{ background: '#22c55e' }} />
                    <span>Calm</span>
                    <span className="wind-legend-dot" style={{ background: '#f59e0b' }} />
                    <span>Breezy</span>
                    <span className="wind-legend-dot" style={{ background: '#ef4444' }} />
                    <span>Windy</span>
                </div>
            </div>

            <HourlyForecastStrip
                forecast={windData.hourlyForecast}
                onHourTap={setSelectedHour}
            />

            {/* ── Selected Hour Detail ────────────────────── */}
            <AnimatePresence>
                {selectedHour && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="wind-hour-detail"
                    >
                        <div className={`wind-hour-card ${selectedHour.comfort.bgColor} border ${selectedHour.comfort.borderColor}`}>
                            <div className="wind-hour-card-header">
                                <span className="font-bold text-gray-800">
                                    {selectedHour.label === 'Now' ? 'Right Now' : `At ${selectedHour.label}`}
                                </span>
                                <span className="text-lg">{selectedHour.comfort.icon}</span>
                            </div>
                            <div className="wind-hour-stats">
                                <div>
                                    <span className="wind-hour-stat-label">Temp</span>
                                    <span className="wind-hour-stat-value">{selectedHour.temp}°C</span>
                                </div>
                                <div>
                                    <span className="wind-hour-stat-label">Feels Like</span>
                                    <span className={`wind-hour-stat-value ${selectedHour.comfort.color}`}>
                                        {selectedHour.feelsLike}°C
                                    </span>
                                </div>
                                <div>
                                    <span className="wind-hour-stat-label">Wind</span>
                                    <span className="wind-hour-stat-value">{selectedHour.wind} km/h</span>
                                </div>
                            </div>
                            <p className="wind-hour-advice">{selectedHour.comfort.advice}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Optimal Booking Time ────────────────────── */}
            {windData.optimalBooking && (
                <div className="wind-booking-section">
                    <div className="wind-booking-header">
                        <Calendar size={14} className="text-emerald-500" />
                        <span>Optimal Booking Window</span>
                    </div>
                    <div className="wind-booking-card">
                        <div className="wind-booking-time">
                            <span className="wind-booking-time-range">
                                {windData.optimalBooking.startLabel} — {windData.optimalBooking.endLabel}
                            </span>
                            <ChevronRight size={16} className="text-gray-400" />
                        </div>
                        <p className="wind-booking-reason">
                            {windData.optimalBooking.reason}
                        </p>
                        <p className="wind-booking-tip">
                            Best time for this outdoor area before conditions change
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WindComfortPanel;
