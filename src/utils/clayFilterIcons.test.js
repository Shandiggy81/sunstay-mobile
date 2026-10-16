import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CLAY_ICON_FOR_FILTER, clayIconFor, clayIconName, clayIconUrls } from './clayFilterIcons.js';
import { FILTER_CATEGORIES } from '../data/demoVenues.js';

const ASSET_DIR = new URL('../assets/clay/', import.meta.url);

describe('clay filter icons', () => {
    it('only maps real filter ids', () => {
        const ids = new Set(FILTER_CATEGORIES.map((f) => f.id));
        for (const id of Object.keys(CLAY_ICON_FOR_FILTER)) assert.ok(ids.has(id), `unknown filter id ${id}`);
    });

    it('points every mapped filter at an icon file that exists', () => {
        for (const name of Object.values(CLAY_ICON_FOR_FILTER)) {
            assert.ok(existsSync(new URL(`${name}.webp`, ASSET_DIR)), `missing ${name}.webp`);
        }
    });

    it('gives Brucey to pet-friendly and keeps emoji for unmapped filters', () => {
        assert.equal(clayIconName('Pet Friendly'), 'brucey');
        assert.equal(clayIconName('Cocktails'), null);
        assert.equal(clayIconName('toString'), null);
    });

    it('uses food clay icons and preserves the bakery, dessert and takeaway emoji', () => {
        assert.equal(clayIconName('all-cafes'), 'coffee');
        assert.equal(clayIconName('all-restaurants'), 'dining');
        assert.equal(clayIconName('all-pubs'), 'pint');
        assert.equal(clayIconName('all-cocktail-bars'), 'cocktail');
        for (const id of ['all-bakeries', 'all-desserts', 'all-takeaways']) {
            assert.equal(clayIconName(id), null);
        }
    });

    it('builds a name → url table from a Vite glob result', () => {
        const urls = clayIconUrls({
            '../assets/clay/sun.webp': '/assets/sun-abc.webp',
            '../assets/clay/readme.txt': '/x',
            '../assets/clay/bad.webp': 42,
        });
        assert.deepEqual(urls, { sun: '/assets/sun-abc.webp' });
        assert.equal(clayIconFor('Sunny', urls), '/assets/sun-abc.webp');
        assert.equal(clayIconFor('Hotel', urls), null);
        assert.equal(clayIconFor('Sunny', null), null);
    });
});
