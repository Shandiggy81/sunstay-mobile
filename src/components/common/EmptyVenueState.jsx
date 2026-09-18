import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RotateCcw, SearchX } from 'lucide-react';

const MASCOT_SRC = '/assets/mascots/empty-state.png';

// Sally and Rayray are cropped at the shoulders, so the artwork is painted
// *behind* the card: their heads clear the top edge while the crop line stays
// hidden underneath it. The image is 663×289, so `w-64` renders 112px tall and
// `-top-24` (96px) leaves 16px tucked behind the card. Do not size it below
// `w-64` or the crop line rises above the edge.
const MASCOT_OVERHANG = '7rem';

/**
 * Zero-results state for the venue list.
 *
 * Rendered anywhere the filtered venue array comes back empty — the desktop
 * sidebar, the mobile bottom sheet and the map overlay — so it has to centre
 * itself inside a flex column as happily as inside an already-centred row, and
 * keep the action clear of the home indicator when it lands at the bottom of
 * the sheet.
 *
 * `announce` is opt-in because the list and the map overlay go empty together:
 * only one of the two should speak.
 */
const EmptyVenueState = ({ onClearFilters, announce = false, className = '' }) => {
    const [mascotUnavailable, setMascotUnavailable] = useState(false);
    const prefersReducedMotion = useReducedMotion();

    const handleClear = () => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
        onClearFilters?.();
    };

    return (
        <div
            className={`flex min-h-0 w-full flex-1 justify-center overflow-y-auto overscroll-contain ${className}`}
            style={{
                // Headroom for the overhang, collapsing back to ordinary padding
                // if the artwork never loads.
                paddingTop: mascotUnavailable ? '1.5rem' : MASCOT_OVERHANG,
                paddingBottom: 'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 1.25rem))',
                paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
                paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
            }}
        >
            {/* `my-auto` rather than `items-center`: it centres the card without
                clipping its top once the container has to scroll. */}
            <motion.div
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                className="relative my-auto w-full max-w-sm"
            >
                {!mascotUnavailable && (
                    <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2">
                        <motion.img
                            src={MASCOT_SRC}
                            alt="Sally and Rayray, the SunStay mascots, raising a toast"
                            width={663}
                            height={289}
                            draggable={false}
                            decoding="async"
                            onError={() => setMascotUnavailable(true)}
                            animate={prefersReducedMotion ? undefined : { y: [0, -5, 0] }}
                            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                            className="w-64 select-none drop-shadow-[0_16px_24px_rgba(15,23,42,0.28)] sm:w-72"
                        />
                    </div>
                )}

                {/* Last in source order, so it paints over the artwork's lower edge. */}
                <div
                    role={announce ? 'status' : undefined}
                    aria-live={announce ? 'polite' : undefined}
                    className="relative overflow-hidden rounded-3xl bg-white px-6 pb-7 pt-7 text-center shadow-[0_28px_70px_-28px_rgba(15,23,42,0.5)] ring-1 ring-slate-900/5 sm:px-7 sm:pt-8"
                >
                    <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
                        <SearchX size={13} strokeWidth={2.5} aria-hidden="true" />
                        No matches
                    </span>

                    <h2 className="text-[22px] font-black leading-tight tracking-[-0.02em] text-slate-900 sm:text-2xl">
                        A bit too specific!
                    </h2>

                    <p className="mx-auto mt-3 max-w-[19rem] text-[13.5px] leading-relaxed text-slate-500">
                        Sally and Rayray couldn’t find any sunny spots matching exactly what
                        you’re looking for.
                    </p>

                    <button
                        type="button"
                        onClick={handleClear}
                        className="mt-6 flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 text-[13px] font-black uppercase tracking-[0.06em] text-slate-950 shadow-lg shadow-amber-500/30 transition-all duration-150 touch-manipulation hover:bg-amber-400 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/35"
                    >
                        <RotateCcw size={16} strokeWidth={2.75} aria-hidden="true" />
                        CLEAR FILTERS
                    </button>

                    <p className="mt-3 text-[12px] font-semibold text-slate-400">
                        Clearing brings every Melbourne spot back.
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default EmptyVenueState;
