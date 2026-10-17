import { SUN_MOMENTS } from './sunMoments.js';

/** Short labels from the same today's sun summary shown in the venue card. */
export function venuePerfectFor(summary) {
    if (!Array.isArray(summary?.moments)) return '';
    const available = new Set(summary.moments.filter((moment) => moment?.available === true).map((moment) => moment.key));
    return SUN_MOMENTS.filter((moment) => available.has(moment.key)).map((moment) => moment.title).join(' · ');
}
