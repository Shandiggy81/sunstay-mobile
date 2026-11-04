import test from 'node:test';
import assert from 'node:assert/strict';
import { footerPrimaryAction, websiteHostLabel } from './venueFooterActions.js';

const QUEST = 'https://www.questapartments.com.au/properties/vic/st-kilda/quest-st-kilda-bayside';

test('a stay with an official website leads with it', () => {
    for (const typeCategory of ['Hotel', 'Serviced apartment', 'Short stay', 'ShortStay']) {
        assert.equal(footerPrimaryAction({ venue: { typeCategory }, websiteUrl: QUEST }), 'website', typeCategory);
    }
});

test('a stay without a usable website, and every other venue, leads with directions', () => {
    assert.equal(footerPrimaryAction({ venue: { typeCategory: 'Hotel' }, websiteUrl: null }), 'directions');
    assert.equal(footerPrimaryAction({ venue: { typeCategory: 'Hotel' }, websiteUrl: '  ' }), 'directions');
    assert.equal(footerPrimaryAction({ venue: { typeCategory: 'Hotel' }, websiteUrl: 'javascript:alert(1)' }), 'directions');
    assert.equal(footerPrimaryAction({ venue: { typeCategory: 'Hotel' }, websiteUrl: 'questapartments.com.au' }), 'directions');
    // A pub called "… Hotel" is a bar, and a home is not a stay.
    assert.equal(footerPrimaryAction({ venue: { venueName: 'Royal Standard Hotel', typeCategory: 'Bar' }, websiteUrl: QUEST }), 'directions');
    assert.equal(footerPrimaryAction({ venue: { typeCategory: 'Residential' }, websiteUrl: QUEST }), 'directions');
    assert.equal(footerPrimaryAction({ venue: null, websiteUrl: QUEST }), 'directions');
});

test('the caption names the website by its address, not a guessed brand', () => {
    assert.equal(websiteHostLabel(QUEST), 'questapartments.com.au');
    assert.equal(websiteHostLabel('http://WWW.Example.COM.au/x'), 'example.com.au');
    assert.equal(websiteHostLabel(' https://wonderlandbar.com.au/ '), 'wonderlandbar.com.au');
    for (const bad of [null, undefined, '', 'not a url', 'ftp://example.com', 'javascript:alert(1)', 42]) {
        assert.equal(websiteHostLabel(bad), null, String(bad));
    }
});
