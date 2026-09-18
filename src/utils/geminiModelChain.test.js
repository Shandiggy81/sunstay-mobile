import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_MODEL,
    GEMINI_MODEL_FALLBACKS,
    geminiModelChain,
    shouldTryNextModel,
} from '../../supabase/functions/chat-sunny/geminiModels.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('geminiModelChain', () => {
    it('defaults to gemini-2.5-flash then the free-tier fallbacks', () => {
        assert.equal(DEFAULT_MODEL, 'gemini-2.5-flash');
        assert.deepEqual(GEMINI_MODEL_FALLBACKS, [
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.0-flash',
            'gemini-flash-latest',
            'gemini-1.5-flash',
        ]);
        assert.deepEqual(geminiModelChain(), GEMINI_MODEL_FALLBACKS);
        assert.deepEqual(geminiModelChain('gemini-2.5-flash'), GEMINI_MODEL_FALLBACKS);
    });

    it('puts GEMINI_MODEL first and still tries fallbacks for retired ids', () => {
        assert.deepEqual(geminiModelChain('gemini-3.6-flash'), [
            'gemini-3.6-flash',
            ...GEMINI_MODEL_FALLBACKS,
        ]);
    });
});

describe('shouldTryNextModel', () => {
    it('retries on 404 / retired model ids, not on 429 billing', () => {
        assert.equal(shouldTryNextModel(404, null), true);
        assert.equal(
            shouldTryNextModel(400, { error: { message: 'gemini-2.5-flash is no longer available to new users' } }),
            true,
        );
        assert.equal(
            shouldTryNextModel(429, { error: { message: 'You exceeded your current quota' } }),
            false,
        );
    });
});

describe('chat-sunny Gemini contract', () => {
    const src = readFileSync(join(root, 'supabase/functions/chat-sunny/index.ts'), 'utf8');

    it('uses generateContent REST with GEMINI_API_KEY alias GOOGLE_API_KEY', () => {
        assert.match(src, /generativelanguage\.googleapis\.com\/v1beta\/models\/\$\{encodeURIComponent\(model\)\}:generateContent/);
        assert.match(src, /Deno\.env\.get\('GEMINI_API_KEY'\) \|\| Deno\.env\.get\('GOOGLE_API_KEY'\)/);
        assert.match(src, /x-goog-api-key/);
        assert.doesNotMatch(src, /OPENAI_API_KEY/);
        assert.doesNotMatch(src, /api\.openai\.com/);
    });

    it('declares the same tools as sunnyTools.js', () => {
        assert.match(src, /name: 'setTimeOfDay'/);
        assert.match(src, /todMinutes:/);
        assert.match(src, /name: 'setFilters'/);
        assert.match(src, /tags:/);
        assert.match(src, /name: 'panToVenue'/);
        assert.match(src, /venueId:/);
        assert.match(src, /body\?\.sunnyContext/);
        assert.match(src, /return json\(contract\)/);
    });
});
