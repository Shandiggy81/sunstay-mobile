/**
 * Builds idempotent upsert SQL for public.venues from app venue objects, so a
 * seed file is generated from src/data/demoVenues.js and never drifts from it.
 * Pure: no database access. Column names match production (camelCase quoted).
 */

// App field -> column type. Only these columns are written; anything else on
// the app object (timeZone, sunshineScore, ...) is app-only and skipped.
export const VENUE_SEED_COLUMNS = {
    id: 'text', venueName: 'text', companyName: 'text', address: 'text', suburb: 'text',
    lat: 'float', lng: 'float', emoji: 'text', vibe: 'text',
    typeCategory: 'text', typeLabel: 'text', tags: 'jsonb', hasBalcony: 'bool',
    venue_description: 'text', official_website_url: 'text', contact_phone: 'text',
    image: 'text', roomTypes: 'jsonb', balconyData: 'jsonb',
};
const REQUIRED = ['id', 'venueName', 'lat', 'lng'];

const quoteIdent = name => `"${String(name).replaceAll('"', '""')}"`;
const quoteText = value => `'${String(value).replaceAll('\u0000', '').replaceAll("'", "''")}'`;

/** One SQL literal for a value of the given column type. */
export function sqlLiteral(value, type) {
    if (value === null || value === undefined) return 'null';
    switch (type) {
        case 'text': return quoteText(value);
        case 'float': {
            const number = typeof value === 'number' ? value : Number.NaN;
            if (!Number.isFinite(number)) throw new TypeError(`Not a finite number: ${value}`);
            return String(number);
        }
        case 'bool':
            if (typeof value !== 'boolean') throw new TypeError(`Not a boolean: ${value}`);
            return value ? 'true' : 'false';
        case 'jsonb': return `${quoteText(JSON.stringify(value))}::jsonb`;
        default: throw new TypeError(`Unknown column type: ${type}`);
    }
}

/** The columns and literals to write for one venue, in a stable order. */
export function venueSeedRow(venue) {
    for (const key of REQUIRED) {
        if (venue?.[key] === null || venue?.[key] === undefined || venue[key] === '') throw new TypeError(`Venue is missing ${key}`);
    }
    if (venue.lat < -90 || venue.lat > 90 || venue.lng < -180 || venue.lng > 180) throw new RangeError(`Venue ${venue.id} has invalid coordinates`);
    const columns = Object.keys(VENUE_SEED_COLUMNS).filter(key => venue[key] !== undefined);
    return { columns, values: columns.map(key => sqlLiteral(venue[key], VENUE_SEED_COLUMNS[key])) };
}

/** insert ... on conflict (id) do update, one statement per venue. */
export function venueUpsertSql(venue) {
    const { columns, values } = venueSeedRow(venue);
    const updates = columns.filter(column => column !== 'id').map(column => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`);
    return `insert into public.venues (${columns.map(quoteIdent).join(', ')})\nvalues (${values.join(', ')})\n` +
        `on conflict (id) do update set ${[...updates, 'updated_at = now()'].join(', ')};`;
}
