import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import ClayIcon from './common/ClayIcon';
import VenueIcon from './common/VenueIcon';
import { venueIcon } from '../utils/clayIcons';
import { venueSunForecast } from '../utils/venueSun';
import { mapVenuePreview, dismissPreviewSwipe } from '../utils/mapVenuePreview';
import './ExploreMapPresentation.css';

export default function MapVenuePreview({ venue, weather, onOpen, onClose, mapExpanded = false }) {
    const [photoFailed, setPhotoFailed] = useState(false);
    const reducedMotion = useReducedMotion();
    const dragged = useRef(false);
    const openButton = useRef(null);
    const forecast = useMemo(() => venueSunForecast({ venue, weather }), [venue, weather]);
    const view = useMemo(() => mapVenuePreview(venue, forecast), [venue, forecast]);
    useEffect(() => { openButton.current?.focus({ preventScroll: true }); }, []);

    return (
        <motion.div
            role="region"
            aria-label={`${view.name} preview`}
            className={`ss-map-venue-preview absolute inset-x-3 z-[60] overflow-hidden lg:left-4 lg:right-auto lg:w-[400px] ${mapExpanded ? 'bottom-4' : 'bottom-[calc(env(safe-area-inset-bottom)+80px)] lg:bottom-4'}`}
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : 16 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
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
                className="ss-map-venue-preview__open block min-h-11 w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-600"
            >
                <span className="ss-map-venue-preview__main">
                    <span className="ss-map-venue-preview__image" aria-hidden="true">
                        {view.imageUrl && !photoFailed ? (
                            <img src={view.imageUrl} alt="" draggable={false} decoding="async" className="h-full w-full object-cover" onError={() => setPhotoFailed(true)} />
                        ) : <VenueIcon icon={venueIcon(venue)} size={52} />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="ss-map-venue-preview__name line-clamp-2">{view.name}</span>
                        {view.subtitle ? <span className="ss-map-venue-preview__type"><VenueIcon icon={venueIcon(venue)} size={20} />{view.subtitle}</span> : null}
                        {view.sun ? (
                            <span className={`ss-map-venue-preview__sun ${view.sun.tone === 'sun' ? 'ss-map-venue-preview__sun--sunny' : ''}`}>
                                <ClayIcon name={view.sun.icon} size={20} />
                                <span>{view.sun.text}</span>
                            </span>
                        ) : null}
                    </span>
                </span>
                {view.amenities.length ? (
                    <span className="ss-map-venue-preview__amenities" aria-hidden="true">
                        {view.amenities.map(amenity => (
                            <span key={amenity.key} className="ss-map-venue-preview__amenity">
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
                className="ss-map-venue-preview__close absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full active:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            >
                <X size={20} />
            </button>
        </motion.div>
    );
}
