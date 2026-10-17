import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import ClayIcon from './common/ClayIcon';
import VenueIcon from './common/VenueIcon';
import { venueIcon } from '../utils/clayIcons';
import { venueSunForecast } from '../utils/venueSun';
import { mapVenuePreview, dismissPreviewSwipe } from '../utils/mapVenuePreview';

export default function MapVenuePreview({ venue, weather, onOpen, onClose, mapExpanded = false }) {
    const [photoFailed, setPhotoFailed] = useState(false);
    const dragged = useRef(false);
    const openButton = useRef(null);
    const forecast = useMemo(() => venueSunForecast({ venue, weather }), [venue, weather]);
    const view = useMemo(() => mapVenuePreview(venue, forecast), [venue, forecast]);
    useEffect(() => { openButton.current?.focus({ preventScroll: true }); }, []);

    return (
        <motion.div
            role="region"
            aria-label={`${view.name} preview`}
            className={`absolute inset-x-3 z-[60] overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.22)] lg:left-4 lg:right-auto lg:w-[400px] ${mapExpanded ? 'bottom-4' : 'bottom-[calc(env(safe-area-inset-bottom)+80px)] lg:bottom-4'}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onPointerDownCapture={() => { dragged.current = false; }}
            onDragStart={() => { dragged.current = true; }}
            onDragEnd={(_, info) => {
                if (dismissPreviewSwipe({ offsetY: info.offset.y, velocityY: info.velocity.y })) onClose();
            }}
            onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}
            style={{ touchAction: 'pan-x' }}
        >
            <button
                ref={openButton}
                type="button"
                onClick={event => { if (event.detail === 0 || !dragged.current) onOpen(venue); }}
                aria-label={`Open ${view.name} details.${view.subtitle ? ` ${view.subtitle}.` : ''}${view.sun ? ` ${view.sun.text}.` : ''}${view.amenities.length ? ` ${view.amenities.map(a => a.label).join(', ')}.` : ''}`}
                className="block min-h-11 w-full rounded-3xl p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-600"
            >
                <span className="flex items-start gap-3 pr-10">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-amber-50" aria-hidden="true">
                        {view.imageUrl && !photoFailed ? (
                            <img src={view.imageUrl} alt="" draggable={false} decoding="async" className="h-full w-full object-cover" onError={() => setPhotoFailed(true)} />
                        ) : <VenueIcon icon={venueIcon(venue)} size={52} />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-[17px] font-extrabold leading-tight text-slate-900">{view.name}</span>
                        {view.subtitle ? <span className="mt-1 block text-[13px] font-medium leading-snug text-slate-600">{view.subtitle}</span> : null}
                        {view.sun ? (
                            <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold leading-tight ${view.sun.tone === 'sun' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
                                <ClayIcon name={view.sun.icon} size={20} />
                                {view.sun.text}
                            </span>
                        ) : null}
                    </span>
                </span>
                {view.amenities.length ? (
                    <span className="mt-2 flex flex-wrap gap-x-2 gap-y-1" aria-hidden="true">
                        {view.amenities.map(amenity => (
                            <span key={amenity.key} className="inline-flex items-center gap-1 rounded-full bg-slate-50 py-1 pl-1 pr-2 text-[12px] font-semibold text-slate-700">
                                <ClayIcon name={amenity.icon} size={20} />
                                {amenity.short}
                            </span>
                        ))}
                    </span>
                ) : null}
            </button>
            <button
                type="button"
                aria-label="Close venue preview"
                onPointerDown={event => event.stopPropagation()}
                onClick={onClose}
                className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full text-slate-700 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            >
                <X size={20} />
            </button>
        </motion.div>
    );
}
