import test from 'node:test';
import assert from 'node:assert/strict';
import { homeConditions, venueComfort, comfortTier, rankForConditions, conditionsClause } from './homeConditions.js';

const wx = (over = {}) => ({ source: 'open-meteo', precipitation: 0, precipProbability: 10, apparentTemp: 18,
    windKmh: 10, windGusts: 20, weather: [{ main: 'Clouds' }], ...over });

test('conditions: real weather only, wet beats cold beats windy', () => {
    assert.equal(homeConditions(null), null);
    assert.equal(homeConditions(wx({ source: 'demo' })), null);
    assert.equal(homeConditions(wx({ unavailable: true })), null);
    assert.equal(homeConditions({ source: 'open-meteo' }), null);
    assert.equal(homeConditions(wx()), 'fair');
    assert.equal(homeConditions(wx({ precipitation: 0.4 })), 'wet');
    assert.equal(homeConditions(wx({ precipProbability: 60 })), 'wet');
    assert.equal(homeConditions(wx({ precipProbability: 59 })), 'fair');
    assert.equal(homeConditions(wx({ weather: [{ main: 'Drizzle' }] })), 'wet');
    assert.equal(homeConditions(wx({ apparentTemp: 9, precipitation: 1, windKmh: 40 })), 'wet');
    assert.equal(homeConditions(wx({ apparentTemp: 10, windKmh: 40 })), 'cold');
    assert.equal(homeConditions(wx({ apparentTemp: 11 })), 'fair');
    assert.equal(homeConditions(wx({ windKmh: 30 })), 'windy');
    assert.equal(homeConditions(wx({ windGusts: 55 })), 'windy');
    // A sunny, mild, still day is fair even with today's cold morning behind it.
    assert.equal(homeConditions(wx({ apparentTemp: 21, weather: [{ main: 'Clear' }] })), 'fair');
    // Grey: a dull daytime sky, below wet, cold and windy; never at night.
    assert.equal(homeConditions(wx({ cloudCoverPct: 90 })), 'grey');
    assert.equal(homeConditions(wx({ cloudCoverPct: 84 })), 'fair');
    assert.equal(homeConditions(wx({ weather: [{ main: 'Fog' }] })), 'grey');
    assert.equal(homeConditions(wx({ cloudCoverPct: 100, isDay: false })), 'fair');
    assert.equal(homeConditions(wx({ cloudCoverPct: 100, precipitation: 1 })), 'wet');
    assert.equal(homeConditions(wx({ cloudCoverPct: 100, apparentTemp: 8 })), 'cold');
});

const fire = { id: 'fire', heating: 'fireplace' };
const electric = { id: 'electric', heating: 'electric-fireplace' };
const indoor = { id: 'indoor', heating: 'indoor only' };
const heaters = { id: 'heaters', heating: 'heated outdoor', tags: ['Beer Garden'] };
const covered = { id: 'covered', tags: ['Covered'] };
const cozy = { id: 'cozy', hasCozy: true };
const windbreak = { id: 'windbreak', shielding: { windbreak: 80, rainCover: 20 } };
const plain = { id: 'plain', tags: ['Outdoor Seating'] };
const noHeat = { id: 'noheat', heating: 'no heating' };

test('comfort comes only from declared facts', () => {
    assert.deepEqual(venueComfort(fire), { indoorWarm: true, outdoorHeat: false, sheltered: true, windbreak: true });
    assert.equal(venueComfort(electric).indoorWarm, true);
    assert.equal(venueComfort({ hasFireplace: true }).indoorWarm, true);
    assert.equal(venueComfort(indoor).indoorWarm, true);
    assert.deepEqual(venueComfort(heaters), { indoorWarm: false, outdoorHeat: true, sheltered: false, windbreak: false });
    assert.equal(venueComfort(covered).sheltered, true);
    assert.equal(venueComfort(cozy).sheltered, true);
    assert.equal(venueComfort({ shielding: { rainCover: 90 } }).sheltered, true);
    assert.deepEqual(venueComfort(windbreak), { indoorWarm: false, outdoorHeat: false, sheltered: false, windbreak: true });
    for (const venue of [plain, noHeat, {}, null]) {
        assert.deepEqual(venueComfort(venue), { indoorWarm: false, outdoorHeat: false, sheltered: false, windbreak: false });
    }
});

test('tiers: outdoor heaters warm you but do not keep you dry', () => {
    assert.equal(comfortTier(fire, 'wet'), 2);
    assert.equal(comfortTier(covered, 'wet'), 1);
    assert.equal(comfortTier(heaters, 'wet'), 0);
    assert.equal(comfortTier(heaters, 'cold'), 1);
    assert.equal(comfortTier(covered, 'cold'), 0);
    assert.equal(comfortTier(windbreak, 'windy'), 1);
    assert.equal(comfortTier(fire, 'fair'), 0);
    assert.equal(comfortTier(fire, 'grey'), 0, 'grey keeps the sun order');
    assert.equal(comfortTier(fire, null), 0);
});

test('ranking lifts comfort and keeps the sun order within a tier', () => {
    const sunOrder = [plain, heaters, covered, fire, cozy, indoor];
    assert.deepEqual(rankForConditions(sunOrder, 'wet').map(v => v.id), ['fire', 'indoor', 'covered', 'cozy', 'plain', 'heaters']);
    assert.deepEqual(rankForConditions(sunOrder, 'cold').map(v => v.id), ['fire', 'indoor', 'heaters', 'plain', 'covered', 'cozy']);
    // Fine weather, unknown weather or no comfort facts: the same array back.
    assert.equal(rankForConditions(sunOrder, 'fair'), sunOrder);
    assert.equal(rankForConditions(sunOrder, null), sunOrder);
    const bare = [plain, noHeat];
    assert.equal(rankForConditions(bare, 'wet'), bare);
    assert.deepEqual(sunOrder.map(v => v.id), ['plain', 'heaters', 'covered', 'fire', 'cozy', 'indoor'], 'input not mutated');
});

test('clause is honest about what is declared', () => {
    const all = [plain, heaters, covered, fire, indoor];
    assert.equal(conditionsClause(all, 'wet'), 'rain about · 3 cosy and dry');
    assert.equal(conditionsClause(all, 'cold'), 'chilly out · 3 with heating');
    assert.equal(conditionsClause([windbreak, plain], 'windy'), 'windy · 1 sheltered');
    assert.equal(conditionsClause([plain], 'wet'), 'rain about');
    assert.equal(conditionsClause(all, 'grey'), 'overcast · 3 cosy');
    assert.equal(conditionsClause([plain], 'grey'), 'overcast');
    assert.equal(conditionsClause(all, 'fair'), null);
    assert.equal(conditionsClause(all, null), null);
    const many = Array.from({ length: 1200 }, (_, i) => ({ id: i, heating: 'fireplace' }));
    assert.equal(conditionsClause(many, 'wet'), 'rain about · 1,200 cosy and dry');
});

test('sort chip names the comfort order only when it applies', async () => {
    const { comfortSortLabel } = await import('./homeConditions.js');
    assert.equal(comfortSortLabel([plain, fire], 'wet'), 'Cosy and dry first');
    assert.equal(comfortSortLabel([plain, heaters], 'cold'), 'Warmest first');
    assert.equal(comfortSortLabel([windbreak], 'windy'), 'Sheltered first');
    assert.equal(comfortSortLabel([plain, heaters], 'wet'), null);
    assert.equal(comfortSortLabel([fire], 'fair'), null);
    assert.equal(comfortSortLabel([fire], 'grey'), null);
    assert.equal(comfortSortLabel([fire], null), null);
});
