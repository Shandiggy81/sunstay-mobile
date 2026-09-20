import React from 'react';
import { motion } from 'framer-motion';
import { ListFilter } from 'lucide-react';
import headerLogo from '../assets/logo-header.png';

const LOGO_W = 251;
const LOGO_H = 192;

const STAT_PLACEHOLDER = '\u2013';

const TopBar = ({ searchQuery, onSearchChange, onRecenter, weather, onFiltersOpen, comfort }) => {
    const temp = weather ? Math.round(weather.main?.temp || 0) : null;
    const condition = (weather?.weather?.[0]?.main || '').toLowerCase();
    const description = weather?.weather?.[0]?.description || '';
    const windSpeed = Math.round((weather?.wind?.speed || 0) * 3.6);
    const humidity = weather?.main?.humidity || 0;
    const cloudiness = weather?.clouds?.all ?? null;

    const cloudLabel = cloudiness === null ? null
        : cloudiness < 25 ? 'Low'
        : cloudiness < 60 ? 'Mid'
        : 'High';

    // Use real precipProbability if available, otherwise fallback estimate
    const rainChance = weather?.precipProbability
        ?? Math.min(100, Math.round(humidity * 0.3 + (condition.includes('rain') ? 40 : 0)));

    const descFormatted = description
        ? description.charAt(0).toUpperCase() + description.slice(1)
        : 'Loading\u2026';

    return (
        <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', damping: 24, stiffness: 240 }}
            className="z-40 flex-shrink-0 pt-[env(safe-area-inset-top,0px)]"
        >
            {/* iOS-style translucent navigation material: blur + saturation lift
                over a hairline separator, so map content reads through the bar. */}
            <div className="relative flex min-h-[132px] items-center gap-3 border-b border-slate-900/[0.07] bg-white/72 px-4 py-3.5 backdrop-blur-xl backdrop-saturate-150">
                {/* Brand badge — height-driven so the blue field reads as a
                    rounded chip against the cream bar without stretching it. */}
                <div className="relative z-10 flex flex-shrink-0 items-center self-center">
                    <img
                        src={headerLogo}
                        alt="Sunstay"
                        width={LOGO_W}
                        height={LOGO_H}
                        draggable={false}
                        decoding="async"
                        className="h-12 w-auto select-none rounded-2xl shadow-sm"
                    />
                </div>

                {/* Centre weather display */}
                <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Melbourne</span>
                    <span className="min-h-[34px] text-[32px] font-bold leading-none tracking-[-0.03em] tabular-nums text-slate-900">
                        {weather ? `${temp}°C` : '\u00a0'}
                    </span>
                    <div className="flex min-h-[42px] flex-col items-center gap-1.5">
                        <span className="max-w-[160px] truncate text-[13px] font-medium text-slate-600">
                            {weather ? descFormatted : 'Loading\u2026'}
                        </span>
                        {comfort && comfort.label !== 'Loading' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-900/[0.08]">
                                <span aria-hidden="true">{comfort.icon}</span>
                                {comfort.label}
                            </span>
                        )}
                    </div>
                </div>

                {/* Right side stats with divider — always rendered (with dashes
                    before weather resolves) so the bar never reflows on load. */}
                <div className="relative z-10 h-[52px] w-px flex-shrink-0 self-center bg-slate-900/10" aria-hidden="true" />
                <div className="relative z-10 flex w-[78px] flex-shrink-0 flex-col items-start gap-2">
                    <span className="whitespace-nowrap text-[13px] font-medium leading-none tabular-nums text-slate-700">
                        <span aria-hidden="true">💨</span> {weather ? `${windSpeed} km/h` : STAT_PLACEHOLDER}
                    </span>
                    <span className="whitespace-nowrap text-[13px] font-medium leading-none tabular-nums text-slate-700">
                        <span aria-hidden="true">🌧</span> {weather ? `${Math.round(rainChance)}%` : STAT_PLACEHOLDER}
                    </span>
                    <span className="whitespace-nowrap text-[13px] font-medium leading-none text-slate-700">
                        <span aria-hidden="true">☁️</span> {cloudLabel ?? STAT_PLACEHOLDER}
                    </span>
                </div>

                {typeof onFiltersOpen === 'function' && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onFiltersOpen(e);
                        }}
                        className="relative z-10 flex h-11 w-11 min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/80 text-slate-800 shadow-[0_1px_3px_rgba(15,23,42,0.12)] ring-1 ring-inset ring-slate-900/[0.08] backdrop-blur-xl transition-colors touch-manipulation active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                        aria-label="Open filters"
                        title="Open filters"
                    >
                        <ListFilter size={18} strokeWidth={2.25} aria-hidden="true" />
                    </button>
                )}
            </div>

        </motion.div>
    );
};

export default TopBar;
