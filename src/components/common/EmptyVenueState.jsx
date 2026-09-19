import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RotateCcw, SearchX } from 'lucide-react';
import sallyEmpty from '../../assets/mascots/sally-empty.png';
import rayrayEmpty from '../../assets/mascots/rayray-empty.png';

// Sally is a full-body mascot and Rayray is a head, so matching them on height
// would leave her looking tiny beside him. They are matched on *head* size
// instead: her ray span is 0.42× her own height where his is 0.94× his, so
// equal heads put him at ~44% of her height. 78px against her 184px lands just
// under that, which reads as a natural pair rather than a clone.
const SALLY = { src: sallyEmpty, w: 201, h: 380 };
const RAYRAY = { src: rayrayEmpty, w: 197, h: 200 };

const SALLY_H = 184;
const RAYRAY_H = 78;

// The pair is painted *behind* the card, so the card's top edge is the crop
// line. The row is bottom-aligned and offset by `-SALLY_OVERHANG`, which puts
// its bottom SALLY_DIP px inside the card: Sally is cut just above the hem of
// her hoodie, hiding her leggings and shoes. Rayray is lifted by RAYRAY_LIFT so
// he only dips 18px and still shows ~three quarters of his face —
// bottom-aligning him flush with Sally would bury all but the top of his head.
//
// Keep SALLY_OVERHANG near 8rem. It is the padding the state reserves above the
// card, and the sheet on a short viewport (320×740) has no room to spare.
const SALLY_DIP = 56;
const RAYRAY_LIFT = 38;
const SALLY_OVERHANG = SALLY_H - SALLY_DIP; // 128px of artwork above the card

// Widest the pair can get: 97px + 77px + the 8px gap. That clears the card at
// every viewport we support — 334px wide at 390px, and still 264px at 320px —
// so the row never has to wrap or squash. `shrink-0` on each image keeps flex
// from distorting them if that ever stops being true.
const MASCOT_OVERHANG = `${SALLY_OVERHANG / 16}rem`;

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
                    // Spans the card rather than using `left-1/2`: an auto-width
                    // absolute box only gets the space to the right of its offset,
                    // and Tailwind's `img { max-width: 100% }` would shrink the
                    // artwork to fit it.
                    <motion.div
                        className="pointer-events-none absolute left-0 right-0 flex items-end justify-center gap-2"
                        style={{ top: -SALLY_OVERHANG }}
                        animate={prefersReducedMotion ? undefined : { y: [0, -5, 0] }}
                        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        <img
                            src={SALLY.src}
                            alt="Sally, a SunStay sun mascot in pink sunglasses and a hoodie"
                            width={SALLY.w}
                            height={SALLY.h}
                            draggable={false}
                            decoding="async"
                            onError={() => setMascotUnavailable(true)}
                            style={{ height: SALLY_H }}
                            className="w-auto shrink-0 select-none drop-shadow-[0_16px_24px_rgba(15,23,42,0.28)]"
                        />
                        <img
                            src={RAYRAY.src}
                            alt="Rayray, a beaming SunStay sun mascot"
                            width={RAYRAY.w}
                            height={RAYRAY.h}
                            draggable={false}
                            decoding="async"
                            onError={() => setMascotUnavailable(true)}
                            style={{ height: RAYRAY_H, marginBottom: RAYRAY_LIFT }}
                            className="w-auto shrink-0 select-none drop-shadow-[0_14px_20px_rgba(15,23,42,0.26)]"
                        />
                    </motion.div>
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
                </div>
            </motion.div>
        </div>
    );
};

export default EmptyVenueState;
