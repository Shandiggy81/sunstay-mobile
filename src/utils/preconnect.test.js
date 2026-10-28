import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPBOX_API_ORIGIN, preconnectTags } from './preconnect.js';

const hrefs = tags => tags.map(tag => tag.attrs.href);

test('preconnects to Mapbox, and to Supabase when it is configured', () => {
    assert.deepEqual(hrefs(preconnectTags({ VITE_SUPABASE_URL: 'https://abc.supabase.co/' })), [MAPBOX_API_ORIGIN, 'https://abc.supabase.co']);
    assert.deepEqual(hrefs(preconnectTags({ VITE_SUPABASE_URL: 'https://abc.supabase.co/rest/v1' })), [MAPBOX_API_ORIGIN, 'https://abc.supabase.co']);
    for (const tag of preconnectTags({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })) {
        assert.deepEqual(tag.attrs, { rel: 'preconnect', href: tag.attrs.href, crossorigin: true });
        assert.equal(tag.tag, 'link');
    }
});

test('skips Supabase when it is missing, malformed or not https', () => {
    for (const value of [undefined, '', 'not a url', 'http://127.0.0.1:54321']) {
        assert.deepEqual(hrefs(preconnectTags({ VITE_SUPABASE_URL: value })), [MAPBOX_API_ORIGIN], String(value));
    }
    assert.deepEqual(hrefs(preconnectTags()), [MAPBOX_API_ORIGIN]);
});
