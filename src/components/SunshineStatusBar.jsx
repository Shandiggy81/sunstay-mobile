/**
 * SunshineStatusBar.jsx
 *
 * Drop-in component for VenueCard and VenueDetail.
 * Shows:
 *   ☀️  Sunshine remaining this window  (e.g. "~2h 20m of sun left")
 *   🌡️  Comfort score  (Feels Like + emoji + label)
 *   ⏱️  Next sunshine window  (if currently not sunny)
 *
 * Usage:
 *   import SunshineStatusBar from './SunshineStatusBar';
 *   <SunshineStatusBar weather={weather} venue={venue} compact />
 *
 *   compact={true}  → single-line chip row for venue cards
 *   compact={false} → full expanded card for venue detail
 */

import React, { useMemo } from 'react';
import { Sun, Thermometer, Clock, CloudOff } from 'lucide-react';
import {
    getWindProfile,
    calculateApparentTemp,
    getComfortZone,
    generateHourlyForecast,
    getOptimalBookingTime,
} from '../data/windIntelligence';

// ── helpers ───────────────────────────────────────────────────────

const fmtDuration = (minutes) => {
    if (minutes <= 0) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
};

const fmtHour = (h) => {
    if (h === 0 || h === 24) return '12am';
    if (h === 12) return '12pm';
    return h > 12 ? `${h - 12}pm` : `${h}am`;
};

/**
 * Given the hourly forecast, calculate how many consecutive sunny hours
 * remain starting from now (index 0 = current hour).
 * A hour is "sunny" if feelsLike comfort is warm/mild and no rain.
 */
const getSunshineWindow = (forecast) => {
    if (!forecast || forecast.length === 0) return { remainingMins: 0, nextSunnyHour: null };

    const now = new Date();
    const minsRemainingThisHour = 60 - now.getMinutes();

    // Count how many consecutive hours from index 0 are comfortable + not rainy
    let sunnyConsecutive = 0;
    for (let i = 0; i < forecast.length; i++) {
        const h = forecast[i];
        const isSunny = (
            !h.condition?.toLowerCase().includes('rain') &&
            !h.condition?.toLowerCase().includes('storm') &&
            (h.comfort?.level === 'warm' || h.comfort?.level === 'mild' || h.comfort?.level === 'hot')
        );
        if (isSunny) sunnyConsecutive++;
        else break;
    }

    // total minutes: partial first hour + full remaining hours
    const remainingMins = sunnyConsecutive === 0
        ? 0
        : minsRemainingThisHour + Math.max(0, sunnyConsecutive - 1) * 60;

    // If not currently sunny, find the next sunny hour
    let nextSunnyHour = null;
    if (sunnyConsecutive === 0) {
        for (let i = 1; i < forecast.length; i++) {
            const h = forecast[i];
            const isSunny = (
                !h.condition?.toLowerCase().includes('rain') &&
                !h.condition?.toLowerCase().includes('storm') &&
                (h.comfort?.level === 'warm' || h.comfort?.level === 'mild' || h.comfort?.level === 'hot')
            );
            if (isSunny) {
                nextSunnyHour = forecast[i].hour ?? (new Date().getHours() + i);
                break;
            }
        }
    }

    return { remainingMins, nextSunnyHour, sunnyConsecutive };
};

// ── component ─────────────────────────────────────────────────────

const SunshineStatusBar = ({ weather, venue, compact = false }) => {
    const data = useMemo(() => {
        if (!weather || !venue) return null;

        const profile = getWindProfile(venue);
        const temp = weather.main?.temp ?? 20;
        const wind = weather.wind?.speed ?? 0;
        const humidity = weather.main?.humidity ?? 50;
        const feelsLike = Math.round(
            calculateApparentTemp(temp, wind, humidity, profile.shelterFactor)
        );
        const comfort = getComfortZone(feelsLike);
        const forecast = generateHourlyForecast(temp, wind, humidity, venue);
        const { remainingMins, nextSunnyHour, sunnyConsecutive } = getSunshineWindow(forecast);
        const optimalWindow = getOptimalBookingTime(forecast);
        const condition = (weather.weather?.[0]?.main ?? '').toLowerCase();
        const isRaining = condition.includes('rain') || condition.includes('storm') || condition.includes('drizzle');
        const isSunny = !isRaining && (sunnyConsecutive > 0);

        return { feelsLike, comfort, remainingMins, nextSunnyHour, isSunny, optimalWindow, forecast };
    }, [weather, venue]);

    if (!data) return null;

    const { feelsLike, comfort, remainingMins, nextSunnyHour, isSunny, optimalWindow } = data;
    const durationStr = fmtDuration(remainingMins);

    // ── compact chip row (for VenueCard) ──────────────────────────
    if (compact) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                marginTop: 6,
            }}>
                {/* Comfort chip */}
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', borderRadius: 20,
                    fontSize: 11, fontWeight: 700,
                    background: comfort.level === 'warm' || comfort.level === 'mild'
                        ? 'linear-gradient(135deg, #fffbeb, #fef3c7)'
                        : comfort.level === 'hot' || comfort.level === 'extreme'
                            ? 'linear-gradient(135deg, #fff7ed, #ffedd5)'
                            : 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                    color: comfort.level === 'warm' || comfort.level === 'mild'
                        ? '#92400e'
                        : comfort.level === 'hot' || comfort.level === 'extreme'
                            ? '#9a3412'
                            : '#1e40af',
                    border: '1px solid',
                    borderColor: comfort.level === 'warm' || comfort.level === 'mild'
                        ? '#fde68a'
                        : comfort.level === 'hot' || comfort.level === 'extreme'
                            ? '#fed7aa'
                            : '#bfdbfe',
                }}>
                    <Thermometer size={10} />
                    {feelsLike}° {comfort.icon} {comfort.label}
                </span>

                {/* Sunshine duration chip */}
                {isSunny && durationStr ? (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 20,
                        fontSize: 11, fontWeight: 700,
                        background: 'linear-gradient(135deg, #fef9c3, #fef08a)',
                        color: '#713f12',
                        border: '1px solid #fde047',
                    }}>
                        <Sun size={10} />
                        ☀️ {durationStr} sun left
                    </span>
                ) : nextSunnyHour !== null ? (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 20,
                        fontSize: 11, fontWeight: 700,
                        background: '#f3f4f6',
                        color: '#6b7280',
                        border: '1px solid #e5e7eb',
                    }}>
                        <Clock size={10} />
                        Sun from {fmtHour(nextSunnyHour)}
                    </span>
                ) : (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 20,
                        fontSize: 11, fontWeight: 700,
                        background: '#f0f9ff',
                        color: '#0369a1',
                        border: '1px solid #bae6fd',
                    }}>
                        <CloudOff size={10} />
                        No sun today
                    </span>
                )}
            </div>
        );
    }

    // ── expanded card (for VenueDetail) ──────────────────────────
    return (
        <div style={{
            background: isSunny
                ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%)'
                : 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
            border: `1px solid ${isSunny ? '#fbbf24' : '#7dd3fc'}`,
            borderRadius: 16,
            padding: '14px 16px',
            marginBottom: 12,
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sun size={15} color={isSunny ? '#d97706' : '#0ea5e9'} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: isSunny ? '#92400e' : '#0c4a6e' }}>
                        {isSunny ? 'Live Sunshine' : 'Sunshine Forecast'}
                    </span>
                </div>
                {isSunny && (
                    <span style={{
                        fontSize: 9, fontWeight: 900, letterSpacing: '0.08em',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: 'white', padding: '2px 8px', borderRadius: 8,
                        boxShadow: '0 2px 6px rgba(245,158,11,0.35)',
                    }}>☀️ LIVE NOW</span>
                )}
            </div>

            {/* Main stats row */}
            <div style={{ display: 'flex', gap: 10, marginBottom: isSunny ? 10 : 0 }}>
                {/* Comfort */}
                <div style={{
                    flex: 1, background: 'rgba(255,255,255,0.7)',
                    borderRadius: 12, padding: '10px 12px',
                    border: '1px solid rgba(255,255,255,0.9)',
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feels Like</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#1f2937', lineHeight: 1 }}>{feelsLike}°</div>
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3 }}>
                        <span style={{ fontSize: 14 }}>{comfort.icon}</span>
                        {' '}
                        <span style={{ color: '#6b7280' }}>{comfort.label}</span>
                    </div>
                </div>

                {/* Sunshine duration or next window */}
                <div style={{
                    flex: 1.4, background: 'rgba(255,255,255,0.7)',
                    borderRadius: 12, padding: '10px 12px',
                    border: '1px solid rgba(255,255,255,0.9)',
                }}>
                    {isSunny && durationStr ? (
                        <>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sun Remaining</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#d97706', lineHeight: 1 }}>~{durationStr}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, fontWeight: 600 }}>of comfortable sunshine</div>
                        </>
                    ) : nextSunnyHour !== null ? (
                        <>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next Sun Window</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#0ea5e9', lineHeight: 1 }}>{fmtHour(nextSunnyHour)}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, fontWeight: 600 }}>expected sunshine</div>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#6b7280', lineHeight: 1.2 }}>No sunny windows</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, fontWeight: 600 }}>Check tomorrow's forecast</div>
                        </>
                    )}
                </div>
            </div>

            {/* Optimal booking nudge */}
            {optimalWindow && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    background: 'rgba(255,255,255,0.65)',
                    borderRadius: 10, padding: '7px 10px',
                    border: '1px solid rgba(251,191,36,0.4)',
                    marginTop: 2,
                }}>
                    <Clock size={12} color="#d97706" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                        Best time to visit: {optimalWindow.startLabel}–{optimalWindow.endLabel}
                    </span>
                    <span style={{ fontSize: 10, color: '#a16207', marginLeft: 2 }}>· {optimalWindow.reason}</span>
                </div>
            )}
        </div>
    );
};

export default SunshineStatusBar;
