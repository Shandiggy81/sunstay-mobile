import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_CONTEXT_CHARS,
    MAX_MESSAGE_CHARS,
    MAX_TURNS,
    RATE_LIMITS,
    clientKey,
    createRateLimiter,
    payloadLimitError,
} from '../../supabase/functions/chat-sunny/limits.js';
import { buildSunnyContext, toLlmMessages } from './sunnyTools.js';

const headers = (entries) => new Map(Object.entries(entries));

describe('chat-sunny clientKey', () => {
    it('uses the first x-forwarded-for hop', () => {
        assert.equal(clientKey(headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '203.0.113.7');
    });

    it('falls back to cf-connecting-ip, x-real-ip, then a shared bucket', () => {
        assert.equal(clientKey(headers({ 'cf-connecting-ip': '198.51.100.2' })), '198.51.100.2');
        assert.equal(clientKey(headers({ 'x-real-ip': '198.51.100.3' })), '198.51.100.3');
        assert.equal(clientKey(headers({})), 'unknown');
        assert.equal(clientKey(null), 'unknown');
    });
});

describe('chat-sunny payloadLimitError', () => {
    it('accepts the largest payload the app can build', () => {
        const venues = Array.from({ length: 60 }, (_, i) => ({
            id: `dv-${i}-${'x'.repeat(20)}`,
            name: `A Very Long Melbourne Rooftop Bar Name Number ${i}`,
            lat: -37.8136 + i / 1000,
            lng: 144.9631 + i / 1000,
            sun_score_annual: 0.123456789,
            sun_now: 0.987654321,
            wind_shelter_score: 0.5555555,
            comfort_hint: 'sunny_breezy',
            canyon_aspect_hw: 0.4444444,
            geometry_confidence: 0.3333333,
        }));
        const sunnyContext = buildSunnyContext({ timeOfDay: 720, activeVenue: venues[0], visibleById: venues });
        const bubbles = Array.from({ length: 30 }, (_, i) => ({
            type: i % 2 ? 'assistant' : 'user',
            text: 'y'.repeat(5000),
        }));
        const messages = toLlmMessages(bubbles);

        assert.ok(JSON.stringify(sunnyContext).length < MAX_CONTEXT_CHARS);
        assert.equal(payloadLimitError({ messages, sunnyContext }), null);
    });

    it('rejects over-limit input instead of trimming it', () => {
        const ok = { role: 'user', content: 'hi' };
        assert.equal(payloadLimitError({ messages: Array(MAX_TURNS + 1).fill(ok) }), 'too_many_messages');
        assert.equal(
            payloadLimitError({ messages: [{ role: 'user', content: 'z'.repeat(MAX_MESSAGE_CHARS + 1) }] }),
            'message_too_long',
        );
        assert.equal(payloadLimitError({ sunnyContext: { blob: 'c'.repeat(MAX_CONTEXT_CHARS) } }), 'context_too_large');
        assert.equal(payloadLimitError({ messages: 'not-an-array' }), 'invalid_messages');
        assert.equal(payloadLimitError({}), null);
    });
});

describe('chat-sunny createRateLimiter', () => {
    it('allows the per-client minute budget, then reports when to retry', () => {
        const limiter = createRateLimiter();
        const t0 = 1_000_000;
        for (let i = 0; i < RATE_LIMITS.perClientPerMinute; i += 1) {
            assert.equal(limiter.check('a', t0 + i).ok, true);
        }
        const blocked = limiter.check('a', t0 + 1000);
        assert.equal(blocked.ok, false);
        assert.equal(blocked.retryAfterSec, 59);
        assert.equal(limiter.check('b', t0 + 1000).ok, true, 'other clients are unaffected');
        assert.equal(limiter.check('a', t0 + 60_000).ok, true, 'window slides');
    });

    it('enforces the hourly per-client budget', () => {
        const limiter = createRateLimiter({ perClientPerMinute: 100, perClientPerHour: 3, perInstancePerMinute: 100 });
        const t0 = 5_000_000;
        assert.equal(limiter.check('a', t0).ok, true);
        assert.equal(limiter.check('a', t0 + 120_000).ok, true);
        assert.equal(limiter.check('a', t0 + 240_000).ok, true);
        const blocked = limiter.check('a', t0 + 300_000);
        assert.equal(blocked.ok, false);
        assert.equal(blocked.retryAfterSec, 3300);
        assert.equal(limiter.check('a', t0 + 3_600_000).ok, true);
    });

    it('caps total calls per instance across clients', () => {
        const limiter = createRateLimiter({ perClientPerMinute: 10, perClientPerHour: 60, perInstancePerMinute: 3 });
        const t0 = 9_000_000;
        assert.equal(limiter.check('a', t0).ok, true);
        assert.equal(limiter.check('b', t0).ok, true);
        assert.equal(limiter.check('c', t0).ok, true);
        assert.equal(limiter.check('d', t0).ok, false);
    });

    it('does not count rejected attempts against the client', () => {
        const limiter = createRateLimiter({ perClientPerMinute: 1, perClientPerHour: 60, perInstancePerMinute: 100 });
        const t0 = 2_000_000;
        assert.equal(limiter.check('a', t0).ok, true);
        assert.equal(limiter.check('a', t0 + 10).ok, false);
        assert.equal(limiter.check('a', t0 + 60_000).ok, true);
    });
});
