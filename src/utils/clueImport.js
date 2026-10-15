/**
 * Pure helpers for importing City of Melbourne CLUE "Café, restaurant, bistro
 * seats" records (CC BY 4.0) as SunStay venue candidates.
 * Used by scripts/importClueVenues.mjs; no network or database access here.
 */

export const CLUE_ATTRIBUTION = 'Venue and seating data © City of Melbourne (CLUE), CC BY 4.0';

const KINDS = new Map([
    ['Cafes and Restaurants', 'cafe_restaurant'],
    ['Pubs, Taverns and Bars', 'bar'],
    ['Takeaway Food Services', 'takeaway'],
    ['Accommodation', 'stay'],
    ['Bakery Product Manufacturing (Non-factory based)', 'bakery'],
]);

/** SunStay kind for a CLUE industry description, or null to skip the record. */
export function clueKind(industry) {
    return KINDS.get(String(industry ?? '').trim()) ?? null;
}

const STOP = new Set(['the', 'and', 'hotel', 'bar', 'cafe', 'café', 'restaurant', 'melbourne', 'pty', 'ltd', 'co', 'eatery', 'espresso', 'kitchen']);

/** Lower-case name tokens without filler words, for matching. */
export function nameTokens(name) {
    return String(name ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));
}

/** Share of the shorter name's tokens found in the other (0–1). */
export function nameSimilarity(a, b) {
    const ta = new Set(nameTokens(a)), tb = new Set(nameTokens(b));
    if (!ta.size || !tb.size) return 0;
    const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
    let hit = 0;
    for (const t of small) if (big.has(t)) hit++;
    return hit / small.size;
}

const R = 6371000, RAD = Math.PI / 180;
export function metresBetween(a, b) {
    const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Floor of the outdoor seating from the business address: 0 for ground,
 * N for "Level N" / "Lvl N" / "Lvls N-M" (the highest), and rooftop: true when
 * the address says rooftop. Basements count as ground (seating is at street level).
 */
export function parseFloor(address) {
    const s = String(address ?? '');
    const rooftop = /roof\s*top|rooftop/i.test(s);
    const levels = [...s.matchAll(/\b(?:level|lvls?|lv|l)\s*(\d{1,2})(?:\s*[-–&]\s*(\d{1,2}))?/gi)]
        .flatMap((m) => [m[1], m[2]]).filter(Boolean).map(Number);
    return { floor: levels.length ? Math.max(...levels) : 0, rooftop };
}

const STREET_TYPES = 'street|st|lane|ln|place|pl|road|rd|parade|pde|walk|way|arcade|alley|avenue|ave|drive|dr|boulevard|bvd|blvd|terrace|tce|square|sq|crescent|cres|promenade|esplanade|quay|highway|hwy|close|court|ct|row';
const STREET_RE = new RegExp(`\\b\\d+[A-Za-z]?(?:\\s*[-–]\\s*\\d+[A-Za-z]?)?\\s+((?:[A-Za-z']+\\s+){0,3}?(?:${STREET_TYPES}))\\b`, 'i');
const ABBREV = { st: 'Street', ln: 'Lane', pl: 'Place', rd: 'Road', pde: 'Parade', ave: 'Avenue', dr: 'Drive', bvd: 'Boulevard', blvd: 'Boulevard', tce: 'Terrace', sq: 'Square', cres: 'Crescent', hwy: 'Highway', ct: 'Court' };

/** The street a venue's address puts it on, e.g. "Little Bourke Street", or null. */
export function addressStreet(address) {
    const m = String(address ?? '').match(STREET_RE);
    if (!m) return null;
    const words = m[1].trim().split(/\s+/);
    const last = words.pop().toLowerCase();
    const type = ABBREV[last] ?? last[0].toUpperCase() + last.slice(1);
    const name = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return name ? `${name} ${type}` : null;
}

export const isLaneway = (street) => /\b(lane|place|alley|walk|arcade|row)\b/i.test(street ?? '');

/**
 * Merge CLUE rows into one candidate per trading name and property, summing
 * outdoor seats, and drop industries SunStay doesn't list.
 */
export function dedupeClueRows(rows) {
    const byKey = new Map();
    const skipped = {};
    for (const r of Array.isArray(rows) ? rows : []) {
        const kind = clueKind(r?.industry_anzsic4_description);
        const lat = r?.latitude == null || r.latitude === '' ? NaN : Number(r.latitude);
        const lng = r?.longitude == null || r.longitude === '' ? NaN : Number(r.longitude);
        if (!kind || !r?.trading_name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            const why = kind ? 'no_name_or_location' : (r?.industry_anzsic4_description ?? 'unknown');
            skipped[why] = (skipped[why] ?? 0) + 1;
            continue;
        }
        const key = `${nameTokens(r.trading_name).join(' ')}|${r.property_id}`;
        const seats = Number(r.number_of_seats) || 0;
        const prev = byKey.get(key);
        if (prev) { prev.outdoor_seats += seats; continue; }
        const address = String(r.business_address ?? '').trim();
        byKey.set(key, {
            name: String(r.trading_name).trim(),
            address,
            kind,
            area: r.clue_small_area ?? null,
            property_id: r.property_id != null ? String(r.property_id) : null,
            census_year: Number(r.census_year) || null,
            lat, lng,
            outdoor_seats: seats,
            street: addressStreet(address),
            ...parseFloor(address),
        });
    }
    return { candidates: [...byKey.values()], skipped };
}

/**
 * Existing venue this candidate duplicates: a strong name match within 150 m,
 * or a partial one (60%+ of the shorter name) within 40 m. Returns { id, metres, score } or null.
 */
export function matchExisting(candidate, existing) {
    let best = null;
    for (const e of Array.isArray(existing) ? existing : []) {
        if (!Number.isFinite(e?.lat) || !Number.isFinite(e?.lng)) continue;
        const metres = metresBetween(candidate, e);
        if (metres > 150) continue;
        const score = nameSimilarity(candidate.name, e.name ?? e.venueName);
        const ok = (score >= 0.99 && metres <= 150) || (score >= 0.6 && metres <= 40);
        if (ok && (!best || score > best.score || (score === best.score && metres < best.metres))) {
            best = { id: e.id, metres: Math.round(metres), score: Number(score.toFixed(2)) };
        }
    }
    return best;
}

/**
 * Bearing of each street from the venue points that share its name: the
 * principal axis of those points in local metres (0–180°, clockwise from
 * north). Needs at least `minPoints` points spread over 30 m.
 *
 * @returns {Map<string, { bearing: number, lat: number, lng: number, points: number }>}
 */
export function streetAxes(candidates, { minPoints = 3 } = {}) {
    const groups = new Map();
    for (const c of Array.isArray(candidates) ? candidates : []) {
        if (!c?.street) continue;
        const k = c.street.toLowerCase();
        if (!groups.has(k)) groups.set(k, { street: c.street, pts: [] });
        groups.get(k).pts.push(c);
    }
    const out = new Map();
    for (const { street, pts } of groups.values()) {
        const unique = [...new Map(pts.map((p) => [`${p.lat},${p.lng}`, p])).values()];
        if (unique.length < minPoints) continue;
        const lat0 = unique.reduce((s, p) => s + p.lat, 0) / unique.length;
        const lng0 = unique.reduce((s, p) => s + p.lng, 0) / unique.length;
        const kx = Math.cos(lat0 * RAD) * R * RAD, ky = R * RAD;
        let sxx = 0, syy = 0, sxy = 0;
        for (const p of unique) {
            const x = (p.lng - lng0) * kx, y = (p.lat - lat0) * ky;
            sxx += x * x; syy += y * y; sxy += x * y;
        }
        const spread = Math.sqrt((sxx + syy) / unique.length);
        if (spread < 15) continue;
        const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        const bearing = ((90 - theta / RAD) % 180 + 180) % 180;
        out.set(street.toLowerCase(), { bearing: Number(bearing.toFixed(1)), lat: lat0, lng: lng0, points: unique.length });
    }
    return out;
}
