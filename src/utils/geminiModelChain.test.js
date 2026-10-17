import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_MODEL,
    GEMINI_MODEL_FALLBACKS,
    generationConfigFor,
    geminiDiagnostics,
    geminiModelChain,
    textOnlyRetryBody,
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

describe('generationConfigFor', () => {
    const opts = { temperature: 0.4, maxOutputTokens: 512 };
    it('switches thinking off for 2.5 Flash, so thinking cannot eat the reply budget', () => {
        for (const m of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-preview-09-2025']) {
            assert.deepEqual(generationConfigFor(m, opts), { temperature: 0.4, max_output_tokens: 512, thinking_config: { thinking_budget: 0 } }, m);
        }
    });
    it('sends no thinking_config to models that may not accept it', () => {
        for (const m of ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest', 'gemini-2.5-pro', '', undefined]) {
            assert.deepEqual(generationConfigFor(m, opts), { temperature: 0.4, max_output_tokens: 512 }, String(m));
        }
    });
    it('covers every model in the fallback chain', () => {
        for (const m of geminiModelChain()) assert.equal(generationConfigFor(m, opts).max_output_tokens, 512);
    });
});

describe('chat-sunny sends the per-model generation config', () => {
    it('builds generation_config with generationConfigFor inside the model loop', () => {
        const src = readFileSync(join(root, 'supabase/functions/chat-sunny/index.ts'), 'utf8');
        assert.match(src, /generation_config: generationConfigFor\(model,/);
        assert.doesNotMatch(src, /generation_config: \{ temperature/);
    });
});

describe('empty-reply handling', () => {
    it('reads finish reason, block reason and usage for the log', () => {
        const d = geminiDiagnostics({ candidates: [{ finishReason: 'MALFORMED_FUNCTION_CALL', finishMessage: 'x' }], usageMetadata: { totalTokenCount: 900 } });
        assert.deepEqual(d, { finishReason: 'MALFORMED_FUNCTION_CALL', finishMessage: 'x', blockReason: null, usage: { totalTokenCount: 900 } });
        assert.deepEqual(geminiDiagnostics(null), { finishReason: null, finishMessage: null, blockReason: null, usage: null });
        assert.equal(geminiDiagnostics({ promptFeedback: { blockReason: 'SAFETY' } }).blockReason, 'SAFETY');
    });
    it('retries text-only: tools off, picks named in the reply, context and settings kept', () => {
        const body = {
            system_instruction: { parts: [{ text: 'prompt' }, { text: 'context' }] },
            contents: [{ role: 'user', parts: [{ text: 'near 3141?' }] }],
            tools: [{ function_declarations: [] }],
            tool_config: { function_calling_config: { mode: 'AUTO' } },
            generation_config: { temperature: 0.4, max_output_tokens: 512 },
        };
        const r = textOnlyRetryBody(body);
        assert.equal(r.tool_config.function_calling_config.mode, 'NONE');
        assert.equal(r.system_instruction.parts.length, 3);
        assert.deepEqual(r.system_instruction.parts.slice(0, 2), body.system_instruction.parts);
        assert.match(r.system_instruction.parts[2].text, /name up to 3 venues/);
        assert.deepEqual(r.contents, body.contents);
        assert.deepEqual(r.generation_config, body.generation_config);
        assert.equal(body.tool_config.function_calling_config.mode, 'AUTO', 'original untouched');
    });
    it('chat-sunny retries once when Gemini returns nothing', () => {
        const src = readFileSync(join(root, 'supabase/functions/chat-sunny/index.ts'), 'utf8');
        assert.match(src, /chat-sunny empty reply/);
        assert.match(src, /textOnlyRetryBody\(requestBody\)/);
    });
});
