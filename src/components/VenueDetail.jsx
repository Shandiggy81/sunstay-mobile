import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowLeft,
    CloudRain,
    Flame,
    Leaf,
    MapPin,
    Sun,
    Thermometer,
    Wind,
} from 'lucide-react';
import { useWeather } from '../context/WeatherContext';
import { useAirQuality } from '../hooks/useAirQuality';
import { calculateApparentTemp } from '../data/windIntelligence';
import { calculateDynamicToday } from '../util/sunCalcLogic';
import { calculateLiveSunScore } from '../util/sunScore';

const TRACK_START_HOUR = 6;
const TRACK_END_HOUR = 21;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getHourValue = (date) => date.getHours() + date.getMinutes() / 60;

const parseClockToken = (token) => {
    if (!token) return null;
    const trimmed = token.trim().toLowerCase();
    const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!match) return null;

    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = match[3];

    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour + minute / 60;
};

const parseWindowRange = (windowLabel) => {
    if (!windowLabel || typeof windowLabel !== 'string') {
        return { startHour: 9, endHour: 15 };
    }

    const parts = windowLabel.split(/[\u2013\u2014-]/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return { startHour: 9, endHour: 15 };

    const startHour = parseClockToken(parts[0]);
    const endHour = parseClockToken(parts[1]);

    if (startHour == null || endHour == null) {
        return { startHour: 9, endHour: 15 };
    }

    if (endHour <= startHour) {
        return { startHour, endHour: startHour + 2 };
    }

    return { startHour, endHour };
};

const formatClock = (hourValue) => {
    const clamped = clamp(hourValue, 0, 23.99);
    const hour = Math.floor(clamped);
    const minute = Math.round((clamped - hour) * 60);
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(date);
};

const buildExposureBars = ({ startHour, endHour, sunstayScore, weather }) => {
    const isRaining = String(weather?.weather?.[0]?.main || '').toLowerCase().includes('rain');
    const cloudCover = Number(weather?.clouds?.all ?? 35);
    const cloudFactor = clamp(1 - (cloudCover / 100) * 0.7, 0.2, 1);
    const rainFactor = isRaining ? 0.5 : 1;
    const base = clamp(sunstayScore / 100, 0.25, 1);
    const nowHour = getHourValue(new Date());

    const hours = [7, 9, 11, 13, 15, 17, 19];
    return hours.map((hour) => {
        const insideWindow = hour >= startHour && hour <= endHour;
        const distanceFromWindow = insideWindow
            ? 0
            : Math.min(Math.abs(hour - startHour), Math.abs(hour - endHour));
        const windowFactor = insideWindow ? 1 : clamp(1 - distanceFromWindow * 0.18, 0.3, 0.85);
        const intensity = clamp(Math.round((0.2 + base * 0.7) * cloudFactor * rainFactor * windowFactor * 100), 8, 100);

        return {
            hour,
            intensity,
            isNow: nowHour >= hour && nowHour < hour + 2,
        };
    });
};

const StatChip = ({ icon, label, value, accent = false }) => (
    <div className="min-w-[94px] rounded-xl bg-white/5 backdrop-blur-md border border-white/10 px-3 py-2.5">
        <div className={`flex items-center gap-1 text-[11px] ${accent ? 'text-amber-300' : 'text-white/60'}`}>
            {icon}
            <span>{label}</span>
        </div>
        <div className={`mt-1 text-sm font-bold ${accent ? 'text-amber-200' : 'text-white'}`}>{value}</div>
    </div>
);

const GoldenWindowBar = ({ startHour, endHour, windowLabel }) => {
    const nowHour = getHourValue(new Date());
    const totalWindow = TRACK_END_HOUR - TRACK_START_HOUR;
    const leftPct = clamp(((startHour - TRACK_START_HOUR) / totalWindow) * 100, 0, 100);
    const rightPct = clamp(((endHour - TRACK_START_HOUR) / totalWindow) * 100, 0, 100);
    const widthPct = clamp(rightPct - leftPct, 3, 100);
    const nowPct = clamp(((nowHour - TRACK_START_HOUR) / totalWindow) * 100, 0, 100);

    return (
        <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-4">
            <div className="flex items-center justify-between">
                <p className="text-xs font-semibold tracking-[0.18em] uppercase text-white/60">Golden Window</p>
                <p className="text-xs text-amber-200 font-semibold">{windowLabel}</p>
            </div>

            <div className="relative mt-3">
                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                    <div
                        className="absolute top-0 h-3 rounded-full bg-gradient-to-r from-amber-500/80 via-yellow-300/90 to-orange-500/80"
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    />
                    <motion.div
                        className="absolute top-0 h-3 w-[2px] bg-cyan-200 shadow-[0_0_10px_rgba(125,211,252,0.9)]"
                        style={{ left: `${nowPct}%` }}
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ repeat: Infinity, duration: 1.8 }}
                    />
                </div>
            </div>

            <div className="mt-2 flex justify-between text-[10px] text-white/45 uppercase tracking-[0.15em]">
                <span>6a</span>
                <span>12p</span>
                <span>9p</span>
            </div>
        </div>
    );
};

const LiveExposureBars = ({ bars }) => (
    <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-4">
        <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-white/60">Live Sun Exposure</p>
            <p className="text-xs text-white/55">Mockup</p>
        </div>

        <div className="mt-3 h-28 flex items-end justify-between gap-2">
            {bars.map((bar) => (
                <div key={bar.hour} className="flex-1 flex flex-col items-center gap-2">
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${bar.intensity}%` }}
                        transition={{ duration: 0.45 }}
                        className={`w-full rounded-t-lg ${
                            bar.isNow
                                ? 'bg-gradient-to-t from-amber-500 to-yellow-300 shadow-[0_0_18px_rgba(251,191,36,0.55)]'
                                : 'bg-gradient-to-t from-blue-500/80 to-cyan-300/80'
                        }`}
                    />
                    <span className={`text-[10px] ${bar.isNow ? 'text-amber-200' : 'text-white/55'}`}>
                        {bar.hour % 12 || 12}
                        {bar.hour >= 12 ? 'p' : 'a'}
                    </span>
                </div>
            ))}
        </div>
    </div>
);

const VenueDetail = ({ venue, onClose, weather }) => {
    const { calculateSunstayScore, getTemperature, weather: liveWeather } = useWeather();
    const { airQuality, loading: airQualityLoading } = useAirQuality(venue?.lat, venue?.lng);

    if (!venue) return null;

    const sunstayScore = calculateSunstayScore(venue);

    // Build hourly Sunstay Scores from real Open-Meteo hourly arrays
    const hourlyScores = useMemo(() => {
        const radiation = liveWeather?.hourly?.shortwave_radiation || [];
        const precip    = liveWeather?.hourly?.precipitation_probability || [];
        const cloudArr  = liveWeather?.hourly?.cloud_cover || [];
        const nowHour   = new Date().getHours();
        // Show 8 hours starting from current hour
        return Array.from({ length: 8 }, (_, i) => {
            const hour = (nowHour + i) % 24;
            const score = calculateLiveSunScore({
                shortwaveRadiation: radiation[hour] ?? liveWeather?.shortwaveRadiation ?? 0,
                apparentTemp:       liveWeather?.main?.feels_like ?? liveWeather?.main?.temp ?? 20,
                precipProbability:  precip[hour] ?? liveWeather?.precipProbability ?? 0,
                cloudCover:         cloudArr[hour] ?? liveWeather?.cloudCoverPct ?? liveWeather?.clouds?.all ?? 0,
                windGusts:          liveWeather?.windGusts ?? 0,
                isDay:              (hour >= 6 && hour < 20) ? 1 : 0,
            }).score;
            return {
                hour,
                score,
                isNow: i === 0,
                label: hour === 0 ? '12a'
                     : hour < 12  ? `${hour}a`
                     : hour === 12 ? '12p'
                     : `${hour - 12}p`,
            };
        });
    }, [liveWeather]);
    const temperature = getTemperature();
    const humidity = weather?.main?.humidity;
    const windSpeedKmh = weather?.wind?.speed != null ? Math.round(weather.wind.speed * 3.6) : null;
    const uvIndex = weather?.uvi != null ? Number(weather.uvi).toFixed(1) : '--';
    const rainNowMm = Number(weather?.rain?.['1h'] ?? weather?.rain?.['3h'] ?? 0);
    const isRaining = String(weather?.weather?.[0]?.main || '').toLowerCase().includes('rain');
    const rainLabel = rainNowMm > 0 ? `${rainNowMm.toFixed(1)}mm` : isRaining ? 'Now' : 'None';

    const apparentTemp = weather?.main?.temp != null
        ? Math.round(calculateApparentTemp(weather.main.temp, weather?.wind?.speed || 0, humidity || 50))
        : null;

    const airLabel = airQualityLoading ? '...' : airQuality?.label || '--';
    const airPmValue = airQuality?.pm25 != null ? `${Math.round(airQuality.pm25)}` : '--';
    const airIsPoor = (airQuality?.pm25 ?? 0) > 35;

    const typeLabel = venue.typeCategory === 'Hotel' || venue.typeCategory === 'ShortStay'
        ? venue.typeLabel
        : venue.vibe || 'Venue';

    const dynamicSun = useMemo(() => {
        const room = (venue.roomTypes || []).find((entry) => entry.hasBalcony || entry.hasOutdoorArea);
        if (!room) return null;

        try {
            return calculateDynamicToday(
                venue.lat,
                venue.lng,
                room.orientation,
                (weather?.clouds?.all || 0) / 100,
                room.obstructionLevel,
            );
        } catch {
            return null;
        }
    }, [venue, weather]);

    const optimalWindow = dynamicSun?.optimalWindow || `${formatClock(9)} - ${formatClock(15)}`;
    const { startHour, endHour } = useMemo(() => parseWindowRange(optimalWindow), [optimalWindow]);
    const exposureBars = useMemo(
        () => buildExposureBars({ startHour, endHour, sunstayScore, weather }),
        [startHour, endHour, sunstayScore, weather],
    );

    const hasFireplace = venue.tags?.includes('Fireplace');
    const hasHeaters = venue.tags?.includes('Heaters');
    const ctaHref = venue.bookingUrl || venue.bookingLink || venue.booking || null;
    const ctaLabel = ctaHref ? 'Book Now' : 'Manage This Venue';

    const handlePrimaryCta = () => {
        if (!ctaHref) return;
        window.open(ctaHref, '_blank', 'noopener,noreferrer');
    };

    const statChips = [
        {
            icon: <Thermometer size={12} />,
            label: 'Feels Like',
            value: apparentTemp != null ? `${apparentTemp}\u00B0` : '--',
        },
        {
            icon: <Wind size={12} />,
            label: 'Wind',
            value: windSpeedKmh != null ? `${windSpeedKmh}km/h` : '--',
            accent: windSpeedKmh != null && windSpeedKmh > 30,
        },
        {
            icon: <CloudRain size={12} />,
            label: 'Rain',
            value: rainLabel,
            accent: isRaining || rainNowMm > 0,
        },
        {
            icon: <Sun size={12} />,
            label: 'UV',
            value: uvIndex,
            accent: Number(uvIndex) >= 7,
        },
        {
            icon: <Leaf size={12} />,
            label: 'Air',
            value: airLabel,
            accent: airIsPoor,
        },
    ];

    return (
        <div className="relative min-h-full bg-[#1a1c23] text-white pb-28 overflow-hidden">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />
                <div className="absolute top-1/3 -left-20 h-52 w-52 rounded-full bg-cyan-500/20 blur-3xl" />
                <div className="absolute bottom-0 left-1/3 h-44 w-44 rounded-full bg-fuchsia-500/12 blur-3xl" />
            </div>

            <div className="relative z-10 px-4">
                <div className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-3 bg-[#1a1c23]/95 backdrop-blur-xl border-b border-white/10">
                    <div className="flex items-start gap-3">
                        <button
                            onClick={onClose}
                            className="h-9 w-9 mt-0.5 rounded-full bg-white/10 border border-white/15 text-white/85 flex items-center justify-center hover:bg-white/15 transition-colors"
                            aria-label="Back"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <div className="min-w-0">
                            <h2 className="text-base font-extrabold text-white leading-tight truncate">{venue.venueName}</h2>
                            <p className="text-xs text-white/60 mt-0.5 truncate">{typeLabel} - {venue.suburb}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">Sunstay Score</p>
                            <p className="text-3xl font-black mt-1 bg-gradient-to-r from-amber-300 via-yellow-200 to-orange-400 bg-clip-text text-transparent">
                                {sunstayScore}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">Current Temp</p>
                            <p className="text-2xl font-bold mt-1">{temperature != null ? `${temperature}\u00B0` : '--'}</p>
                        </div>
                    </div>

                    <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${clamp(sunstayScore, 0, 100)}%` }}
                            transition={{ duration: 0.9, ease: 'easeOut' }}
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-300 to-orange-500"
                        />
                    </div>
                </div>

                <div className="mt-3 overflow-x-auto scrollbar-hide">
                    <div className="flex gap-2 pb-1">
                        {statChips.map((chip) => (
                            <StatChip
                                key={chip.label}
                                icon={chip.icon}
                                label={chip.label}
                                value={chip.value}
                                accent={chip.accent}
                            />
                        ))}
                    </div>
                </div>

                <div className="mt-4">
                    <GoldenWindowBar
                        startHour={startHour}
                        endHour={endHour}
                        windowLabel={optimalWindow}
                    />
                </div>

                <div className="mt-3">
                    <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-white/60">Best Time to Visit</p>
                            <p className="text-xs text-amber-200 font-semibold">
                                Next 8 hrs · Live ☀️
                            </p>
                        </div>
                        <div className="h-28 flex items-end justify-between gap-1.5">
                            {hourlyScores.map((h) => (
                                <div key={h.hour} className="flex-1 flex flex-col items-center gap-1.5">
                                    <span className={`text-[9px] font-bold tabular-nums ${h.isNow ? 'text-amber-300' : 'text-white/40'}`}>
                                        {h.score}
                                    </span>
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${Math.max(h.score, 4)}%` }}
                                        transition={{ duration: 0.5, delay: h.isNow ? 0 : 0.05 }}
                                        className={`w-full rounded-t-md ${
                                            h.isNow
                                                ? 'bg-gradient-to-t from-amber-500 to-yellow-300 shadow-[0_0_14px_rgba(251,191,36,0.5)]'
                                                : h.score >= 65
                                                    ? 'bg-gradient-to-t from-emerald-500/80 to-emerald-300/80'
                                                    : h.score >= 45
                                                        ? 'bg-gradient-to-t from-slate-500/70 to-slate-300/60'
                                                        : 'bg-gradient-to-t from-blue-600/60 to-indigo-400/50'
                                        }`}
                                    />
                                    <span className={`text-[9px] ${h.isNow ? 'text-amber-300 font-bold' : 'text-white/45'}`}>
                                        {h.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-3 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-4">
                    <div className="flex items-center gap-2 text-white/80">
                        <MapPin size={14} className="text-white/55" />
                        <p className="text-xs truncate">{venue.address || 'Address unavailable'}</p>
                    </div>

                    {(hasFireplace || hasHeaters) && (
                        <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-300/30 text-amber-200">
                            <Flame size={12} />
                            <span>{hasFireplace ? 'Fireplace' : 'Heaters'} Available</span>
                        </div>
                    )}

                    {venue.tags?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {venue.tags.slice(0, 8).map((tag) => (
                                <span
                                    key={tag}
                                    className="px-2 py-1 rounded-full text-[10px] bg-white/7 border border-white/10 text-white/70"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {(venue.notes || airQuality?.source) && (
                        <div className="mt-3 text-[11px] text-white/55 leading-relaxed">
                            {venue.notes && <p>{venue.notes}</p>}
                            {airQuality?.source && (
                                <p className="mt-1">
                                    Air source: {airQuality.source === 'openaq' ? 'OpenAQ' : 'Open-Meteo'} (PM2.5 {airPmValue})
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="sticky bottom-0 z-20 px-4 pt-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] bg-gradient-to-t from-[#1a1c23] via-[#1a1c23]/96 to-[#1a1c23]/0">
                <button
                    onClick={handlePrimaryCta}
                    className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold py-3.5 shadow-[0_8px_30px_rgba(245,158,11,0.35)] hover:shadow-[0_10px_35px_rgba(245,158,11,0.45)] transition-shadow"
                >
                    {ctaLabel}
                </button>
            </div>
        </div>
    );
};

export default VenueDetail;

