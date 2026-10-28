/**
 * Venue link previews. Chat apps and social sites build a preview card from a
 * shared link without running JavaScript, so a `?venue=<id>` link would show
 * the general SunStay card. netlify/edge-functions/venue-preview.js runs this
 * for those crawlers only: it looks the venue up in Supabase and fills in its
 * name before the page leaves Netlify. Browsers never reach it.
 *
 * Kept free of Netlify and Supabase SDKs so Node's test runner covers it and
 * Deno can bundle it for the edge.
 */
import { venueTypeLabel } from './venueTypeLabel.js';

/**
 * User agents that fetch link previews or index pages. Netlify matches this
 * against User-Agent before the function runs (a partial, case-sensitive
 * match), so it sticks to plain alternation and character classes.
 * iMessage, Messenger and Instagram send facebookexternalhit; Signal sends
 * WhatsApp; Slack, Discord, Telegram, LinkedIn, X and search engines say "bot".
 */
export const LINK_PREVIEW_AGENTS = '[Bb]ot|[Cc]rawl|[Ss]pider|facebookexternalhit|WhatsApp|SkypeUriPreview|Embedly|Iframely|Mastodon|Cardyb|kakaotalk|Google-PageRenderer|BingPreview|vkShare';

/** Response header saying what the function did, for checking with curl. */
export const PREVIEW_HEADER = 'x-sunstay-link-preview';

const VENUE_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

/** The `venue` query value when it looks like a venue id, else null. */
export function previewVenueId(search) {
    let id;
    try { id = new URLSearchParams(search).get('venue'); } catch { return null; }
    id = typeof id === 'string' ? id.trim() : '';
    return VENUE_ID.test(id) ? id : null;
}

/**
 * Preview title and description for a venues row, worded like the list row
 * (type label, then suburb). Null when the row has no name.
 */
export function venuePreviewText(venue) {
    const name = String(venue?.venueName ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!name) return null;
    const rawType = venueTypeLabel(venue?.typeLabel || venue?.vibe);
    const type = rawType ? `${rawType.charAt(0).toUpperCase()}${rawType.slice(1)}` : '';
    const suburb = String(venue?.suburb ?? '').trim();
    const place = suburb && suburb.toLowerCase() !== name.toLowerCase() ? suburb : '';
    const lead = type && place ? `${type} in ${place}. ` : type ? `${type}. ` : place ? `In ${place}. ` : '';
    return { title: `${name} on SunStay`, description: `${lead}See the live sun and weather before you go.` };
}

const PREVIEW_TAGS = [
    ['name', 'description', 'description'],
    ['property', 'og:title', 'title'],
    ['property', 'og:description', 'description'],
    ['name', 'twitter:title', 'title'],
    ['name', 'twitter:description', 'description'],
];

/**
 * index.html with the title, description, og: and twitter: text set for the
 * venue. The image and every other tag stay as they are.
 */
export function withVenuePreview(html, text) {
    if (typeof html !== 'string' || !text) return html;
    const values = { title: escapeHtml(text.title), description: escapeHtml(text.description) };
    let out = html.replace(/<title>[^<]*<\/title>/, () => `<title>${values.title}</title>`);
    for (const [attr, key, field] of PREVIEW_TAGS) {
        out = out.replace(
            new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`),
            (_, open, close) => `${open}${values[field]}${close}`,
        );
    }
    return out;
}

async function fetchVenueRow({ baseUrl, key, id, fetchImpl, timeoutMs }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const url = new URL('/rest/v1/venues', baseUrl);
        url.searchParams.set('select', 'venueName,suburb,typeLabel,vibe');
        url.searchParams.set('id', `eq.${id}`);
        url.searchParams.set('limit', '1');
        // The public anon key and the venues SELECT policy: read-only, like the app.
        const res = await fetchImpl(url, {
            headers: { apikey: key, accept: 'application/json' },
            signal: controller.signal,
        });
        if (!res.ok) return { status: 'unavailable' };
        const rows = await res.json();
        return Array.isArray(rows) && rows[0] ? { status: 'venue', row: rows[0] } : { status: 'not-found' };
    } catch {
        return { status: 'unavailable' };
    } finally {
        clearTimeout(timer);
    }
}

function withStatusHeader(page, status) {
    const headers = new Headers(page.headers);
    headers.set(PREVIEW_HEADER, status);
    return new Response(page.body, { status: page.status, statusText: page.statusText, headers });
}

/**
 * The edge function's work. Returns undefined (Netlify carries on as if the
 * function were not there) unless the link names a venue. Any failure serves
 * the normal page with the general card, never an error.
 *
 * @param {Request} request
 * @param {{ next: () => Promise<Response>, env: (key: string) => string | undefined,
 *   fetchImpl?: typeof fetch, timeoutMs?: number }} deps
 * @returns {Promise<Response | undefined>}
 */
export async function venuePreviewResponse(request, { next, env, fetchImpl = fetch, timeoutMs = 1500 }) {
    const id = previewVenueId(new URL(request.url).search);
    if (!id) return undefined;
    const baseUrl = env('VITE_SUPABASE_URL');
    const key = env('VITE_SUPABASE_ANON_KEY');
    const [page, lookup] = await Promise.all([
        next(),
        baseUrl && key ? fetchVenueRow({ baseUrl, key, id, fetchImpl, timeoutMs }) : { status: 'unconfigured' },
    ]);
    if (page.status !== 200 || !(page.headers.get('content-type') ?? '').includes('text/html')) return page;
    const text = lookup.row ? venuePreviewText(lookup.row) : null;
    if (!text) return withStatusHeader(page, lookup.row ? 'not-found' : lookup.status);

    const headers = new Headers(page.headers);
    for (const stale of ['content-length', 'content-encoding', 'etag']) headers.delete(stale);
    headers.set(PREVIEW_HEADER, 'venue');
    return new Response(withVenuePreview(await page.text(), text), { status: 200, headers });
}
