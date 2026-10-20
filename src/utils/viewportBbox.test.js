import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bboxFromLngLats, bboxMatchesContainer, viewportBboxFromCanvas } from './viewportBbox.js';

// The degenerate box reported from the deploy preview on an 875x303 canvas.
const STRIP = { minLng: 144.92588587491076, minLat: -37.82335698440894, maxLng: 145.0588662250821, maxLat: -37.82295443210467 };

// Top-down Web Mercator unprojection centred on the CBD, `metresPerPx` per css px.
function flatUnproject(width, height, metresPerPx, center = { lng: 144.9631, lat: -37.8136 }) {
    const degLatPerPx = metresPerPx / 111_320;
    const degLngPerPx = degLatPerPx / Math.cos((center.lat * Math.PI) / 180);
    return ([x, y]) => ({
        lng: center.lng + (x - width / 2) * degLngPerPx,
        lat: center.lat - (y - height / 2) * degLatPerPx,
    });
}

describe('bboxFromLngLats', () => {
    it('takes the extremes of array and object points', () => {
        assert.deepEqual(
            bboxFromLngLats([[145, -37.8], { lng: 144.9, lat: -37.9 }, [144.95, -37.7]]),
            { minLng: 144.9, minLat: -37.9, maxLng: 145, maxLat: -37.7 },
        );
    });

    it('returns null for no points or an unreadable one', () => {
        assert.equal(bboxFromLngLats([]), null);
        assert.equal(bboxFromLngLats(null), null);
        assert.equal(bboxFromLngLats([[145, -37.8], { lng: NaN, lat: -37.9 }]), null);
        assert.equal(bboxFromLngLats([[145, -37.8], undefined]), null);
    });
});

describe('bboxMatchesContainer', () => {
    it('rejects the 13 km x 45 m strip seen on an 875x303 canvas', () => {
        assert.equal(bboxMatchesContainer(STRIP, 875, 303), false);
    });

    it('accepts a box with the container aspect, including a tall phone map', () => {
        const wide = viewportBboxFromCanvas(875, 303, flatUnproject(875, 303, 15));
        assert.equal(bboxMatchesContainer(wide, 875, 303), true);
        const tall = viewportBboxFromCanvas(390, 700, flatUnproject(390, 700, 10));
        assert.equal(bboxMatchesContainer(tall, 390, 700), true);
    });

    it('accepts a pitched view, which is taller on the ground than the canvas', () => {
        const flat = viewportBboxFromCanvas(875, 303, flatUnproject(875, 303, 15));
        const pitched = { ...flat, maxLat: flat.maxLat + 2 * (flat.maxLat - flat.minLat) };
        assert.equal(bboxMatchesContainer(pitched, 875, 303), true);
    });

    it('rejects empty, inverted or unreadable boxes and a container without size', () => {
        const ok = { minLng: 144.9, minLat: -37.85, maxLng: 145, maxLat: -37.8 };
        assert.equal(bboxMatchesContainer(null, 875, 303), false);
        assert.equal(bboxMatchesContainer({ ...ok, maxLat: ok.minLat }, 875, 303), false);
        assert.equal(bboxMatchesContainer({ ...ok, maxLng: 144.8 }, 875, 303), false);
        assert.equal(bboxMatchesContainer({ ...ok, minLat: 'x' }, 875, 303), false);
        assert.equal(bboxMatchesContainer(ok, 0, 303), false);
        assert.equal(bboxMatchesContainer(ok, 875, NaN), false);
    });
});

describe('viewportBboxFromCanvas', () => {
    it('covers the whole canvas, whatever padding the camera keeps', () => {
        const bbox = viewportBboxFromCanvas(875, 303, flatUnproject(875, 303, 15));
        const heightM = (bbox.maxLat - bbox.minLat) * 111_320;
        assert.ok(Math.abs(heightM - 303 * 15) < 1, `height ${heightM} m`);
        assert.ok(bbox.minLat < -37.8136 && bbox.maxLat > -37.8136);
    });

    it('returns null for a canvas without size or a corner it cannot read', () => {
        const unproject = flatUnproject(875, 303, 15);
        assert.equal(viewportBboxFromCanvas(0, 303, unproject), null);
        assert.equal(viewportBboxFromCanvas(875, 0, unproject), null);
        assert.equal(viewportBboxFromCanvas(875, 303, null), null);
        assert.equal(viewportBboxFromCanvas(875, 303, () => ({ lng: NaN, lat: NaN })), null);
    });

    it('returns null when the corners collapse into a strip', () => {
        const strip = ([x, y]) => ({ lng: 144.92 + x * 0.00015, lat: -37.8233 + y * 0.0000001 });
        assert.equal(viewportBboxFromCanvas(875, 303, strip), null);
    });
});
