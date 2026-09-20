import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    ISOLATION_EVENT_KINDS,
    classifyMapboxErrorMessage,
    clipIsolationText,
    getIsolationContext,
    getIsolationEvents,
    logIsolationEvent,
    logReactRenderError,
    resetIsolationLog,
    setIsolationContext,
} from './iosCrashLog.js';

afterEach(() => {
    resetIsolationLog();
});

describe('classifyMapboxErrorMessage', () => {
    it('does not treat blur or a white/blank screen as WebGL context loss', () => {
        assert.equal(classifyMapboxErrorMessage('map is blurred'), ISOLATION_EVENT_KINDS.MAPBOX_ERROR);
        assert.equal(classifyMapboxErrorMessage('white screen'), ISOLATION_EVENT_KINDS.MAPBOX_ERROR);
        assert.equal(classifyMapboxErrorMessage('blank map'), ISOLATION_EVENT_KINDS.MAPBOX_ERROR);
        assert.equal(classifyMapboxErrorMessage('white map overlay'), ISOLATION_EVENT_KINDS.MAPBOX_ERROR);
    });

    it('classifies WebGL context loss only from an actual context-lost signal', () => {
        assert.equal(
            classifyMapboxErrorMessage('webglcontextlost'),
            ISOLATION_EVENT_KINDS.MAPBOX_WEBGL_CONTEXT_LOST,
        );
        assert.equal(
            classifyMapboxErrorMessage('WebGL context lost'),
            ISOLATION_EVENT_KINDS.MAPBOX_WEBGL_CONTEXT_LOST,
        );
    });

    it('distinguishes style and tile failures from generic Mapbox errors', () => {
        assert.equal(
            classifyMapboxErrorMessage('Failed to load style'),
            ISOLATION_EVENT_KINDS.MAPBOX_STYLE_ERROR,
        );
        assert.equal(
            classifyMapboxErrorMessage('style.load failed'),
            ISOLATION_EVENT_KINDS.MAPBOX_STYLE_ERROR,
        );
        assert.equal(
            classifyMapboxErrorMessage('Failed to load tile 12/2048/2048'),
            ISOLATION_EVENT_KINDS.MAPBOX_TILE_ERROR,
        );
        assert.equal(
            classifyMapboxErrorMessage('source tiles timed out'),
            ISOLATION_EVENT_KINDS.MAPBOX_TILE_ERROR,
        );
        assert.equal(
            classifyMapboxErrorMessage('401 access token'),
            ISOLATION_EVENT_KINDS.MAPBOX_ERROR,
        );
    });
});

describe('isolation event log', () => {
    it('stores only small strings for route, venue, tab, and map lifecycle', () => {
        setIsolationContext({
            route: '/explore?q=railway',
            venue: 'Railway Hotel',
            tab: 'Sun Forecast',
            mapEvent: 'load',
        });
        const event = logIsolationEvent({
            kind: ISOLATION_EVENT_KINDS.MAP_LIFECYCLE,
            message: 'load',
            source: 'VenueMap',
        });

        const ctx = getIsolationContext();
        assert.equal(ctx.route, '/explore?q=railway');
        assert.equal(ctx.venue, 'Railway Hotel');
        assert.equal(ctx.tab, 'Sun Forecast');
        assert.equal(ctx.mapEvent, 'load');
        assert.equal(event.kind, ISOLATION_EVENT_KINDS.MAP_LIFECYCLE);
        assert.equal(event.message, 'load');
        assert.equal(event.source, 'VenueMap');
        assert.equal(getIsolationEvents().length, 1);
        assert.equal(typeof event.at, 'string');
    });

    it('clips oversized text and never JSON-serializes objects into the log', () => {
        const huge = 'x'.repeat(400);
        const payload = { hourly: Array.from({ length: 48 }, (_, i) => ({ i, temp: 19 })) };
        const event = logIsolationEvent({
            kind: ISOLATION_EVENT_KINDS.MAPBOX_ERROR,
            message: huge,
            source: payload,
        });

        assert.ok(event.message.length <= 160);
        assert.equal(event.message, clipIsolationText(huge));
        assert.equal(event.source, '[object]');
        assert.equal(JSON.stringify(getIsolationEvents()).includes('"hourly"'), false);
        assert.equal(JSON.stringify(getIsolationEvents()).includes('"temp"'), false);
    });

    it('keeps only the most recent events', () => {
        for (let i = 0; i < 30; i += 1) {
            logIsolationEvent({
                kind: ISOLATION_EVENT_KINDS.LAYOUT_OR_LOADING,
                message: `event-${i}`,
                source: 'test',
            });
        }
        const events = getIsolationEvents();
        assert.equal(events.length, 20);
        assert.equal(events[0].message, 'event-10');
        assert.equal(events.at(-1).message, 'event-29');
    });
});

describe('react and page probes', () => {
    it('logs React render errors as classified events, not Mapbox context loss', () => {
        const event = logReactRenderError(new Error('VenueCard exploded'), 'VenueDetailErrorBoundary');
        assert.equal(event.kind, ISOLATION_EVENT_KINDS.REACT_RENDER_ERROR);
        assert.equal(event.message, 'VenueCard exploded');
        assert.equal(event.source, 'VenueDetailErrorBoundary');
        assert.notEqual(event.kind, ISOLATION_EVENT_KINDS.MAPBOX_WEBGL_CONTEXT_LOST);
    });
});
