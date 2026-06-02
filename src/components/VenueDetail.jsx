import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import WeatherGuaranteeToggle from './WeatherGuaranteeToggle';
import { getWeatherGuaranteeQuote } from '../utils/weatherGuarantee';
import BookingWindowTimeline from './BookingWindowTimeline';
import OperatorWeatherPanel from './OperatorWeatherPanel';
import HourlyForecastStrip from './HourlyForecastStrip';
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
import { calculateDynamicToday } from '../utils/sunCalcLogic';
import { calculateLiveSunScore } from '../utils/sunScore';
import { getHappyHourStatus } from '../utils/happyHour';

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

const ACCOMMODATION_VIBES = [
    'hotel', 'airbnb', 'apartment', 'loft', 'penthouse',
    'suite', 'villa', 'resort', 'motel', 'hostel', 'bnb',
    'bed and breakfast', 'serviced', 'boutique hotel', 'accommodation',
    'stay', 'lodge', 'inn', 'townhouse', 'studio', 'warehouse loft',
];

function checkIsAccommodation(venue) {
    if (!venue) return false;
    const typeStr = (venue.type || '').toLowerCase();
    const vibeStr = (Array.isArray(venue.vibe) ? venue.vibe.join(' ') : (venue.vibe || '')).toLowerCase();
    if (typeStr.length > 0) return true;
    return ACCOMMODATION_VIBES.some(kw => vibeStr.includes(kw) || typeStr.includes(kw));
}

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
    const [weatherGuarantee, setWeatherGuarantee] = useState(false);
    const tomorrowRain = weather?.tomorrowRain || null;
    const { calculateSunstayScore, getTemperature, weather: liveWeather } = useWeather();
    const { airQuality, loading: airQualityLoading } = useAirQuality(venue?.lat, venue?.lng);

    // FIX: scroll to top whenever a new venue is opened
    const scrollRef = useRef(null);
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [venue?.id]);

    const weatherQuote = getWeatherGuaranteeQuote({
      bookingValue: venue?.bookingPrice || 120,
      rainProbability: weather?.precipProbability ?? 18,
      expectedRainMm: weather?.rainMm ?? 0,
      cloudCover: weather?.cloudCover ?? 40,
      isOutdoor: !!(venue?.outdoorArea || venue?.rooftop || venue?.beerGarden || venue?.balcony || venue?.vibe?.toLowerCase().includes('garden') || venue?.vibe?.toLowerCase().includes('rooftop')),
    });

    if (!venue) return null;

    const isAccommodation = checkIsAccommodation(venue);
    const sunstayScore = calculateSunstayScore(venue);

    const hourlyScores = useMemo(() => {
        const radiation = liveWeather?.hourly?.shortwave_radiation || [];
        const precip    = liveWeather?.hourly?.precipitation_probability || [];
        const cloudArr  = liveWeather?.hourly?.cloud_cover || [];
        const nowHour   = new Date().getHours();
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

    const typeLabel = isAccommodation
        ? venue.type || venue.typeLabel || 'Accommodation'
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
