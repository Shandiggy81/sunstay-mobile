import React, { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ListFilter } from 'lucide-react';
import headerLogo from '../assets/logo-header.png';
import { presentWind } from '../utils/presentWind';
import { resolveFiltersControls } from '../utils/filtersControls';
import { headerWeatherSummary } from '../utils/headerWeatherSummary';

const LOGO_W = 251;
const LOGO_H = 192;

/**
 * Compact weather header: one line ("22° · Sunny · Melbourne") with the
 * details (wind, rain, cloud, comfort) one tap away, like Google Maps'
 * "Weather in the area" card. Keeps the map as tall as possible on phones.
 */
const TopBar = ({ weather, onFiltersOpen, comfort }) => {
    const [open, setOpen] = useState(false);
    const detailsId = useId();
    const windView = presentWind(weather);
    const filtersUi = resolveFiltersControls();
    const summary = headerWeatherSummary(weather, { windView, comfort });

    return (
        <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', damping: 24, stiffness: 240 }}
            className="z-40 flex-shrink-0 pt-[env(safe-area-inset-top,0px)]"
        >
            <div className="border-b border-slate-900/[0.07] bg-white/90">
                <div className="flex items-center gap-3 px-4 py-2.5">
                    <img
                        src={headerLogo}
                        alt="Sunstay"
                        width={LOGO_W}
                        height={LOGO_H}
                        draggable={false}
                        decoding="async"
                        className="h-10 w-auto flex-shrink-0 select-none rounded-xl shadow-sm"
                    />

                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        disabled={!summary.details.length}
                        aria-expanded={open}
                        aria-controls={detailsId}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 text-left transition-colors touch-manipulation active:bg-slate-900/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                    >
                        <span className="text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums text-slate-900">
                            {summary.temperature}
                        </span>
                        <span className="flex min-w-0 flex-col leading-tight">
                            <span className="truncate text-[14px] font-semibold text-slate-800">
                                {summary.condition}
                            </span>
                            <span className="truncate text-[12px] font-medium text-slate-500">
                                Melbourne{summary.comfort ? ` · ${summary.comfort}` : ''}
                            </span>
                        </span>
                        {summary.details.length ? <ChevronDown
                            size={16}
                            strokeWidth={2.25}
                            aria-hidden="true"
                            className={`ml-auto flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                        /> : null}
                    </button>

                    {typeof onFiltersOpen === 'function' && filtersUi.headerVisible && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onFiltersOpen(e);
                            }}
                            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-semibold text-slate-800 shadow-[0_1px_3px_rgba(15,23,42,0.12)] ring-1 ring-inset ring-slate-900/[0.08] transition-colors touch-manipulation active:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                            aria-label={filtersUi.headerAccessibleName}
                            title={filtersUi.headerLabel}
                        >
                            <ListFilter size={16} strokeWidth={2.25} aria-hidden="true" />
                            <span>{filtersUi.headerLabel}</span>
                        </button>
                    )}
                </div>

                {open && summary.details.length ? (
                    <dl
                        id={detailsId}
                        className="grid grid-cols-3 gap-2 px-4 pb-3 text-[13px]"
                    >
                        {summary.details.map((item) => (
                            <div key={item.label} className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-900/[0.05]">
                                <dt className="text-[11px] font-medium text-slate-500">{item.label}</dt>
                                <dd className="mt-0.5 font-semibold tabular-nums text-slate-800">{item.value}</dd>
                                {item.note ? <dd className="text-[11px] text-slate-500">{item.note}</dd> : null}
                            </div>
                        ))}
                    </dl>
                ) : null}
            </div>
        </motion.div>
    );
};

export default TopBar;
