import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    escapeHtml, LINK_PREVIEW_AGENTS, PREVIEW_HEADER, previewVenueId,
    venuePreviewResponse, venuePreviewText, withVenuePreview,
} from './venuePreviewMeta.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const wonderland = { venueName: 'Wonderland Bar', suburb: 'Windsor', typeLabel: 'Beer Garden', vibe: 'Sunny garden' };
const metaContent = (doc, attr, key) => doc.match(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`))?.[1];

test('crawler user agents match and browsers do not', () => {
    const agents = new RegExp(LINK_PREVIEW_AGENTS);
    const crawlers = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0', // iMessage
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'WhatsApp/2.23.20.0 A',
        'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
        'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
        'TelegramBot (like TwitterBot)',
        'Twitterbot/1.0',
        'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
        'Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com',
        'Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)',
        'http.rb/5.1.1 (Mastodon/4.2.1; +https://mastodon.social/)',
        'Pinterest/0.2 (+https://www.pinterest.com/bot.html)',
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    ];
    const browsers = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
        'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91 (iPhone14,5; iOS 17_5; en_AU)',
    ];
    for (const ua of crawlers) assert.ok(agents.test(ua), ua);
    for (const ua of browsers) assert.ok(!agents.test(ua), ua);
});

test('only an id-shaped ?venue value is looked up', () => {
    assert.equal(previewVenueId('?venue=dv-01'), 'dv-01');
    assert.equal(previewVenueId('?utm_source=x&venue=%20the-osborne%20'), 'the-osborne');
    assert.equal(previewVenueId(''), null);
    assert.equal(previewVenueId('?venue='), null);
    assert.equal(previewVenueId(`?venue=${'x'.repeat(65)}`), null);
    assert.equal(previewVenueId('?venue=a%0Ab'), null);
    assert.equal(previewVenueId('?venue=dv-01,dv-02'), null);
    assert.equal(previewVenueId('?venue=%3Cscript%3E'), null);
});

test('preview text reads like the list row', () => {
    assert.deepEqual(venuePreviewText(wonderland),
        { title: 'Wonderland Bar on SunStay', description: 'Beer Garden in Windsor. See the live sun and weather before you go.' });
    assert.equal(venuePreviewText({ venueName: 'Mr Tucker', suburb: 'Fitzroy', typeLabel: 'Eatery' }).description,
        'Food & drink in Fitzroy. See the live sun and weather before you go.');
    assert.equal(venuePreviewText({ venueName: 'Lune', suburb: 'Fitzroy', vibe: 'croissants' }).description,
        'Croissants in Fitzroy. See the live sun and weather before you go.');
    assert.equal(venuePreviewText({ venueName: 'Federation Square', suburb: 'Melbourne' }).description,
        'In Melbourne. See the live sun and weather before you go.');
    assert.equal(venuePreviewText({ venueName: 'Windsor', suburb: 'Windsor' }).description, 'See the live sun and weather before you go.');
    assert.equal(venuePreviewText({ venueName: '  Railway   Hotel  ' }).title, 'Railway Hotel on SunStay');
    assert.equal(venuePreviewText({ venueName: '  ' }), null);
    assert.equal(venuePreviewText(null), null);
});

test('rewrites the real index.html text tags and nothing else', () => {
    const text = venuePreviewText(wonderland);
    const out = withVenuePreview(html, text);
    assert.match(out, /<title>Wonderland Bar on SunStay<\/title>/);
    for (const [attr, key] of [['property', 'og:title'], ['name', 'twitter:title']]) assert.equal(metaContent(out, attr, key), text.title, key);
    for (const [attr, key] of [['name', 'description'], ['property', 'og:description'], ['name', 'twitter:description']]) {
        assert.equal(metaContent(out, attr, key), text.description, key);
    }
    assert.equal(metaContent(out, 'property', 'og:image'), metaContent(html, 'property', 'og:image'));
    assert.equal(metaContent(out, 'property', 'og:image:alt'), metaContent(html, 'property', 'og:image:alt'));
    const shape = doc => doc.replace(/<title>[^<]*<\/title>|content="[^"]*"/g, '');
    assert.equal(shape(out), shape(html), 'only tag values change');
    assert.equal(withVenuePreview(html, null), html);
});

test('venue names are escaped, never injected', () => {
    const out = withVenuePreview(html, venuePreviewText({ venueName: '"/><script>alert(1)</script>', suburb: 'Fitz & Roy' }));
    assert.doesNotMatch(out, /<script>alert/);
    assert.equal(metaContent(out, 'property', 'og:title'), '&quot;/&gt;&lt;script&gt;alert(1)&lt;/script&gt; on SunStay');
    assert.equal(escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
    // "$&" in a name must not act as a replacement pattern.
    assert.match(withVenuePreview(html, { title: 'Cash $& Co', description: 'x' }), /<title>Cash \$&amp; Co<\/title>/);
});

function harness({ rows = [wonderland], status = 200, env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key' }, page, fetchImpl } = {}) {
    const calls = { next: 0, fetch: [] };
    const deps = {
        next: async () => {
            calls.next += 1;
            return page ?? new Response(html, { headers: { 'content-type': 'text/html; charset=UTF-8', 'content-length': String(html.length), etag: '"abc"' } });
        },
        env: key => env[key],
        fetchImpl: fetchImpl ?? (async (url, init) => {
            calls.fetch.push({ url: String(url), init });
            return new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
        }),
        timeoutMs: 50,
    };
    return { calls, deps };
}
const request = query => new Request(`https://sunstayglobal30.netlify.app/${query}`);

test('a venue link gets the venue card', async () => {
    const { calls, deps } = harness();
    const res = await venuePreviewResponse(request('?venue=dv-01'), deps);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get(PREVIEW_HEADER), 'venue');
    assert.equal(res.headers.get('etag'), null);
    assert.equal(res.headers.get('content-length'), null);
    assert.equal(metaContent(body, 'property', 'og:title'), 'Wonderland Bar on SunStay');
    const [{ url, init }] = calls.fetch;
    const query = new URL(url);
    assert.equal(query.origin + query.pathname, 'https://example.supabase.co/rest/v1/venues');
    assert.equal(query.searchParams.get('id'), 'eq.dv-01');
    assert.equal(query.searchParams.get('select'), 'venueName,suburb,typeLabel,vibe');
    assert.equal(init.headers.apikey, 'anon-key');
    assert.equal(init.headers.authorization, undefined);
});

test('no venue in the link: Netlify carries on without the function', async () => {
    const { calls, deps } = harness();
    assert.equal(await venuePreviewResponse(request(''), deps), undefined);
    assert.equal(await venuePreviewResponse(request('?venue=%3Cx%3E'), deps), undefined);
    assert.deepEqual(calls, { next: 0, fetch: [] });
});

test('lookup problems serve the normal page with the general card', async () => {
    const cases = [
        [{ rows: [] }, 'not-found'],
        [{ rows: [{ venueName: '' }] }, 'not-found'],
        [{ status: 500, rows: { message: 'boom' } }, 'unavailable'],
        [{ fetchImpl: async () => { throw new TypeError('network'); } }, 'unavailable'],
        [{ fetchImpl: (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))) }, 'unavailable'],
        [{ env: {} }, 'unconfigured'],
    ];
    for (const [options, expected] of cases) {
        const { deps } = harness(options);
        const res = await venuePreviewResponse(request('?venue=dv-01'), deps);
        assert.equal(res.headers.get(PREVIEW_HEADER), expected, expected);
        assert.equal(await res.text(), html, expected);
        assert.equal(res.headers.get('etag'), '"abc"');
    }
});

test('non-page responses pass through untouched', async () => {
    for (const page of [new Response(null, { status: 304 }), new Response('{}', { headers: { 'content-type': 'application/json' } })]) {
        const { deps } = harness({ page });
        assert.equal(await venuePreviewResponse(request('?venue=dv-01'), deps), page);
    }
});
