import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_MODEL,
    GEMINI_MODEL_FALLBACKS,
    followUpAfterToolsBody,
    generationConfigFor,
    geminiDiagnostics,
    geminiModelChain,
    textOnlyRetryBody,
    shouldTryNextModel,
} from '../../supabase/functions/chat-sunny/geminiModels.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('geminiModelChain', () => {
    it('defaults to current Gemini 3 models, with the flash alias last', () => {
        assert.equal(DEFAULT_MODEL, 'gemini-3.8-flash');
        assert.deepEqual(GEMINI_MODEL_FALLBACKS, [
            'gemini-3.8-flash',
            'gemini-3.5-flash-lite',
            'gemini-3.6-flash',
            'gemini-flash-latest',
        ]);
        assert.deepEqual(geminiModelChain(), GEMINI_MODEL_FALLBACKS);
        assert.deepEqual(geminiModelChain('gemini-3.8-flash'), GEMINI_MODEL_FALLBACKS);
    });

    it('no longer tries the retired 2.x and 1.5 models', () => {
        for (const m of geminiModelChain()) assert.doesNotMatch(m, /^gemini-(1\.5|2\.0|2\.5)-/, m);
    });

    it('puts GEMINI_MODEL first and still tries fallbacks for retired ids', () => {
        assert.deepEqual(geminiModelChain('gemini-2.5-flash'), [
            'gemini-2.5-flash',
            ...GEMINI_MODEL_FALLBACKS,
        ]);
    });
});

describe('shouldTryNextModel', () => {
    it('moves on for retired ids and overload, not on 429 quota or bad requests', () => {
        assert.equal(shouldTryNextModel(404, null), true);
        assert.equal(
            shouldTryNextModel(400, { error: { message: 'gemini-2.5-flash is no longer available to new users' } }),
            true,
        );
        assert.equal(shouldTryNextModel(503, { error: { message: 'This model is currently experiencing high demand.' } }), true);
        assert.equal(shouldTryNextModel(503, null), true);
        assert.equal(shouldTryNextModel(500, null), true);
        assert.equal(
            shouldTryNextModel(429, { error: { message: 'You exceeded your current quota' } }),
            false,
        );
        assert.equal(shouldTryNextModel(400, { error: { message: 'Invalid JSON payload received.' } }), false);
        assert.equal(shouldTryNextModel(403, null), false);
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
    const opts = { temperature: 0.4, maxOutputTokens: 2048 };
    it('asks Gemini 3 Flash models for minimal thinking and leaves temperature at its default', () => {
        for (const m of ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview']) {
            assert.deepEqual(generationConfigFor(m, opts), { max_output_tokens: 2048, thinking_config: { thinking_level: 'minimal' } }, m);
        }
    });
    it('uses low for 3.8 Flash, whose lowest level is low', () => {
        assert.deepEqual(generationConfigFor('gemini-3.8-flash', opts), { max_output_tokens: 2048, thinking_config: { thinking_level: 'low' } });
    });
    it('still switches thinking off for 2.5 Flash when set by GEMINI_MODEL', () => {
        for (const m of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-preview-09-2025']) {
            assert.deepEqual(generationConfigFor(m, opts), { temperature: 0.4, max_output_tokens: 2048, thinking_config: { thinking_budget: 0 } }, m);
        }
    });
    it('sends no thinking setting to the alias or unknown models', () => {
        for (const m of ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-pro', '', undefined]) {
            assert.deepEqual(generationConfigFor(m, opts), { temperature: 0.4, max_output_tokens: 2048 }, String(m));
        }
    });
    it('never sends thinking_level and thinking_budget together, and caps every model', () => {
        for (const m of geminiModelChain('gemini-2.5-flash')) {
            const c = generationConfigFor(m, opts);
            assert.equal(c.max_output_tokens, 2048, m);
            assert.ok(!(c.thinking_config?.thinking_level && 'thinking_budget' in c.thinking_config), m);
        }
    });
});

describe('chat-sunny output cap', () => {
    it('leaves room for a reply after thinking', () => {
        const src = readFileSync(join(root, 'supabase/functions/chat-sunny/limits.js'), 'utf8');
        const cap = Number(src.match(/MAX_OUTPUT_TOKENS = (\d+)/)?.[1]);
        assert.ok(cap >= 1024 && cap <= 4096, String(cap));
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

describe('follow-up after tool calls', () => {
    const body = {
        system_instruction: { parts: [{ text: 'prompt' }] },
        contents: [{ role: 'user', parts: [{ text: 'hidden bars?' }] }],
        tools: [{ function_declarations: [] }],
        tool_config: { function_calling_config: { mode: 'AUTO' } },
        generation_config: { max_output_tokens: 2048 },
    };
    const modelContent = {
        role: 'model',
        parts: [
            { functionCall: { name: 'setFilters', args: { tags: ['Hidden gem'] } }, thoughtSignature: 'sig-1' },
            { functionCall: { name: 'panToVenue', args: { venueId: 'v1' }, id: 'call-2' } },
            { functionCall: { name: 'panToVenue', args: { venueId: 'gone' } } },
        ],
    };
    const names = new Map([['v1', 'Berlin Bar']]);
    it('returns the model turn verbatim, answers every call in order, and turns tools off', () => {
        const f = followUpAfterToolsBody(body, modelContent, (id) => names.get(id));
        assert.equal(f.contents.length, 3);
        assert.deepEqual(f.contents[1], { role: 'model', parts: modelContent.parts }, 'thought signatures kept');
        assert.deepEqual(f.contents[2].parts.map((p) => p.functionResponse), [
            { name: 'setFilters', response: { ok: true } },
            { name: 'panToVenue', response: { shown: true, venue: 'Berlin Bar' }, id: 'call-2' },
            { name: 'panToVenue', response: { shown: false } },
        ]);
        assert.equal(f.tool_config.function_calling_config.mode, 'NONE');
        assert.match(f.system_instruction.parts.at(-1).text, /name the venues you picked/);
        assert.deepEqual(f.generation_config, body.generation_config);
        assert.equal(body.contents.length, 1, 'original untouched');
    });
    it('returns null when there were no calls', () => {
        assert.equal(followUpAfterToolsBody(body, { parts: [{ text: 'hi' }] }), null);
        assert.equal(followUpAfterToolsBody(body, null), null);
    });
    it('chat-sunny asks for the reply after tool-only answers', () => {
        const src = readFileSync(join(root, 'supabase/functions/chat-sunny/index.ts'), 'utf8');
        assert.match(src, /followUpAfterToolsBody\(/);
        assert.match(src, /chat-sunny follow-up empty/);
    });
});
