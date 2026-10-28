import test from 'node:test';
import assert from 'node:assert/strict';
import { editDistanceWithin, foldSearchText, searchWords, wordsNear } from './searchText.js';

test('folding: apostrophes, accents, ampersands and punctuation', () => {
    assert.equal(foldSearchText("Domino's Pizza"), 'dominos pizza');
    assert.equal(foldSearchText('Domino’s'), 'dominos');
    assert.equal(foldSearchText('Mörk Chocolate Brew House'), 'mork chocolate brew house');
    assert.equal(foldSearchText('Williams Bar & Café'), 'williams bar and cafe');
    assert.equal(foldSearchText("Grill'd (QV)"), 'grilld qv');
    assert.equal(foldSearchText('  Sage And Grace - The Communitas Café '), 'sage and grace the communitas cafe');
    assert.equal(foldSearchText(null), '');
    assert.deepEqual(searchWords(''), []);
});

test('edit distance counts a swap as one slip', () => {
    assert.ok(editDistanceWithin('wonderlnad', 'wonderland', 1));
    assert.ok(editDistanceWithin('fitzory', 'fitzroy', 1));
    assert.ok(editDistanceWithin('cecconi', 'ceconi', 1));
    assert.ok(!editDistanceWithin('richmond', 'redmond', 1));
    assert.ok(editDistanceWithin('abc', 'abc', 0));
    assert.ok(!editDistanceWithin('abcdef', 'abc', 2));
});

test('typo matching is forgiving but not loose', () => {
    const near = (q, text) => wordsNear(searchWords(foldSearchText(q)), searchWords(foldSearchText(text)));
    assert.ok(near('wonderlnad', 'Wonderland Bar'));
    assert.ok(near('wonderlan bar', 'Wonderland Bar'));
    assert.ok(near('osbourne', 'The Osborne Rooftop & Bar'));
    assert.ok(near('fitzory', 'Fitzroy'));
    assert.ok(near('hopetoun tea rooms', 'Hopetoun Tea Rooms'));
    assert.ok(near('ceconis', "Cecconi's Flinders Lane"));
    assert.ok(!near('brighton', 'Bright Brewery'), 'a longer word is not a typo of a shorter one');
    assert.ok(!near('wond', 'Pond Bar'), 'the first letter has to be right');
    assert.ok(near('wnod', 'Wonderland Bar'), 'a swap after the first letter is fine');
    assert.ok(!near('bar', 'Car Park'), 'short words must match as typed');
    assert.ok(!near('cafe', 'Restaurant'));
    assert.ok(!near('', 'Anything'));
});
