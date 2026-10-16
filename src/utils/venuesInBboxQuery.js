import { fetchAllRows } from './fetchAllRows.js';

/**
 * Every venues_in_bbox row for a map view. The API returns at most 1,000 rows
 * per response, functions included, so a zoomed-out view over ~1,100 venues
 * is read in pages; p_limit is the server-side cap on the whole result.
 *
 * @param {{ rpc: Function }} client Supabase client
 * @param {{minLng:number,minLat:number,maxLng:number,maxLat:number}} bbox normalised bbox
 * @param {{ limit: number, signal?: AbortSignal, pageSize?: number }} options
 * @returns {Promise<{ data: object[]|null, error: any }>}
 */
export function fetchVenuesInBbox(client, bbox, { limit, signal, pageSize } = {}) {
    return fetchAllRows((from, to) => {
        let query = client
            .rpc('venues_in_bbox', {
                min_lng: bbox.minLng,
                min_lat: bbox.minLat,
                max_lng: bbox.maxLng,
                max_lat: bbox.maxLat,
                p_limit: limit,
            })
            .range(from, to);
        if (signal) query = query.abortSignal(signal);
        return query;
    }, pageSize ? { pageSize } : undefined);
}
