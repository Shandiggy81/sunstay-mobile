import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Calendar, Thermometer, Wind, Flame, Sun, CloudRain,
    MapPin, Share2, ChevronDown, ChevronUp, Droplets, Shield
} from 'lucide-react';
import { useWeather } from '../context/WeatherContext';
import { getWindProfile, calculateApparentTemp, getComfortZone } from '../data/windIntelligence';
import { calculateDynamicToday } from '../util/sunCalcLogic';

const VenueCard = ({ venue, onClose }) => {
    const {
        calculateSunstayScore, getTemperature, theme, weather
    } = useWeather();

    const [expanded, setExpanded] = useState(false);

    if (!venue) return null;

    const sunstayScore = calculateSunstayScore(venue);
    const temperature = getTemperature();
    const hasFireplace = venue.tags?.includes('Fireplace');
    const hasHeaters = venue.tags?.includes('Heaters');

    /* ── Sunshine hours remaining ─────────────────────── */
    const sunLeft = useMemo(() => {
        if (!weather?.sys?.sunset) return null;
        const now = new Date();
        const sunset = new Date(weather.sys.sunset * 1000);
        const diff = sunset - now;
        if (diff <= 0) return { text: 'Sun has set', icon: '🌙' };
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        return { text: h > 0 ? `${h}h ${m}m` : `${m}min`, icon: h > 1 ? '☀️' : '🌅' };
    }, [weather]);

    /* ── Fireplace / heater status ────────────────────── */
    const heatingStatus = useMemo(() => {
        if (!hasFireplace && !hasHeaters) return null;
        const temp = temperature || 20;
        const label = hasFireplace ? 'Fireplace' : 'Heaters';
        if (temp < 15) return { text: 'ON Now', active: true, label };
        if (temp < 20 && new Date().getHours() >= 17) return { text: 'ON from 5PM', active: true, label };
        return { text: 'Evenings', active: false, label };
    }, [temperature, hasFireplace, hasHeaters]);

    /* ── Optimal sun window ────────────────────────────── */
    const optimalWindow = useMemo(() => {
        const room = (venue.roomTypes || []).find(r => r.hasBalcony || r.hasOutdoorArea);
        if (!room) return null;
        try {
            const today = calculateDynamicToday(
                venue.lat, venue.lng, room.orientation,
                weather?.clouds?.all / 100 || 0,
                room.obstructionLevel
            );
            return today?.optimalWindow || null;
        } catch { return null; }
    }, [venue, weather]);

    /* ── Wind & UV helper ──────────────────────────────── */
    const windSpeed = weather?.wind?.speed;
    const uvIndex = weather?.uvi;
    const isRaining = (weather?.weather?.[0]?.main || '').toLowerCase().includes('rain');

    /* ── Type label ────────────────────────────────────── */
    const typeLabel = venue.typeCategory === 'Hotel' || venue.typeCategory === 'ShortStay'
        ? venue.typeLabel
        : venue.vibe || 'Venue';

    return (
        <AnimatePresence>
            {venue && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[999999]"
                    />

                    {/* Card */}
                    <motion.div
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 260, mass: 0.8 }}
                        className="ss-vc-sheet"
                    >
                        <div className="ss-vc-inner">
                            {/* ── Drag handle (mobile) ────────── */}
                            <div className="ss-vc-drag" />

                            {/* ── Header ──────────────────────── */}
                            <div className="ss-vc-header">
                                <div className="ss-vc-header-left">
                                    <span className="ss-vc-emoji">{venue.emoji}</span>
                                    <div>
                                        <h3 className="ss-vc-name">{venue.venueName}</h3>
                                        <p className="ss-vc-type">{typeLabel} · {venue.suburb}</p>
                                    </div>
                                </div>
                                <button onClick={onClose} className="ss-vc-close" aria-label="Close">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* ── Scrollable body ─────────────── */}
                            <div className="ss-vc-body">

                                {/* Core Stats Row */}
                                <div className="ss-vc-stats">
                                    <div className="ss-vc-stat">
                                        <Thermometer size={16} className="ss-vc-stat-icon" />
                                        <span className="ss-vc-stat-value">{temperature ?? '--'}°</span>
                                        <span className="ss-vc-stat-label">Now</span>
                                    </div>
                                    <div className="ss-vc-stat">
                                        <Sun size={16} className="ss-vc-stat-icon ss-vc-stat-icon--sun" />
                                        <span className="ss-vc-stat-value">{sunLeft?.text ?? '--'}</span>
                                        <span className="ss-vc-stat-label">Sun left</span>
                                    </div>
                                    <div className="ss-vc-stat">
                                        <Flame size={16} className={`ss-vc-stat-icon ${heatingStatus?.active ? 'ss-vc-stat-icon--fire' : ''}`} />
                                        <span className="ss-vc-stat-value">{heatingStatus?.text ?? 'N/A'}</span>
                                        <span className="ss-vc-stat-label">{heatingStatus?.label ?? 'Heating'}</span>
                                    </div>
                                </div>

                                {/* Optimal Window */}
                                {optimalWindow && (
                                    <div className="ss-vc-optimal">
                                        ☀️ Best time: <strong>{optimalWindow}</strong>
                                    </div>
                                )}

                                {/* Amenities */}
                                {venue.tags && venue.tags.length > 0 && (
                                    <div className="ss-vc-amenities">
                                        {venue.tags.map((tag, i) => (
                                            <span key={i} className="ss-vc-tag">{tag}</span>
                                        ))}
                                    </div>
                                )}

                                {/* Expand toggle */}
                                <button
                                    className="ss-vc-expand-btn"
                                    onClick={() => setExpanded(e => !e)}
                                >
                                    <span>{expanded ? 'Show less' : 'More details'}</span>
                                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>

                                {/* Expanded details */}
                                <AnimatePresence>
                                    {expanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25 }}
                                            className="ss-vc-details"
                                        >
                                            {/* Weather details grid */}
                                            <div className="ss-vc-detail-grid">
                                                <div className="ss-vc-detail-cell">
                                                    <Wind size={14} />
                                                    <span className="ss-vc-detail-val">{windSpeed != null ? `${windSpeed} km/h` : '--'}</span>
                                                    <span className="ss-vc-detail-lbl">Wind</span>
                                                </div>
                                                <div className="ss-vc-detail-cell">
                                                    <Shield size={14} />
                                                    <span className="ss-vc-detail-val">{uvIndex != null ? uvIndex : '--'}</span>
                                                    <span className="ss-vc-detail-lbl">UV Index</span>
                                                </div>
                                                <div className="ss-vc-detail-cell">
                                                    <Droplets size={14} />
                                                    <span className="ss-vc-detail-val">{isRaining ? 'Yes' : 'No'}</span>
                                                    <span className="ss-vc-detail-lbl">Rain</span>
                                                </div>
                                            </div>

                                            {/* Sunstay Score */}
                                            <div className="ss-vc-score-row">
                                                <span className="ss-vc-score-label">Sunstay Score</span>
                                                <span className="ss-vc-score-value">{sunstayScore}</span>
                                            </div>
                                            <div className="ss-vc-score-bar">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${sunstayScore}%` }}
                                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                                    className="ss-vc-score-fill"
                                                />
                                            </div>

                                            {/* Address / Map Centering */}
                                            <div className="ss-vc-address" title="Center map on this venue">
                                                <button
                                                    onClick={() => onCenter(venue)}
                                                    className="ss-vc-address-btn"
                                                >
                                                    <MapPin size={13} />
                                                    <span>{venue.address || 'Address not confirmed'}</span>
                                                </button>
                                            </div>

                                            {/* Price (for ShortStay) */}
                                            {venue.typeCategory === 'ShortStay' && venue.nightlyPriceDemo && (
                                                <div className="ss-vc-price">
                                                    {venue.nightlyPriceDemo} · Max {venue.guests} guests
                                                </div>
                                            )}

                                            {/* Action buttons */}
                                            <div className="ss-vc-actions">
                                                <button className="ss-vc-book-btn">
                                                    <Calendar size={16} />
                                                    <span>Book Now</span>
                                                </button>
                                                <button
                                                    className="ss-vc-share-btn"
                                                    onClick={() => {
                                                        if (navigator.share) {
                                                            navigator.share({
                                                                title: `${venue.venueName} on Sunstay`,
                                                                url: window.location.href,
                                                            });
                                                        } else {
                                                            navigator.clipboard.writeText(window.location.href);
                                                        }
                                                    }}
                                                    aria-label="Share"
                                                >
                                                    <Share2 size={16} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default VenueCard;
