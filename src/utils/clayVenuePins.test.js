import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoVenues } from '../data/demoVenues.js';
import { CLAY_PIN_ICON_NAMES, clayPinUrlFor, clayPinUrls, pinIconName } from './clayVenuePins.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const byName = (name) => demoVenues.find((v) => v.venueName === name);

describe('clay venue pins', () => {
    it('has a 96px pin copy and a full-size original for every mapped icon', () => {
        assert.ok(CLAY_PIN_ICON_NAMES.length > 0);
        for (const name of CLAY_PIN_ICON_NAMES) {
            assert.ok(existsSync(join(root, 'src/assets/clay/pins', `${name}.webp`)), `pins/${name}.webp`);
            assert.ok(existsSync(join(root, 'src/assets/clay', `${name}.webp`)), `${name}.webp`);
        }
    });

    it('maps representative demo venues', () => {
        const expected = {
            'Dick Whittington Tavern': 'pint',
            'The Great Britain Hotel': 'garden-table',
            'The Emerson Rooftop': 'rooftop-bar',
            'Naked for Satan': 'rooftop-bar',
            'The Vineyard': 'wine',
            'Industry Beans Fitzroy': 'coffee',
            'The Boatbuilders Yard': 'waterfront',
            'Stokehouse': 'beach',
            'Elwood Bathers': 'beach',
            'Grand Hyatt Melbourne': 'hotel-views',
            'The Corner Hotel': 'live-music',
            'CQ City Bar': 'fireplace',
            'Royal Standard Hotel': 'pint',
            'Good Heavens Rooftop': 'cocktail',
            'La La Land Windsor': 'cocktail',
            'Chin Chin': 'dining',
            'Borsch, Vodka & Tears': 'dining',
            'The Standard': 'botanical',
            'The Grace Darling Hotel': 'heritage',
            'Welcome to Thornbury': 'food-truck',
            'Union Hotel': 'pint',
        };
        for (const [venueName, icon] of Object.entries(expected)) {
            const venue = byName(venueName);
            assert.ok(venue, `${venueName} is in demoVenues`);
            assert.equal(pinIconName(venue), icon, venueName);
        }
    });

    it('covers 47 of the 48 demo venues; the rest keep their emoji', () => {
        const keep = demoVenues.filter((v) => pinIconName(v) === null).map((v) => v.venueName).sort();
        assert.equal(demoVenues.length, 48);
        assert.deepEqual(keep, ['Pause Bar']);
    });

    it('maps cocktail, dining, botanical, heritage, food-truck and pool-table emoji', () => {
        assert.equal(pinIconName({ emoji: '🍸' }), 'cocktail');
        assert.equal(pinIconName({ emoji: '🍹' }), 'cocktail');
        assert.equal(pinIconName({ emoji: '🌿' }), 'botanical');
        assert.equal(pinIconName({ emoji: '🌳' }), 'botanical');
        assert.equal(pinIconName({ emoji: '🏛️' }), 'heritage');
        assert.equal(pinIconName({ emoji: '🚚' }), 'food-truck');
        assert.equal(pinIconName({ emoji: '🎱' }), 'pool-table');
        assert.equal(pinIconName({ typeLabel: 'Botanic Gardens Kiosk' }), 'botanical');
        assert.equal(pinIconName({ typeLabel: 'Pool Hall & Bar' }), 'pool-table');
        assert.equal(pinIconName({ typeLabel: 'Pub & Restaurant' }), 'pint', 'pub beats restaurant');
        assert.equal(pinIconName({ typeLabel: 'Waterfront Restaurant' }), 'waterfront');
    });

    it('prefers typeLabel, then emoji, then tags, case-insensitively', () => {
        assert.equal(pinIconName({ typeLabel: 'WATERFRONT PUB', emoji: '🍺' }), 'waterfront');
        assert.equal(pinIconName({ typeLabel: 'Cocktail Lounge Bar', emoji: '🍺' }), 'cocktail');
        assert.equal(pinIconName({ typeLabel: 'Wine Lounge', emoji: '🍺' }), 'wine');
        assert.equal(pinIconName({ typeLabel: 'Cosy Lounge', emoji: '🍷' }), 'indoor-warmth');
        assert.equal(pinIconName({ emoji: '🏖️' }), 'beach', 'variation selector is ignored');
        assert.equal(pinIconName({ emoji: '🥟', tags: ['Sunny', 'ROOFTOP'] }), 'rooftop-bar');
    });

    it('ignores feature tags, so venues matched only by them keep their emoji', () => {
        assert.equal(pinIconName({ emoji: '🥟', tags: ['Cozy', 'Indoor Warmth', 'Live Music'] }), null);
        assert.equal(pinIconName({ emoji: '🥨', tags: ['Specialty Coffee', 'Craft Beer', 'Fireplace'] }), null);
    });

    it('returns null for no match, unknown keys and prototype names', () => {
        assert.equal(pinIconName({ emoji: '🧘', tags: ['Sunny'] }), null);
        assert.equal(pinIconName({ emoji: 'toString', tags: ['constructor', '__proto__', 'hasOwnProperty'] }), null);
        assert.equal(pinIconName({ typeLabel: 42, emoji: null, tags: 'Rooftop' }), null);
        assert.equal(pinIconName(null), null);
        assert.equal(pinIconName('Rooftop'), null);
    });

    it('turns an import.meta.glob result into URLs and falls back to null', () => {
        const urls = clayPinUrls({
            '../assets/clay/pins/pint.webp': '/assets/pint-abc123.webp',
            '../assets/clay/pins/wine.webp': 'data:image/webp;base64,AAAA',
        });
        assert.equal(clayPinUrlFor(byName('Dick Whittington Tavern'), urls), '/assets/pint-abc123.webp');
        assert.equal(clayPinUrlFor(byName('The Vineyard'), urls), 'data:image/webp;base64,AAAA');
        assert.equal(clayPinUrlFor(byName('Stokehouse'), urls), null, 'missing file → emoji');
        assert.equal(clayPinUrlFor(byName('Pause Bar'), urls), null);
        assert.equal(clayPinUrlFor({ emoji: 'toString' }, { toString: '/x.webp' }), null);
    });
});
