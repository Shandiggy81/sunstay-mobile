/**
 * <link rel="preconnect"> tags for the origins the first screen always needs,
 * so DNS, TCP and TLS are done while the JavaScript downloads: Mapbox for the
 * map style and tiles, and Supabase (when configured) for the venues query.
 * Both are fetched with CORS and no credentials, hence `crossorigin`.
 * Used by the vite.config.js plugin; returns Vite HtmlTagDescriptor objects.
 */
export const MAPBOX_API_ORIGIN = 'https://api.mapbox.com';

export function preconnectTags(env = {}) {
    const origins = [MAPBOX_API_ORIGIN];
    try {
        const supabase = new URL(env.VITE_SUPABASE_URL);
        if (supabase.protocol === 'https:' && !origins.includes(supabase.origin)) origins.push(supabase.origin);
    } catch { /* Not configured: the app uses demo venues and never calls Supabase. */ }
    return origins.map(href => ({ tag: 'link', attrs: { rel: 'preconnect', href, crossorigin: true }, injectTo: 'head' }));
}
