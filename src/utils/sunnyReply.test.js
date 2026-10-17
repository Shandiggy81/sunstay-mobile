import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    clockLabel, contextVenues, replyForToolCalls, tidyReply, withLinkedVenues,
} from '../../supabase/functions/chat-sunny/sunnyReply.js';

const ctx = {
    visibleVenues: [
        { id: 'clue-2024-102502-283', name: 'Matilda 159' },
        { id: 'clue-2024-102504-631', name: 'Bacash' },
        { id: 'clue-2024-101100-282', name: 'Jardin Tan' },
        { id: 'dv-02', name: 'The Emerson Rooftop' },
        { id: 'x' }, null,
    ],
    activeVenue: { id: 'dv-13', name: 'The Espy' },
};
const names = contextVenues(ctx);
const pan = (venueId) => ({ name: 'panToVenue', args: { venueId } });

describe('contextVenues', () => {
    it('maps ids to names from visible and active venues', () => {
        assert.equal(names.get('dv-02'), 'The Emerson Rooftop');
        assert.equal(names.get('dv-13'), 'The Espy');
        assert.equal(names.has('x'), false);
        assert.equal(contextVenues(null).size, 0);
    });
});

describe('tidyReply', () => {
    it('turns a venue link back into its name and keeps the id for a card', () => {
        const t = tidyReply('Try [Jardin Tan](clue-2024-101100-282) for sun.', names);
        assert.deepEqual(t, { reply: 'Try Jardin Tan for sun.', venueIds: ['clue-2024-101100-282'] });
    });
    it('drops bare ids and bold, and ignores links to unknown ids', () => {
        assert.deepEqual(tidyReply('**Bacash** (clue-2024-102504-631) or [Nowhere](dv-99)', names), { reply: 'Bacash or Nowhere', venueIds: [] });
        assert.deepEqual(tidyReply('Plain words.', names), { reply: 'Plain words.', venueIds: [] });
        assert.deepEqual(tidyReply(undefined), { reply: '', venueIds: [] });
    });
});

describe('withLinkedVenues', () => {
    it('adds linked venues as picks without duplicates, three at most', () => {
        assert.deepEqual(withLinkedVenues([pan('dv-02')], ['dv-02', 'dv-13']), [pan('dv-02'), pan('dv-13')]);
        const full = [pan('a'), pan('b'), pan('c')];
        assert.deepEqual(withLinkedVenues(full, ['dv-13']), full);
    });
});

describe('clockLabel', () => {
    it('reads minutes as a Melbourne clock time', () => {
        assert.equal(clockLabel(960), '4pm');
        assert.equal(clockLabel(990), '4:30pm');
        assert.equal(clockLabel(720), '12pm');
        assert.equal(clockLabel(0), '12am');
        assert.equal(clockLabel(545), '9:05am');
        assert.equal(clockLabel(2000), null);
        assert.equal(clockLabel('x'), null);
    });
});

describe('replyForToolCalls', () => {
    it('names the picks and the time instead of a canned line', () => {
        assert.equal(
            replyForToolCalls([{ name: 'setTimeOfDay', args: { todMinutes: 960 } }, pan('clue-2024-102502-283'), pan('clue-2024-102504-631')], names),
            'Here are my picks for 4pm: Matilda 159 and Bacash.',
        );
        assert.equal(replyForToolCalls([pan('dv-02')], names), "Here's my pick: The Emerson Rooftop.");
        assert.equal(replyForToolCalls([pan('dv-02'), pan('dv-13'), pan('clue-2024-101100-282')], names),
            'Here are my picks: The Emerson Rooftop, The Espy and Jardin Tan.');
    });
    it('falls back sensibly without names', () => {
        assert.equal(replyForToolCalls([{ name: 'setTimeOfDay', args: { todMinutes: 1110 } }], names), "Here's the map at 6:30pm.");
        assert.equal(replyForToolCalls([{ name: 'setFilters', args: { tags: ['Rooftop'] } }], names), "I've updated the filters on the map.");
        assert.equal(replyForToolCalls([pan('unknown')], names), 'On it — updating the map.');
        assert.equal(replyForToolCalls([], names), '');
    });
});

describe('chat-sunny uses the tidy-up', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../supabase/functions/chat-sunny/index.ts'), 'utf8');
    it('tidies every reply and writes one from the picks when Gemini sends none', () => {
        assert.match(src, /tidyReply\(contract\.reply, names\)/);
        assert.match(src, /withLinkedVenues\(contract\.toolCalls, tidy\.venueIds\)/);
        assert.match(src, /replyForToolCalls\(contract\.toolCalls, names\)/);
        assert.match(src, /Never write ids, links or markdown/);
    });
});
