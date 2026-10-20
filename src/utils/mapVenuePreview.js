import { keyAmenities } from './venueAmenities.js';
import { venueConditionChips } from './venueConditionChips.js';
import { venueTypeLabel } from './venueTypeLabel.js';
import { venueKind } from './venueKind.js';

/** Compact pin content; keep the sun wording and amenity order shared with the list. */
export function mapVenuePreview(venue, forecast) {
    const photo = [venue?.image_url, venue?.image].find(value => typeof value === 'string' && value.trim());
    // typeCategory names only a stay's type: for food and drink it is always
    // 'Bar' ("not a stay"), which would show a café with no label as a "Bar".
    const category = venueKind(venue) === 'stay' ? venue.typeCategory : '';
    const type = venueTypeLabel(venue?.typeLabel || venue?.vibe || category);
    return {
        name: String(venue?.venueName || venue?.name || 'Venue'),
        imageUrl: photo?.trim() || null,
        subtitle: [type, String(venue?.suburb ?? '').trim()].filter(Boolean).join(' · '),
        sun: venueConditionChips({ venue, forecast }).find(chip => chip.key === 'sun') ?? null,
        amenities: keyAmenities(venue).slice(0, 3),
    };
}

/** A deliberate downward swipe dismisses; taps, upward and short slow drags do not. */
export function dismissPreviewSwipe({ offsetY = 0, velocityY = 0 } = {}) {
    return Number.isFinite(offsetY) && (offsetY >= 60 || (offsetY >= 12 && velocityY >= 600));
}

/** Detect a canvas drag without intercepting or changing Mapbox's pointer handling. */
export function isPreviewMapDrag(start, current) {
    if (!start || !current || start.pointerId !== current.pointerId) return false;
    if (![start.x, start.y, current.x, current.y].every(Number.isFinite)) return false;
    return Math.hypot(current.x - start.x, current.y - start.y) >= 8;
}
