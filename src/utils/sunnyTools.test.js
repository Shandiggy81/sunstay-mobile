import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseChatSunnyResponse,
    validateToolCall,
    applySunnyToolCalls,
    buildSunnyContext,
    toLlmMessages,
    postChatSunny,
} from './sunnyTools.js';

describe('validateToolCall', () => {
    it('accepts setTimeOfDay minutes in 0–1439 and rounds', () => {
        const call = validateToolCall('setTimeOfDay', { todMinutes: 1080.4 });
        assert.deepEqual(call, { name: 'setTimeOfDay', args: { todMinutes: 1080 } });
    });

    it('clamps setTimeOfDay outside the day and rejects non-numbers', () => {
        assert.equal(validateToolCall('setTimeOfDay', { todMinutes: 2000 }).args.todMinutes, 1439);
        assert.equal(validateToolCall('setTimeOfDay', { todMinutes: -12 }).args.todMinutes, 0);
        assert.equal(validateToolCall('setTimeOfDay', { todMinutes: 'noon' }), null);
        assert.equal(validateToolCall('setTimeOfDay', {}), null);
    });

    it('accepts setFilters string arrays and drops junk', () => {
        const call = validateToolCall('setFilters', {
            tags: ['Rooftop', '  ', 7, 'Pet Friendly', 'x'.repeat(80)],
        });
        assert.equal(call.name, 'setFilters');
        assert.deepEqual(call.args.tags, ['Rooftop', 'Pet Friendly']);
    });

    it('rejects setFilters when tags is not an array', () => {
        assert.equal(validateToolCall('setFilters', { tags: 'Rooftop' }), null);
        assert.equal(validateToolCall('setFilters', null), null);
    });

    it('accepts panToVenue with a non-empty id', () => {
        assert.deepEqual(
            validateToolCall('panToVenue', { venueId: 'dv-13' }),
            { name: 'panToVenue', args: { venueId: 'dv-13' } },
        );
        assert.equal(validateToolCall('panToVenue', { venueId: '  ' }), null);
        assert.equal(validateToolCall('panToVenue', { venueId: 13 }), null);
    });

    it('ignores unknown tool names', () => {
        assert.equal(validateToolCall('dropDatabase', {}), null);
    });
});

describe('parseChatSunnyResponse', () => {
    it('reads the stable { reply, toolCalls } contract', () => {
        const parsed = parseChatSunnyResponse({
            reply: 'Golden hour it is.',
            toolCalls: [
                { name: 'setTimeOfDay', args: { todMinutes: 1080 } },
                { name: 'panToVenue', args: { venueId: 'dv-13' } },
            ],
        });
        assert.equal(parsed.reply, 'Golden hour it is.');
        assert.equal(parsed.toolCalls.length, 2);
        assert.equal(parsed.toolCalls[0].name, 'setTimeOfDay');
        assert.equal(parsed.toolCalls[1].args.venueId, 'dv-13');
    });

    it('maps Gemini generateContent functionCall parts into the contract', () => {
        const parsed = parseChatSunnyResponse({
            candidates: [{
                content: {
                    parts: [
                        { text: 'Golden hour — sliding you over.' },
                        { functionCall: { name: 'setTimeOfDay', args: { todMinutes: 1080 } } },
                        { function_call: { name: 'panToVenue', args: { venueId: 'dv-13' } } },
                    ],
                },
            }],
        });
        assert.equal(parsed.reply, 'Golden hour — sliding you over.');
        assert.equal(parsed.toolCalls.length, 2);
        assert.deepEqual(parsed.toolCalls[0], { name: 'setTimeOfDay', args: { todMinutes: 1080 } });
        assert.deepEqual(parsed.toolCalls[1], { name: 'panToVenue', args: { venueId: 'dv-13' } });
    });

    it('parses OpenAI-style tool_calls and stringified arguments', () => {
        const parsed = parseChatSunnyResponse({
            choices: [{
                message: {
                    content: 'Pulling up Chin Chin.',
                    tool_calls: [
                        {
                            function: {
                                name: 'panToVenue',
                                arguments: '{"venueId":"dv-13"}',
                            },
                        },
                    ],
                },
            }],
        });
        assert.equal(parsed.reply, 'Pulling up Chin Chin.');
        assert.deepEqual(parsed.toolCalls, [
            { name: 'panToVenue', args: { venueId: 'dv-13' } },
        ]);
    });

    it('drops invalid tool calls and never throws on garbage', () => {
        assert.deepEqual(parseChatSunnyResponse(null), { reply: '', toolCalls: [] });
        assert.deepEqual(parseChatSunnyResponse('nope'), { reply: '', toolCalls: [] });
        const parsed = parseChatSunnyResponse({
            reply: 'Trying.',
            toolCalls: [
                { name: 'setTimeOfDay', args: { todMinutes: 'later' } },
                { name: 'setFilters', args: { tags: ['Shaded'] } },
            ],
        });
        assert.equal(parsed.toolCalls.length, 1);
        assert.equal(parsed.toolCalls[0].name, 'setFilters');
    });
});

describe('applySunnyToolCalls', () => {
    it('runs known tools and returns a soft note for unknown venues', () => {
        const calls = [];
        const notes = applySunnyToolCalls(
            [
                { name: 'setTimeOfDay', args: { todMinutes: 720 } },
                { name: 'setFilters', args: { tags: ['Rooftop'] } },
                { name: 'panToVenue', args: { venueId: 'missing' } },
            ],
            {
                setTimeOfDay: (n) => calls.push(['tod', n]),
                setFilters: (tags) => calls.push(['filters', tags]),
                panToVenue: () => false,
            },
        );
        assert.deepEqual(calls, [
            ['tod', 720],
            ['filters', ['Rooftop']],
        ]);
        assert.equal(notes.length, 1);
        assert.match(notes[0], /can't see that venue/i);
    });

    it('swallows handler throws', () => {
        assert.doesNotThrow(() => applySunnyToolCalls(
            [{ name: 'setTimeOfDay', args: { todMinutes: 1 } }],
            { setTimeOfDay: () => { throw new Error('boom'); } },
        ));
    });
});

describe('buildSunnyContext', () => {
    it('packs slider time, selected venue, and viewport rows without transcript text', () => {
        const ctx = buildSunnyContext({
            timeOfDay: 1080,
            activeVenue: { id: 'dv-13', venueName: 'Chin Chin', lat: -37.8, lng: 144.97, notes: 'secret' },
            visibleById: {
                'dv-13': {
                    id: 'dv-13',
                    name: 'Chin Chin',
                    lat: -37.81561,
                    lng: 144.97038,
                    effective_sun: 0.8,
                    effective_wind: 0.3,
                    sun_now: 0.7,
                    wind_shelter_score: 0.5,
                    comfort_hint: 'sun',
                    canyon_aspect_hw: 1.2,
                },
            },
        });
        assert.equal(ctx.timeOfDay, 1080);
        assert.equal(ctx.activeVenue.id, 'dv-13');
        assert.equal(ctx.activeVenue.name, 'Chin Chin');
        assert.equal(ctx.activeVenue.notes, undefined);
        assert.equal(ctx.visibleVenues.length, 1);
        assert.equal(ctx.visibleVenues[0].effective_sun, 0.8);
        assert.equal(ctx.visibleVenues[0].comfort_hint, 'sun');
    });
});

describe('toLlmMessages', () => {
    it('maps chat bubbles to user/assistant turns and skips empty text', () => {
        const messages = toLlmMessages([
            { type: 'bot', text: "G'day" },
            { type: 'user', text: 'Show me Chin Chin' },
            { type: 'bot', text: '' },
        ]);
        assert.deepEqual(messages, [
            { role: 'assistant', content: "G'day" },
            { role: 'user', content: 'Show me Chin Chin' },
        ]);
    });
});

describe('postChatSunny', () => {
    it('POSTs messages + hidden sunnyContext with Authorization and apikey', async () => {
        const calls = [];
        const fetchImpl = async (url, init) => {
            calls.push({ url, init });
            return {
                ok: true,
                json: async () => ({ reply: 'On it.', toolCalls: [] }),
            };
        };
        const result = await postChatSunny({
            supabaseUrl: 'https://example.supabase.co/',
            anonKey: 'anon-key',
            accessToken: 'user-jwt',
            messages: [{ role: 'user', content: 'golden hour' }],
            sunnyContext: { timeOfDay: 1080, activeVenue: null, visibleVenues: [] },
            fetchImpl,
        });
        assert.equal(result.ok, true);
        assert.equal(calls[0].url, 'https://example.supabase.co/functions/v1/chat-sunny');
        assert.equal(calls[0].init.headers.Authorization, 'Bearer user-jwt');
        assert.equal(calls[0].init.headers.apikey, 'anon-key');
        const body = JSON.parse(calls[0].init.body);
        assert.equal(body.sunnyContext.timeOfDay, 1080);
        assert.equal(body.messages[0].content, 'golden hour');
    });

    it('returns ok:false on network failure without throwing', async () => {
        const result = await postChatSunny({
            supabaseUrl: 'https://example.supabase.co',
            anonKey: 'anon-key',
            fetchImpl: async () => { throw new Error('offline'); },
        });
        assert.equal(result.ok, false);
        assert.equal(result.error, 'offline');
    });
});
