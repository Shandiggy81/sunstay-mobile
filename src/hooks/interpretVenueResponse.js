export function normalizeVenueRow(row) {
    if (!row || typeof row !== 'object') return row;
    const parseJson = (value, fallback) => {
        if (value == null || value === '') return fallback;
        if (typeof value === 'string') {
            try { return JSON.parse(value); } catch { return fallback; }
        }
        return value;
    };

    const tags = Array.isArray(row.tags) ? row.tags : parseJson(row.tags, []);
    const happyHour = parseJson(row.happyHour, null);
    const shielding = parseJson(row.shielding, null);
    let roomTypes = parseJson(row.roomTypes, null);
    if (roomTypes && !Array.isArray(roomTypes)) roomTypes = [roomTypes];

    return {
        ...row,
        tags,
        happyHour: happyHour || undefined,
        shielding: shielding || undefined,
        roomTypes: Array.isArray(roomTypes) ? roomTypes : undefined,
        lat: Number(row.lat),
        lng: Number(row.lng),
        venueName: row.venueName || row.name || 'Unnamed venue',
    };
}

/**
 * Interpret a Supabase venues response without touching React state.
 * Callers keep the existing fallback list when this is not `ok`.
 */
export function interpretVenueResponse(response) {
    const { data, error } = response || {};
    if (error) {
        return { ok: false, empty: false, rows: null, error };
    }
    if (Array.isArray(data) && data.length > 0) {
        return { ok: true, empty: false, rows: data.map(normalizeVenueRow), error: null };
    }
    return { ok: false, empty: true, rows: null, error: null };
}
