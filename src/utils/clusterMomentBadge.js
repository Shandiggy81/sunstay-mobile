import { mapMomentBadge, momentBadgeDescriptor } from './mapMomentBadge.js';

const fields = Object.freeze([
    { moment: 'coffee', match: 'sunCoffeeMatch', count: 'sunCoffeeCount' },
    { moment: 'lunch', match: 'sunLunchMatch', count: 'sunLunchCount' },
    { moment: 'sunset', match: 'sunSunsetMatch', count: 'sunSunsetCount' },
]);

/** Sum every moment independently so a chip change cannot reuse another moment's count. */
export const CLUSTER_MOMENT_PROPERTIES = Object.freeze(Object.fromEntries(
    fields.map(({ match, count }) => [count, Object.freeze(['+', Object.freeze(['get', match])])]),
));

/** Numeric point properties for Mapbox's cluster aggregation; consumes existing sun data. */
export function pointMomentMatches(venueId, sunMomentsById) {
    return Object.fromEntries(fields.map(({ moment, match }) => [
        match, mapMomentBadge(venueId, moment, sunMomentsById) ? 1 : 0,
    ]));
}

/** Badge and matching venue count for the active moment, or an undecorated cluster. */
export function clusterMomentBadge(properties, activeMoment) {
    const badge = momentBadgeDescriptor(activeMoment);
    const field = fields.find(({ moment }) => moment === activeMoment);
    const matchCount = field && properties?.[field.count];
    const total = properties?.point_count;
    if (!badge || !Number.isSafeInteger(matchCount) || matchCount <= 0
        || !Number.isSafeInteger(total) || total <= 0 || matchCount > total) {
        return { badge: null, matchCount: 0 };
    }
    return { badge, matchCount };
}

/** Include decoration changes when the cluster id, total and centroid stay unchanged. */
export function clusterMomentFeatureSignature(features, activeMoment) {
    const badge = momentBadgeDescriptor(activeMoment);
    if (!badge) return 'none';
    let signature = `${badge.moment}:`;
    for (const feature of Array.isArray(features) ? features : []) {
        const properties = feature?.properties;
        if (!properties?.cluster) continue;
        signature += `${properties.cluster_id}:${clusterMomentBadge(properties, activeMoment).matchCount};`;
    }
    return signature;
}
