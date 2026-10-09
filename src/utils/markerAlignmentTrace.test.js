import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MARKER_ALIGNMENT_THRESHOLD_PX,
    checkMarkerAlignment,
    getMarkerAlignmentTrace,
    isMarkerAlignmentTraceEnabled,
    parseMarkerTranslate,
    resetMarkerAlignmentTrace,
} from './markerAlignmentTrace.js';

function cameraMap(project) {
    return {
        project,
        getPitch: () => 45,
        getBearing: () => -17.6,
        getZoom: () => 15,
    };
}

function markerAt(lngLat, transform, generation) {
    return {
        generation,
        marker: { getLngLat: () => lngLat },
        el: { style: { transform } },
    };
}

describe('marker alignment trace', () => {
    it('stays off unless the diagnostic gate is passed', () => {
        resetMarkerAlignmentTrace();
        assert.equal(isMarkerAlignmentTraceEnabled(), false);
        let projected = 0;
        const result = checkMarkerAlignment(cameraMap(() => {
            projected += 1;
            return { x: 0, y: 0 };
        }), {
            'venue-1': markerAt({ lng: 144, lat: -37 }, 'translate(40px, 10px)', 2),
        });
        assert.equal(projected, 0);
        assert.deepEqual(result, { checked: 0, drifted: [] });
        assert.equal(getMarkerAlignmentTrace().last, '');
    });

    it('parses the projected translate and ignores the anchor offset', () => {
        assert.deepEqual(parseMarkerTranslate('translate(12.5px, -3px) translate(-8px, -16px)'), {
            x: 12.5,
            y: -3,
        });
        assert.deepEqual(parseMarkerTranslate('translate3d(4px, 9px, 0px)'), { x: 4, y: 9 });
        assert.equal(parseMarkerTranslate('none'), null);
        assert.equal(parseMarkerTranslate(''), null);
    });

    it('records only markers whose screen delta exceeds the threshold', () => {
        resetMarkerAlignmentTrace();
        const map = cameraMap((lngLat) => (
            lngLat.lng === 1 ? { x: 10, y: 20 } : { x: 100, y: 40 }
        ));
        const result = checkMarkerAlignment(map, {
            aligned: markerAt({ lng: 1, lat: 0 }, 'translate(11px, 20px)', 4),
            drifted: markerAt({ lng: 2, lat: 0 }, 'translate(108px, 40px)', 7),
        }, { trigger: 'zoomend', enabled: true });
        assert.equal(MARKER_ALIGNMENT_THRESHOLD_PX, 2);
        assert.equal(result.checked, 2);
        assert.equal(result.drifted.length, 1);
        assert.equal(result.drifted[0].id, 'drifted');
        assert.equal(result.drifted[0].dx, 8);
        assert.equal(result.drifted[0].dy, 0);
        assert.equal(result.drifted[0].zoom, 15);
        assert.equal(result.drifted[0].pitch, 45);
        assert.equal(result.drifted[0].bearing, -17.6);
        assert.equal(result.drifted[0].generation, 7);
        assert.equal(result.drifted[0].trigger, 'zoomend');
        assert.match(result.drifted[0].line, /align zoomend drifted dx=8 dy=0 z=15 p=45 b=-17.6 g=7/);
        assert.equal(getMarkerAlignmentTrace().events.length, 1);
    });

    it('keeps a missing generation visible and skips a marker project cannot read', () => {
        resetMarkerAlignmentTrace();
        const map = cameraMap((lngLat) => {
            if (lngLat.lng === 9) throw new Error('style is not done loading');
            return { x: 0, y: 0 };
        });
        const result = checkMarkerAlignment(map, [
            markerAt({ lng: 3, lat: 0 }, 'translate(5px, 0px)'),
            { id: 'broken', marker: { getLngLat: () => ({ lng: 9, lat: 0 }) }, el: { style: { transform: 'translate(0px, 0px)' } } },
            { marker: { getLngLat: () => ({ lng: 4, lat: 0 }) }, el: { style: {} } },
        ], { trigger: 'pitchend', enabled: true });
        assert.equal(result.drifted.length, 1);
        assert.equal(result.drifted[0].generation, null);
        assert.match(result.drifted[0].line, /align pitchend 0 dx=5 dy=0 .* g=-/);
        assert.equal(result.checked, 1);
    });

    it('does not throw when the map camera methods fail', () => {
        resetMarkerAlignmentTrace();
        const result = checkMarkerAlignment({
            project: () => ({ x: 0, y: 0 }),
            getPitch() { throw new Error('removed'); },
            getBearing() { throw new Error('removed'); },
            getZoom() { throw new Error('removed'); },
        }, {
            pin: markerAt({ lng: 1, lat: 2 }, 'translate3d(6px, -4px, 0px)', 1),
        }, { trigger: 'map-resize-end', enabled: true });
        assert.equal(result.drifted.length, 1);
        assert.equal(result.drifted[0].pitch, null);
        assert.equal(result.drifted[0].bearing, null);
        assert.equal(result.drifted[0].zoom, null);
        assert.match(result.drifted[0].line, /align map-resize-end pin dx=6 dy=-4 z=- p=- b=- g=1/);
    });
});
