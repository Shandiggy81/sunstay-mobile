import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Wind, Info, Calendar, TrendingUp, TrendingDown, Minus, ChevronDown,
} from 'lucide-react';
import { useWeather } from '../context/WeatherContext';
import { finiteOrNull } from '../utils/finiteOrNull';
import { presentWind } from '../utils/presentWind';
import { cardinal } from '../utils/compass';
import CompassDial from './common/CompassDial';
import {
    getWindProfile,
    getWindWarning,
    calculateApparentTemp,
    getComfortZone,
    generateHourlyForecast,
    getWindTrend,
    getOptimalBookingTime,
    getWindImpactExplanation,
} from '../data/windIntelligence';

const CARD =
    'rounded-3xl border border-slate-900/[0.06] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.18)]';
const MICRO = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500';

// One palette for every wind level so the pill, bars and dial agree.
const LEVEL = {
    green: { dot: 'bg-emerald-500', bar: '#34d399', pill: 'bg-emerald-50 text-emerald-800 ring-emerald-500/20', short: 'Calm' },
    yellow: { dot: 'bg-amber-500', bar: '#fbbf24', pill: 'bg-amber-50 text-amber-800 ring-amber-500/20', short: 'Breezy' },
    orange: { dot: 'bg-orange-500', bar: '#fb923c', pill: 'bg-orange-50 text-orange-800 ring-orange-500/20', short: 'Windy' },
    red: { dot: 'bg-red-500', bar: '#f87171', pill: 'bg-red-50 text-red-800 ring-red-500/20', short: 'Strong wind' },
};
const UNKNOWN_LEVEL = { dot: 'bg-slate-400', bar: '#cbd5e1', pill: 'bg-slate-100 text-slate-700 ring-slate-900/[0.06]', short: 'Unknown' };
const levelOf = (l) => LEVEL[l] ?? UNKNOWN_LEVEL;

const stripEmoji = (s) => (typeof s === 'string' ? s.replace(/\p{Extended_Pictographic}️?/gu, '').trim() : s);

// ── Unavailable State ─────────────────────────────────────────────

const WindComfortUnavailable = () => (
    <section className={`${CARD} flex flex-col gap-2 p-4`} aria-label="Wind and comfort">
        <h3 className="text-[17px] font-bold tracking-[-0.01em] text-slate-900">Wind &amp; comfort</h3>
        <p className="flex items-start gap-2 text-[13px] font-medium text-slate-500">
            <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
            Forecast data unavailable for this venue right now.
        </p>
    </section>
);

// ── Comfort scale ────────────────────────────────────────────────
// -5 to 45°C. A non-finite reading parks the marker mid-scale rather than
// emitting `left: NaN%`.

const ComfortScale = ({ feels }) => {
    const position = feels === null ? 50 : Math.max(0, Math.min(100, ((feels + 5) / 50) * 100));
    return (
        <div>
            <div
                className="relative h-1.5 rounded-full"
                style={{ background: 'linear-gradient(90deg,#60a5fa 0%,#93c5fd 28%,#4ade80 44%,#4ade80 56%,#fbbf24 68%,#fb923c 80%,#f87171 100%)' }}
            >
                <motion.span
                    className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-slate-900 shadow-[0_1px_4px_rgba(15,23,42,0.35)]"
                    initial={{ left: '50%' }}
                    animate={{ left: `${position}%` }}
                    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] font-medium text-slate-400">
                <span>Cold</span><span>Comfortable</span><span>Hot</span>
            </div>
        </div>
    );
};

// ── Hourly wind chart ────────────────────────────────────────────

const HourlyWindChart = ({ forecast, selected, onSelect }) => {
    const [expanded, setExpanded] = useState(false);
    const rows = Array.isArray(forecast) ? forecast : [];
    const visible = expanded ? rows.slice(0, 24) : rows.slice(0, 12);
    if (!visible.length) {
        return <p className="text-[13px] font-medium text-slate-400">Hourly forecast data unavailable</p>;
    }
    const maxWind = Math.max(20, ...visible.map((h) => (Number.isFinite(h?.wind) ? h.wind : 0)));

    return (
        <div>
            <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide">
                <div className="flex min-w-full items-end gap-1" role="list">
                    {visible.map((h, i) => {
                        const wind = Number.isFinite(h?.wind) ? h.wind : null;
                        const height = wind === null ? 4 : Math.max(6, (wind / maxWind) * 64);
                        const isSel = selected === i;
                        return (
                            <button
                                key={i}
                                type="button"
                                role="listitem"
                                onClick={() => onSelect(isSel ? null : i)}
                                aria-pressed={isSel}
                                aria-label={`${h?.label ?? ''}: feels like ${h?.feelsLike ?? '–'} degrees, wind ${wind ?? '–'} km/h`}
                                className={`flex min-w-[40px] flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl px-0.5 pb-1.5 pt-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${isSel ? 'bg-slate-900/[0.05]' : 'active:bg-slate-900/[0.03]'}`}
                            >
                                <span className="text-[13px] font-semibold tabular-nums text-slate-900">
                                    {Number.isFinite(h?.feelsLike) ? `${h.feelsLike}°` : '–'}
                                </span>
                                <span className="flex h-16 w-full items-end justify-center">
                                    <motion.span
                                        className="block w-3.5 rounded-full"
                                        style={{ background: levelOf(h?.windWarning?.level).bar }}
                                        initial={{ height: 4 }}
                                        animate={{ height }}
                                        transition={{ delay: i * 0.015, type: 'spring', damping: 22, stiffness: 220 }}
                                    />
                                </span>
                                <span className="text-[11px] font-semibold tabular-nums text-slate-600">{wind ?? '–'}</span>
                                <span className={`text-[11px] font-medium ${h?.isCurrent ? 'font-bold text-slate-900' : 'text-slate-400'}`}>
                                    {h?.label ?? '–'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
            {rows.length > 12 && (
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="mt-1 flex min-h-11 w-full cursor-pointer items-center justify-center gap-1 rounded-xl text-[13px] font-semibold text-slate-500 transition-colors active:bg-slate-900/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                    {expanded ? 'Show 12 hours' : 'Show 24 hours'}
                    <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
            )}
        </div>
    );
};

// ── Main WindComfortPanel Component ───────────────────────────────

const WindComfortPanel = ({ venue }) => {
    const { weather } = useWeather();
    const [selected, setSelected] = useState(null);

    const windData = useMemo(() => {
        if (!weather || !venue) return null;

        // The weather payload is assembled from several upstream providers, so
        // treat every reading as optional and reject anything non-finite before
        // it can reach the UI as "NaN°C".
        const temp = finiteOrNull(weather.main?.temp);
        const windSpeed = finiteOrNull(weather.wind?.speed) ?? 0;
        const humidity = finiteOrNull(weather.main?.humidity);
        if (temp === null) return null;

        const windProfile = getWindProfile(venue);
        const windWarning = getWindWarning(windSpeed, venue);
        const apparentTemp = calculateApparentTemp(temp, windSpeed, humidity, windProfile.shelterFactor);
        const hourlyForecast = generateHourlyForecast(temp, windSpeed, humidity, venue);
        const open = presentWind(weather);

        return {
            temp: Math.round(temp),
            windProfile,
            windWarning,
            openAirKmh: open.speedKmh,
            gustKmh: open.gustKmh,
            fromDeg: finiteOrNull(weather.wind?.deg),
            apparentTemp: apparentTemp === null ? null : Math.round(apparentTemp),
            comfort: getComfortZone(apparentTemp),
            hourlyForecast: Array.isArray(hourlyForecast) ? hourlyForecast : [],
            windTrend: getWindTrend(hourlyForecast),
            optimalBooking: getOptimalBookingTime(hourlyForecast),
            windImpact: getWindImpactExplanation(temp, windSpeed, apparentTemp, venue),
        };
    }, [weather, venue]);

    if (!windData) return <WindComfortUnavailable />;

    const level = levelOf(windData.windWarning?.level);
    const venueKmh = windData.windWarning?.effectiveWind;
    const from = cardinal(windData.fromDeg);
    const TrendIcon = windData.windTrend?.direction === 'building'
        ? TrendingUp
        : windData.windTrend?.direction === 'calming' ? TrendingDown : Minus;
    const windSub = [
        Number.isFinite(windData.openAirKmh) && `Open air ${windData.openAirKmh}`,
        windData.gustKmh && `gusts ${windData.gustKmh}`,
    ].filter(Boolean).join(' · ');
    const sel = selected !== null ? windData.hourlyForecast[selected] : null;

    const notes = [
        windData.windProfile?.venueNote && { icon: Info, text: windData.windProfile.venueNote },
        windData.windImpact && { icon: Wind, text: windData.windImpact },
        windData.windTrend?.label && { icon: TrendIcon, text: stripEmoji(windData.windTrend.label) },
    ].filter(Boolean);

    return (
        <section className={`${CARD} flex flex-col gap-5 p-4`} aria-label="Wind and comfort">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-[17px] font-bold tracking-[-0.01em] text-slate-900">Wind &amp; comfort</h3>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${level.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${level.dot}`} />
                    {level.short}
                </span>
            </div>

            {/* Hero: wind + feels like */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <CompassDial
                        bearing={windData.fromDeg}
                        variant="wind"
                        size={56}
                        muted={windData.windWarning?.level === 'green'}
                        label={from ? `Wind from the ${from.long}` : 'Wind direction unavailable'}
                    />
                    <div className="min-w-0">
                        <p className={MICRO}>Wind here</p>
                        <p className="mt-0.5 whitespace-nowrap text-slate-900">
                            <span className="text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums">
                                {Number.isFinite(venueKmh) ? venueKmh : '–'}
                            </span>
                            <span className="ml-1 text-[13px] font-semibold text-slate-500">km/h</span>
                        </p>
                        <p className="mt-1 text-[12px] font-medium leading-tight text-slate-500">
                            {from ? `From ${from.short}` : 'Sheltered estimate'}
                            {windSub ? <span className="block">{windSub}</span> : null}
                        </p>
                    </div>
                </div>
                <div className="w-px bg-slate-900/[0.06]" aria-hidden="true" />
                <div className="min-w-0">
                    <p className={MICRO}>Feels like</p>
                    <p className={`mt-0.5 text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums ${windData.comfort?.color ?? 'text-slate-900'}`}>
                        {windData.apparentTemp === null ? '–' : `${windData.apparentTemp}°`}
                    </p>
                    <p className="mt-1 text-[12px] font-medium text-slate-500">Air temp {windData.temp}°</p>
                </div>
            </div>

            {/* Comfort scale + advice */}
            <div className="flex flex-col gap-3">
                <ComfortScale feels={windData.apparentTemp} />
                <div className="flex items-start gap-2.5">
                    <span className="text-[20px] leading-none" aria-hidden="true">{windData.comfort?.icon}</span>
                    <p className="text-[14px] leading-snug text-slate-600">
                        <span className="font-semibold text-slate-900">{windData.comfort?.label ?? 'Comfort unavailable'}.</span>{' '}
                        {windData.comfort?.advice}
                    </p>
                </div>
            </div>

            {/* Notes */}
            {notes.length > 0 && (
                <ul className="flex flex-col divide-y divide-slate-900/[0.06] rounded-2xl bg-slate-50 px-3.5">
                    {notes.map(({ icon: Icon, text }, i) => (
                        <li key={i} className="flex items-start gap-2.5 py-2.5 text-[13px] leading-snug text-slate-600">
                            <Icon size={15} className="mt-[1px] shrink-0 text-slate-400" />
                            <span>{text}</span>
                        </li>
                    ))}
                </ul>
            )}

            {/* Hourly */}
            <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                    <p className={MICRO}>Hourly · open air</p>
                    <span className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                        {['green', 'yellow', 'red'].map((l) => (
                            <span key={l} className="inline-flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full" style={{ background: LEVEL[l].bar }} />
                                {l === 'red' ? 'Windy' : LEVEL[l].short}
                            </span>
                        ))}
                    </span>
                </div>
                <HourlyWindChart forecast={windData.hourlyForecast} selected={selected} onSelect={setSelected} />
                <AnimatePresence initial={false}>
                    {sel && (
                        <motion.p
                            key={selected}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="rounded-2xl bg-slate-50 px-3.5 py-2.5 text-[13px] leading-snug text-slate-600"
                        >
                            <span className="font-semibold text-slate-900">
                                {sel.label === 'Now' ? 'Right now' : `At ${sel.label}`}
                            </span>
                            {' · '}{Number.isFinite(sel.temp) ? `${sel.temp}°` : '–'} air, feels {Number.isFinite(sel.feelsLike) ? `${sel.feelsLike}°` : '–'}
                            {' · '}{Number.isFinite(sel.wind) ? `${sel.wind} km/h` : '–'}
                            {sel.comfort?.advice ? <span className="mt-0.5 block">{sel.comfort.advice}</span> : null}
                        </motion.p>
                    )}
                </AnimatePresence>
            </div>

            {/* Best time */}
            {windData.optimalBooking && (
                <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-3.5 py-3 ring-1 ring-emerald-500/15">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600">
                        <Calendar size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-emerald-700">Best time to be outside</p>
                        <p className="text-[13px] leading-snug text-emerald-900/70">
                            {windData.optimalBooking.reason ?? 'Best conditions in the forecast window'}
                        </p>
                    </div>
                    <p className="shrink-0 text-[17px] font-bold tabular-nums tracking-[-0.01em] text-emerald-900">
                        {windData.optimalBooking.startLabel ?? '–'}–{windData.optimalBooking.endLabel ?? '–'}
                    </p>
                </div>
            )}
        </section>
    );
};

export default WindComfortPanel;
