import { venueKind } from './venueKind.js';
import { venueTypeLabel } from './venueTypeLabel.js';

/**
 * A venue's type and suburb, e.g. "Rooftop Club · South Yarra", joined from
 * the parts present so it never reads " · Fitzroy". The map preview and
 * Sunny's suggestion rows share it.
 */
export function venueSubtitle(venue) {
    // typeCategory names only a stay's type: for food and drink it is always
    // 'Bar' ("not a stay"), which would show a café with no label as a "Bar".
    const category = venueKind(venue) === 'stay' ? venue.typeCategory : '';
    const type = venueTypeLabel(venue?.typeLabel || venue?.vibe || category);
    return [type, String(venue?.suburb ?? '').trim()].filter(Boolean).join(' · ');
}
