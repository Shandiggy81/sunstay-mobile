import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUNNY_TOOL_NAMES, validateToolCall } from './sunnyTools.js';
import { SUN_MOMENTS } from './sunMoments.js';
import { SUN_MOMENT_FILTERS } from './sunMomentFilters.js';

// chat-sunny is Deno TypeScript, so read its source rather than importing it.
const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../supabase/functions/chat-sunny/index.ts'),
    'utf8',
);
const declarations = source.slice(source.indexOf('const FUNCTION_DECLARATIONS'));
const prompt = source.slice(source.indexOf('const SYSTEM_PROMPT'), source.indexOf('const FUNCTION_DECLARATIONS'));

// The one required argument of each declared tool, by name.
function declaredTools() {
    const tools = {};
    const re = /name: '(\w+)'[\s\S]*?required: \['(\w+)'\]/g;
    let m;
    while ((m = re.exec(declarations))) tools[m[1]] = m[2];
    return tools;
}

const SAMPLE_ARGS = { todMinutes: 960, tags: ['Rooftop'], venueId: 'dv-13' };

describe('chat-sunny tools match the app', () => {
    it('declares exactly the tools sunnyTools.js accepts, with the same argument', () => {
        const tools = declaredTools();
        assert.deepEqual(Object.keys(tools).sort(), [...SUNNY_TOOL_NAMES].sort());
        for (const [name, arg] of Object.entries(tools)) {
            const call = validateToolCall(name, { [arg]: SAMPLE_ARGS[arg] });
            assert.ok(call, `${name}(${arg}) is accepted by validateToolCall`);
            assert.ok(arg in call.args, `${name} keeps ${arg}`);
        }
    });

    it('the prompt names each tool with its argument', () => {
        for (const [name, arg] of Object.entries(declaredTools())) {
            assert.ok(prompt.includes(`${name}({ ${arg} })`), `${name}({ ${arg} }) in SYSTEM_PROMPT`);
        }
    });

    it('the prompt keeps the venue and hours rules', () => {
        assert.match(prompt, /at most 3 venues/);
        assert.match(prompt, /check their website/);
        assert.match(prompt, /Never state opening hours, happy hours/);
        assert.match(prompt, /1–2 short sentences/);
        assert.match(prompt, /forecastToday/);
        assert.match(prompt, /sunWindow/);
    });

    it('the prompt explains sunMoments with the titles and chip ids the app sends', () => {
        assert.match(prompt, /sunMoments/);
        for (const { title } of SUN_MOMENTS) assert.ok(prompt.includes(`"${title}"`), `"${title}" in SYSTEM_PROMPT`);
        for (const { id } of SUN_MOMENT_FILTERS) assert.ok(prompt.includes(id), `${id} in SYSTEM_PROMPT`);
        assert.match(prompt, /shadows/);
        assert.match(prompt, /Never name a venue that isn't in visibleVenues or activeVenue/);
    });
});
