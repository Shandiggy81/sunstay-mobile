import { SUN_MOMENT_FILTERS } from './sunMomentFilters.js';
import { SUN_MOMENTS } from './sunMoments.js';

const titles = new Map(SUN_MOMENTS.map(({ key, title }) => [key, title.toLowerCase()]));
const badges = new Map(SUN_MOMENT_FILTERS.map(({ moment, icon }) => [moment, Object.freeze({
    moment,
    icon,
    label: `sun for ${titles.get(moment)}`,
})]));

/**
 * Badge for a venue with direct sun in the active quick-filter moment.
 * Consumes the existing venue-id → moment-key map; never calculates or fetches sun data.
 *
 * @param {string|number|null|undefined} venueId
 * @param {string|null|undefined} activeMoment coffee, lunch or sunset
 * @param {Map<string, string[]>} sunMomentsById
 * @returns {{ moment: string, icon: string, label: string }|null}
 */
export function mapMomentBadge(venueId, activeMoment, sunMomentsById) {
    const badge = badges.get(activeMoment);
    if (!badge || venueId == null || !(sunMomentsById instanceof Map)) return null;
    const moments = sunMomentsById.get(String(venueId));
    return Array.isArray(moments) && moments.includes(activeMoment) ? badge : null;
}
