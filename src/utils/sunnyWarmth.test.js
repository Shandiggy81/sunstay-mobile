import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { demoVenues } from '../data/demoVenues.js';
import { sunnyWarmthAnswer, venueWarmth, warmthWants } from './sunnyWarmth.js';

const v = (id, extra) => ({ id, lat: -37.86, lng: 144.98, ...extra });
const ids = (r) => r.venues.map((x) => x.id);
// Sunny may say what's recorded, never that a fire is lit or heaters are on
// (outside its "I can't see whether…" caveat), and never echoes the guest's
// rain back as weather.
const assertNoLiveClaim = (reply) => {
    assert.doesNotMatch(reply.replace(/I can't see whether [^.]*\./, ''), /\b(is|are) (lit|on|running)\b/i);
    assert.doesNotMatch(reply, /\b(rain|raining|wet|dry)\b/i);
};

describe('warmthWants', () => {
    it('reads a fireplace and outdoor heaters as separate asks', () => {
        assert.deepEqual(warmthWants("It's raining in St Kilda. Where can we sit by a fire?"), ['fireplace']);
        assert.deepEqual(warmthWants('somewhere with a fireplace that’s dog friendly'), ['fireplace']);
        assert.deepEqual(warmthWants('heated outdoor seating in St Kilda'), ['heaters']);
        assert.deepEqual(warmthWants('a beer garden with outdoor heaters'), ['heaters']);
        assert.deepEqual(warmthWants('fireplace or heat lamps?'), ['fireplace', 'heaters']);
    });

    it('ignores messages that ask for neither', () => {
        assert.deepEqual(warmthWants('sunny beer at 4pm'), []);
        assert.deepEqual(warmthWants('dog friendly cafe in Elwood'), []);
        assert.deepEqual(warmthWants('wood-fired pizza'), []);
        assert.deepEqual(warmthWants('a fire pit in Fitzroy'), []);
        assert.deepEqual(warmthWants(null), []);
    });
});

describe('venueWarmth', () => {
    it('reads the heating field, warmth tags and hasFireplace', () => {
        assert.deepEqual(venueWarmth({ heating: 'fireplace' }), { fireplace: 'fireplace', heaters: false, recorded: true });
        assert.deepEqual(venueWarmth({ heating: 'electric-fireplace' }), { fireplace: 'electric fireplace', heaters: false, recorded: true });
        assert.deepEqual(venueWarmth({ heating: 'heated outdoor' }), { fireplace: null, heaters: true, recorded: true });
        assert.deepEqual(venueWarmth({ heating: 'heated outdoor', hasFireplace: true }), { fireplace: 'fireplace', heaters: true, recorded: true });
        assert.deepEqual(venueWarmth({ tags: ['Fireplace', 'Pub'] }), { fireplace: 'fireplace', heaters: false, recorded: true });
        assert.deepEqual(venueWarmth({ heating: 'no heating', tags: ['Pet Friendly'] }), { fireplace: null, heaters: false, recorded: true });
    });

    it('does not treat a self-contradicting heater record as outdoor heating', () => {
        // Mr Tulk in the demo data: a Heaters tag, but heating "indoor only".
        assert.equal(venueWarmth({ heating: 'indoor only', tags: ['Heaters', 'Indoor Warmth'] }).heaters, false);
    });

    it('keeps missing data apart from a recorded no', () => {
        assert.equal(venueWarmth({ tags: ['Hotel'] }).recorded, false);
        assert.equal(venueWarmth({}).recorded, false);
        assert.equal(venueWarmth(null).recorded, false);
        // Stored fireplaceOn / heatersOn are seed data, not a live status or a fireplace.
        assert.deepEqual(venueWarmth({ fireplaceOn: true, heatersOn: true }), { fireplace: null, heaters: false, recorded: false });
    });
});

describe('sunnyWarmthAnswer with the repo venue data', () => {
    it('finds the St Kilda fireplaces for the demo question', () => {
        const r = sunnyWarmthAnswer("It's raining in St Kilda. Where can we sit by a fire?", demoVenues);
        assert.deepEqual(ids(r), ['dv-05', 'dv-21']); // Dick Whittington Tavern (tag + heating), The Espy (heating)
        assert.equal(r.place, 'St Kilda');
        assert.deepEqual(r.required, ['fireplace']);
        assert.equal(r.reply, "In St Kilda, Dick Whittington Tavern and The Espy list a fireplace. I can't see whether the fire is lit right now, so check with the venue before you head over.");
        assertNoLiveClaim(r.reply);
        for (const venue of r.venues) assert.equal(venue.suburb, 'St Kilda');
    });

    it('answers heated outdoor seating with heaters only, never a fireplace', () => {
        const r = sunnyWarmthAnswer('heated outdoor seating in St Kilda', demoVenues);
        assert.deepEqual(ids(r), ['dv-stay-01', 'dv-nat-02']); // Stokehouse, Donovans
        assert.ok(!ids(r).includes('dv-05'), 'a fireplace is not heated outdoor seating');
        assert.match(r.reply, /^In St Kilda, Stokehouse and Donovans list heated outdoor seating\./);
        assert.match(r.reply, /whether the heaters are on/);
        assertNoLiveClaim(r.reply);
    });

    it('needs both a fireplace and dogs for a combined ask', () => {
        const r = sunnyWarmthAnswer('somewhere with a fireplace that’s dog friendly', demoVenues);
        assert.deepEqual(r.required, ['fireplace', 'pet']);
        assert.equal(r.dog, true);
        assert.equal(r.place, null);
        // A real fire leads; electric ones say so. The Espy (no dogs listed) and
        // The Vineyard (dogs, no heating) are left out.
        assert.deepEqual(ids(r), ['dv-05', 'dv-01', 'holy-grail']);
        assert.equal(r.reply, "Dick Whittington Tavern (St Kilda), Wonderland Bar (Windsor, electric fireplace) and Holy Grail (Windsor, electric fireplace) list a fireplace and are dog friendly. I can't see whether the fire is lit right now, so check with the venue before you head over.");
        assertNoLiveClaim(r.reply);
    });

    it('keeps the suburb as a requirement in a combined ask', () => {
        const r = sunnyWarmthAnswer('dog friendly fireplace in St Kilda', demoVenues);
        assert.deepEqual(ids(r), ['dv-05']);
        assert.equal(r.matches, 1);
        assert.match(r.reply, /^In St Kilda, Dick Whittington Tavern lists a fireplace and is dog friendly\./);
    });

    it('says which features never meet at one venue', () => {
        const r = sunnyWarmthAnswer('a fireplace, outdoor heaters and dogs welcome in St Kilda', demoVenues);
        assert.deepEqual(r.venues, []);
        assert.equal(r.matches, 0);
        assert.equal(
            r.reply,
            "I couldn't confirm a St Kilda venue that lists a fireplace, lists heated outdoor seating and is dog friendly. "
            + '2 list a fireplace, 2 list heated outdoor seating and 2 are dog friendly, but no single venue has all of them. '
            + "2 of those venues have no heating details on record, so it's worth asking them directly.",
        );
    });

    it('says plainly when the suburb has no match', () => {
        const r = sunnyWarmthAnswer('where can we sit by a fire in Richmond?', demoVenues);
        assert.deepEqual(r.venues, []);
        assert.equal(r.place, 'Richmond');
        assert.equal(r.reply, "I couldn't confirm that any of the 2 Richmond venues I have lists a fireplace.");
    });

    it('leaves other questions to chat-sunny', () => {
        assert.equal(sunnyWarmthAnswer('dog friendly cafe in Elwood', demoVenues), null);
        assert.equal(sunnyWarmthAnswer('sunny beer at 4pm', demoVenues), null);
        assert.equal(sunnyWarmthAnswer('pram-friendly cafe in Elwood?', demoVenues), null);
    });
});

describe('sunnyWarmthAnswer with missing amenity data', () => {
    const recorded = v('a', { name: 'Hearth Hotel', suburb: 'Elwood', heating: 'fireplace', tags: ['Pub'] });
    const blank = v('b', { name: 'Blank Bar', suburb: 'Elwood', tags: ['Bar'] });
    const noHeat = v('c', { name: 'Cold Cafe', suburb: 'Elwood', heating: 'no heating', tags: ['Pet Friendly'] });

    it('never counts a venue with no heating details as a match', () => {
        const r = sunnyWarmthAnswer('fireplace in Elwood', [blank, noHeat]);
        assert.deepEqual(r.venues, []);
        assert.equal(r.reply, "I couldn't confirm that any of the 2 Elwood venues I have lists a fireplace. 1 of those venues has no heating details on record, so it's worth asking them directly.");
    });

    it('says when none of them have heating details', () => {
        const r = sunnyWarmthAnswer('outdoor heaters in Elwood', [blank]);
        assert.equal(r.reply, "I couldn't confirm that the one Elwood venue I have lists heated outdoor seating. 1 of them has no heating details on record, so it's worth asking them directly.");
    });

    it('needs a dog tag, not a fireplace alone, for a dog ask', () => {
        const r = sunnyWarmthAnswer('fireplace for me and the dog in Elwood', [recorded, blank, noHeat]);
        assert.deepEqual(r.venues, []);
        assert.match(r.reply, /^I couldn't confirm an Elwood venue that lists a fireplace and is dog friendly\. 1 lists a fireplace and 1 is dog friendly, but no single venue has both\./);
    });

    it('finds the recorded one among blanks', () => {
        const r = sunnyWarmthAnswer('fireplace in Elwood', [blank, recorded, noHeat]);
        assert.deepEqual(ids(r), ['a']);
        assert.match(r.reply, /^In Elwood, Hearth Hotel lists a fireplace\./);
    });

    it('handles no venues at all', () => {
        assert.equal(sunnyWarmthAnswer('fireplace please', []).reply, "I don't have any venues to check for that right now.");
        assert.equal(sunnyWarmthAnswer('fireplace please', null).venues.length, 0);
    });
});

describe('sunnyWarmthAnswer cards', () => {
    it('shows at most three cards and counts the rest', () => {
        const many = Array.from({ length: 5 }, (_, i) => v(`f${i}`, { name: `Fire ${i}`, suburb: 'Carlton', heating: 'fireplace' }));
        const r = sunnyWarmthAnswer('fireplace in Carlton', many);
        assert.deepEqual(ids(r), ['f0', 'f1', 'f2']);
        assert.equal(r.matches, 5);
        assert.match(r.reply, /^In Carlton, Fire 0, Fire 1, Fire 2 and 2 more list a fireplace\./);
    });
});
