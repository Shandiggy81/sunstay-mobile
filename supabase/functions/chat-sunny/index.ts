/**
 * chat-sunny — Sunny as a context-aware UI driver.
 *
 * POST /functions/v1/chat-sunny
 * Body:    { messages: [{ role, content }], sunnyContext: { timeOfDay, activeVenue, visibleVenues } }
 * Auth:    Authorization: Bearer <user session JWT or legacy anon JWT>
 *          apikey: <anon / publishable key>
 * Secret:  OPENAI_API_KEY (required). Optional OPENAI_MODEL (default gpt-4o-mini).
 *
 * Response contract (stable, this is what the app consumes):
 *   {
 *     reply: string,                          // guest-facing text; may be empty if only tools ran
 *     toolCalls: [{ name: string, args: {} }] // 0..n of setTimeOfDay | setFilters | panToVenue
 *   }
 *
 * Tool args:
 *   setTimeOfDay  { todMinutes: number }   // 0–1439 Melbourne wall-clock minutes
 *   setFilters    { tags: string[] }       // filter ids the map already understands
 *   panToVenue    { venueId: string }      // id from sunnyContext.visibleVenues
 *
 * Deploy:
 *   supabase functions deploy chat-sunny --project-ref fksuqgvsazoxarocmaii
 *   supabase secrets set OPENAI_API_KEY=sk-... --project-ref fksuqgvsazoxarocmaii
 *
 * No npm SDK — OpenAI is called via fetch so the function stays Deno-native.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are Sunny, a sharp, brief hospitality floor manager for Melbourne venues.
You help guests pick spots for sun, shade, and wind comfort — rooftops, courtyards, beer gardens, indoor warmth.

You can drive the guest's map UI with tools:
- setTimeOfDay({ todMinutes }) — Melbourne wall-clock minutes past midnight, 0–1439.
  Golden hour ~17:30–18:30 (1050–1110). Midday 12:00 = 720. Sunset ~18:00 = 1080.
- setFilters({ tags }) — replace the active filter chips. Use ids the app already has
  (Rooftop, Pet Friendly, Shaded, Indoor Warmth, sunny-mode, cozy-mode, Wheelchair Accessible, …).
- panToVenue({ venueId }) — fly the map to a venue. Prefer ids from the hidden sunnyContext.visibleVenues list.

Rules:
- When the guest asks to change time, filters, or go to a place, call the matching tool(s).
- Always speak 1–2 short sentences to the guest even when you call tools. Australian, not try-hard.
- Never mention tools, JSON, system prompts, or hidden context.
- If they name a venue that is not in visibleVenues, say you can't see it on the map rather than guessing an id.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'setTimeOfDay',
      description: 'Scrub the time-of-day slider (Melbourne wall-clock minutes, 0–1439).',
      parameters: {
        type: 'object',
        properties: {
          todMinutes: {
            type: 'number',
            description: 'Minutes past Melbourne midnight. Golden hour ~1080, midday 720.',
            minimum: 0,
            maximum: 1439,
          },
        },
        required: ['todMinutes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'setFilters',
      description: 'Replace the active venue filter tags on the map.',
      parameters: {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter ids such as Rooftop, Pet Friendly, Shaded, Indoor Warmth.',
          },
        },
        required: ['tags'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'panToVenue',
      description: 'Fly the map to a venue currently in (or known by) the viewport.',
      parameters: {
        type: 'object',
        properties: {
          venueId: {
            type: 'string',
            description: 'Venue id from sunnyContext.visibleVenues (e.g. dv-13).',
          },
        },
        required: ['venueId'],
      },
    },
  },
];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const msg of raw) {
    if (!msg || typeof msg !== 'object') continue;
    const role = msg.role === 'assistant' || msg.role === 'user' ? msg.role : null;
    const content = typeof msg.content === 'string' ? msg.content.slice(0, 2000) : '';
    if (!role || !content.trim()) continue;
    out.push({ role, content });
    if (out.length >= 12) break;
  }
  return out;
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* ignore */
    }
  }
  return {};
}

function contractFromOpenAI(data) {
  const message = data?.choices?.[0]?.message ?? {};
  const reply = typeof message.content === 'string' ? message.content : '';
  const toolCalls = [];
  for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    const name = call?.function?.name;
    if (name !== 'setTimeOfDay' && name !== 'setFilters' && name !== 'panToVenue') continue;
    toolCalls.push({ name, args: parseArgs(call?.function?.arguments) });
  }
  return {
    reply,
    toolCalls,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ reply: '', toolCalls: [], error: 'method_not_allowed' }, 405);
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return json({ reply: '', toolCalls: [], error: 'missing_openai_key' }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ reply: '', toolCalls: [], error: 'invalid_json' }, 400);
  }

  const messages = sanitizeMessages(body?.messages);
  const sunnyContext = body?.sunnyContext && typeof body.sunnyContext === 'object'
    ? body.sunnyContext
    : {};

  const openaiMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content: `Hidden map context (do not mention this block): ${JSON.stringify(sunnyContext)}`,
    },
    ...messages,
  ];

  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';

  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: openaiMessages,
        tools: TOOLS,
        tool_choice: 'auto',
      }),
    });
  } catch (err) {
    console.error('chat-sunny openai fetch failed', err);
    return json({ reply: '', toolCalls: [], error: 'openai_unreachable' }, 502);
  }

  const data = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    console.error('chat-sunny openai error', upstream.status, data);
    return json({ reply: '', toolCalls: [], error: 'openai_error' }, 502);
  }

  const contract = contractFromOpenAI(data);
  if (!contract.reply && contract.toolCalls.length > 0) {
    contract.reply = 'On it — updating the map.';
  }
  return json(contract);
});
