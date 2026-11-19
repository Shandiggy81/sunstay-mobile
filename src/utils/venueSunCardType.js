/**
 * Which sun card a venue gets (docs/design/venue-sun-cards-brief.md §3, stage 5).
 *
 * Cafés and bakeries get the café card. Other venues get a typed card only when
 * their own typeLabel names the outdoor space: a rooftop, a beer garden or a
 * courtyard. A pub or bar whose label names no outdoor space keeps the generic
 * "Sun moments today": calling it a beer garden would claim one it may not have.
 * Never from the venue's name, tags or vibe, and never a stay or a home.
 *
 * @module utils/venueSunCardType
 */
import { isCafeVenue } from './cafeCardTiles.js';
import { isPropertyVenue } from './propertyTypes.js';
import { venueTypeLabel } from './venueTypeLabel.js';

/** Card copy per type: the brief's headline, and the tile list's accessible name. */
export const SUN_CARD_TYPES = Object.freeze({
    cafe: Object.freeze({ title: 'Outdoor Table Sun', factsLabel: 'At this café' }),
    rooftop: Object.freeze({ title: 'Rooftop Sun', factsLabel: 'On this rooftop' }),
    'beer-garden': Object.freeze({ title: 'Beer Garden Sun', factsLabel: 'At this beer garden' }),
    courtyard: Object.freeze({ title: 'Courtyard Sun', factsLabel: 'In this courtyard' }),
});

// First match wins: a "Rooftop Beer Garden" is a rooftop, the more exposed space.
const OUTDOOR_SPACES = Object.freeze([
    ['rooftop', /\brooftops?\b|\broof\s*top\b/],
    ['beer-garden', /\bbeer\s*gardens?\b|\bbiergarten\b/],
    ['courtyard', /\bcourtyards?\b/],
]);

/**
 * @param {object|null|undefined} venue app venue
 * @returns {'cafe'|'rooftop'|'beer-garden'|'courtyard'|null} null keeps the generic sun moments
 */
export function venueSunCardType(venue) {
    if (!venue || isPropertyVenue(venue)) return null;
    if (isCafeVenue(venue)) return 'cafe';
    const label = venueTypeLabel(venue.typeLabel);
    if (!label) return null;
    const text = label.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return OUTDOOR_SPACES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}
