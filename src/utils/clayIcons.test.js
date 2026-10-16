import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feelsLikeIconName, forecastKindIconName, venueIcon, venueIconName, weatherIconName } from './clayIcons.js';
import { venueOfferings } from './venueOfferings.js';
import { demoVenues } from '../data/demoVenues.js';

const clayDir = join(dirname(fileURLToPath(import.meta.url)), '../assets/clay');
const hasIcon = (name) => existsSync(join(clayDir, `${name}.webp`));

describe('weatherIconName', () => {
    it('maps WMO codes to clay icons', () => {
        assert.equal(weatherIconName(0), 'sun');
        assert.equal(weatherIconName(1), 'sun');
        assert.equal(weatherIconName(2), 'sun-cloud');
        assert.equal(weatherIconName(3), 'cloud');
        assert.equal(weatherIconName(45), 'fog');
        assert.equal(weatherIconName(53), 'sun-shower');
        assert.equal(weatherIconName(63), 'rain');
        assert.equal(weatherIconName(81), 'sun-shower');
        assert.equal(weatherIconName(73), 'frost');
        assert.equal(weatherIconName(95), 'thunderstorm');
    });

    it('uses night icons after dark', () => {
        assert.equal(weatherIconName(0, { isNight: true }), 'night');
        assert.equal(weatherIconName(2, { isNight: true }), 'night');
        assert.equal(weatherIconName(81, { isNight: true }), 'rain');
        assert.equal(weatherIconName(3, { isNight: true }), 'cloud');
    });

    it('falls back for missing or odd codes', () => {
        assert.equal(weatherIconName(null), 'sun-cloud');
        assert.equal(weatherIconName(undefined, { isNight: true }), 'night');
        assert.equal(weatherIconName('2'), 'sun-cloud');
        assert.equal(weatherIconName('nope'), 'sun-cloud');
    });

    it('only names icons that exist', () => {
        const names = new Set();
        for (let c = 0; c <= 99; c += 1) {
            names.add(weatherIconName(c));
            names.add(weatherIconName(c, { isNight: true }));
        }
        for (const kind of ['sun', 'cloud', 'rain', 'night', 'shaded', 'day', 'unknown']) names.add(forecastKindIconName(kind));
        names.add(feelsLikeIconName(5));
        names.add(feelsLikeIconName(25));
        for (const name of names) assert.ok(hasIcon(name), `${name}.webp`);
    });
});

describe('feelsLikeIconName and forecastKindIconName', () => {
    it('suggests a jacket when it feels cool', () => {
        assert.equal(feelsLikeIconName(10), 'jacket');
        assert.equal(feelsLikeIconName(15.9), 'jacket');
        assert.equal(feelsLikeIconName(16), 'thermometer');
        assert.equal(feelsLikeIconName(null), 'thermometer');
    });

    it('maps forecast kinds', () => {
        assert.equal(forecastKindIconName('sun'), 'sun');
        assert.equal(forecastKindIconName('shaded'), 'shaded');
        assert.equal(forecastKindIconName('unknown'), 'sun-cloud');
        assert.equal(forecastKindIconName('toString'), 'sun-cloud');
    });
});

describe('venueIconName', () => {
    it('uses the pin icon and falls back to a clay map pin', () => {
        assert.equal(venueIconName({ typeLabel: 'Rooftop Bar' }), 'rooftop-bar');
        assert.equal(venueIconName({ emoji: '🧘' }), 'map-pin');
        assert.equal(venueIconName(null), 'map-pin');
        for (const venue of demoVenues) assert.ok(hasIcon(venueIconName(venue)), venue.venueName);
    });
});

describe('venueIcon', () => {
    it('shows the clay icon, else the venue emoji like its map pin, else a clay map pin', () => {
        assert.deepEqual(venueIcon({ typeLabel: 'Cafe', emoji: '☕' }), { name: 'coffee' });
        assert.deepEqual(venueIcon({ typeLabel: 'Restaurant', emoji: '🍽️' }), { name: 'dining' });
        assert.deepEqual(venueIcon({ typeLabel: 'Takeaway', emoji: '🥡' }), { emoji: '🥡' });
        assert.deepEqual(venueIcon({ typeLabel: 'Gelato & dessert', emoji: '🍨' }), { emoji: '🍨' });
        assert.deepEqual(venueIcon({ typeLabel: 'Bakery cafe', emoji: '🥐' }), { emoji: '🥐' });
        assert.deepEqual(venueIcon({ typeLabel: 'Takeaway', emoji: '  ' }), { name: 'map-pin' });
        assert.deepEqual(venueIcon({}), { name: 'map-pin' });
        assert.deepEqual(venueIcon(null), { name: 'map-pin' });
    });

    it('agrees with the map pin for every imported label', () => {
        const labels = [['Cafe', '☕'], ['Restaurant', '🍽️'], ['Eatery', '🍽️'], ['Takeaway', '🥡'], ['Pub & bar', '🍺'],
            ['Cocktail & wine bar', '🍸'], ['Bar', '🍸'], ['Bakery cafe', '🥐'], ['Gelato & dessert', '🍨'], ['Hotel dining', '🏨']];
        for (const [typeLabel, emoji] of labels) {
            const icon = venueIcon({ typeLabel, emoji });
            assert.ok(icon.name ? hasIcon(icon.name) : icon.emoji === emoji, typeLabel);
        }
    });
});

describe('venueOfferings', () => {
    it('maps the requested tags to clay icons', () => {
        const rows = venueOfferings({
            tags: ['Beer Garden', 'Deck', 'Smoking Area', 'Wheelchair Accessible', '24h License', 'Rooftop', 'Live Music', 'Pet Friendly'],
            heating: 'traditional-fireplace',
        });
        const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.icon]));
        assert.deepEqual(byLabel, {
            'Beer garden': 'garden-table',
            Deck: 'deck',
            Rooftop: 'rooftop-bar',
            Fireplace: 'fireplace',
            'Live music': 'live-music',
            'Dog friendly': 'brucey',
            'Wheelchair accessible': 'wheelchair',
            'Smoking area': 'smoking-area',
            '24-hour bottleshop': 'bottle-shop',
        });
    });

    it('keeps unknown tags with no icon, after the known ones', () => {
        const rows = venueOfferings({ tags: ['People Watching', 'Beer Garden', 'live-music', 'Hidden'] });
        assert.deepEqual(rows.map((r) => [r.label, r.icon]), [
            ['Beer garden', 'garden-table'],
            ['Live music', 'live-music'],
            ['People watching', null],
            ['Hidden', null],
        ]);
    });

    it('gives every live venue tag with existing art its clay icon', () => {
        // Every tag on production venues (2026-10-17), minus the live-condition ones.
        const live = ['Outdoor Seating', 'Large Groups', 'Wheelchair Accessible', 'Beer Garden', 'Pet Friendly',
            'Smoking Area', 'Vegan', 'Live Music', 'Pram Friendly', 'Rooftop', 'Views', 'Craft Beer', 'Hotel',
            'Afternoon Sun', 'Cocktails', 'Shaded', 'Premium', 'Indoor Warmth', 'River', 'Cozy', 'Serviced apartment',
            'Specialty Coffee', 'Pub', 'Fireplace', 'Heaters', 'All-weather', 'Historic', 'Covered', 'Garden',
            'Sunset', 'Morning Sun', 'indoor-only', 'Vines', 'food-available', 'Umbrellas', 'live-music', 'Deck',
            'After Work', 'Pub Grub', 'Boutique', 'Bar', 'Beach', '24h License', 'dog-friendly', 'Sunrise'];
        for (const tag of live) {
            const [row] = venueOfferings({ tags: [tag] });
            assert.ok(row?.icon && hasIcon(row.icon), `${tag} → ${row?.icon}`);
        }
        // No clay art yet: these still show the neutral dot until icons are made.
        const noArt = ['Business Friendly', 'Gluten Free', 'Arts', 'Hidden', 'Party', 'Conference', 'Local', 'People Watching'];
        for (const tag of noArt) assert.equal(venueOfferings({ tags: [tag] })[0].icon, null, tag);
    });

    it('labels the newly mapped tags', () => {
        const rows = venueOfferings({ tags: ['Sunset', 'Sunrise', 'Hotel', 'Premium', 'Cozy', 'Serviced apartment'] });
        assert.deepEqual(rows.map((r) => [r.label, r.icon]), [
            ['Cosy', 'indoor-warmth'],
            ['Sunrise spot', 'morning-sun'],
            ['Sunset spot', 'sunset'],
            ['Hotel', 'hotel-views'],
            ['Serviced apartment', 'house'],
            ['Premium', 'sparkles'],
        ]);
    });

    it('drops live-condition tags and duplicates', () => {
        const rows = venueOfferings({ tags: ['Sunny', '☀️ Sunny Now', 'Windy', 'Pet Friendly', 'dog-friendly', 'Fireplace'], heating: 'electric-fireplace' });
        assert.deepEqual(rows.map((r) => r.label), ['Fireplace', 'Dog friendly']);
    });

    it('gives imported venues their outdoor seating, access and diet icons', () => {
        // City of Melbourne venues carry 'Outdoor Seating'; OpenStreetMap adds the rest.
        const rows = venueOfferings({ tags: ['Outdoor Seating', 'Large Groups', 'Wheelchair Accessible', 'Vegan', 'Smoking Area'] });
        assert.deepEqual(rows.map((r) => [r.label, r.icon]), [
            ['Outdoor seating', 'garden-table'],
            ['Wheelchair accessible', 'wheelchair'],
            ['Smoking area', 'smoking-area'],
            ['Vegan options', 'vegan'],
            ['Good for groups', 'large-groups'],
        ]);
    });

    it('adds outdoor heaters from the heating field and ignores bad input', () => {
        assert.deepEqual(venueOfferings({ tags: [], heating: 'heated outdoor' }).map((r) => r.label), ['Outdoor heaters']);
        assert.deepEqual(venueOfferings(null), []);
        assert.deepEqual(venueOfferings({ tags: [null, 42, '', '  '] }), []);
    });

    it('only names icons that exist, for every demo venue', () => {
        for (const venue of demoVenues) {
            for (const row of venueOfferings(venue)) {
                if (row.icon) assert.ok(hasIcon(row.icon), `${venue.venueName}: ${row.icon}`);
            }
        }
    });
});
