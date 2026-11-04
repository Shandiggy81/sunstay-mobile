/**
 * The venue card footer's lead action (design approved 4 Nov 2026). A stay
 * (isStayVenue: hotel, serviced apartment, short stay) with an official website
 * leads with "Visit property website", because that is where a guest checks
 * rooms. SunStay takes no bookings, so nothing here says Book. Every other
 * venue, and a stay without a usable website, leads with Get directions as now.
 */
import { isStayVenue } from './propertyTypes.js';

/**
 * "questapartments.com.au" from an http(s) URL, for the caption under the
 * website button; null when the value isn't a web address.
 */
export function websiteHostLabel(url) {
    if (typeof url !== 'string' || !url.trim()) return null;
    let parsed;
    try { parsed = new URL(url.trim()); } catch { return null; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, '') || null;
}

/** 'website' for a stay with a web address, else 'directions'. */
export function footerPrimaryAction({ venue, websiteUrl }) {
    return isStayVenue(venue) && websiteHostLabel(websiteUrl) ? 'website' : 'directions';
}
