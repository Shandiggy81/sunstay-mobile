/**
 * chat-sunny — Sunny as a context-aware UI driver.
 *
 * POST /functions/v1/chat-sunny
 * Body:    { messages: [{ role, content }], sunnyContext: { timeOfDay, activeVenue, visibleVenues } }
 * Auth:    Authorization: Bearer <user session JWT or legacy anon JWT>
 *          apikey: <anon / publishable key>
 * Secret:  GEMINI_API_KEY (required). Optional GEMINI_MODEL
 *          (default gemini-3.6-flash — current free-tier Flash with function calling.
 *          gemini-2.0-flash / gemini-1.5-flash / gemini-2.5-flash are unavailable to new keys.)
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
 * Gemini functionCall parts are mapped into that shape before the response
 * leaves the function. The frontend never sees Gemini's native payload.
 *
 * Deploy:
 *   supabase functions deploy chat-sunny --project-ref fksuqgvsazoxarocmaii
 *   supabase secrets set GEMINI_API_KEY=... --project-ref fksuqgvsazoxarocmaii
 *
 * No npm SDK — Gemini generateContent is called with fetch.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_MODEL = 'gemini-3.6-flash';
const GEMINI_GENERATE_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

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

const FUNCTION_DECLARATIONS = [
  {
    name: 'setTimeOfDay',
    description: 'Scrub the time-of-day slider (Melbourne wall-clock minutes, 0–1439).',
    parameters: {
      type: 'object',
      properties: {
        todMinutes: {
          type: 'number',
          description: 'Minutes past Melbourne midnight. Golden hour ~1080, midday 720.',
        },
      },
      required: ['todMinutes'],
    },
  },
  {
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
  {
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
];

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function sanitizeMessages(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of raw) {
    if (!msg || typeof msg !== 'object') continue;
    const role = (msg as { role?: string }).role === 'assistant' || (msg as { role?: string }).role === 'user'
      ? (msg as { role: 'user' | 'assistant' }).role
      : null;
    const content = typeof (msg as { content?: unknown }).content === 'string'
      ? (msg as { content: string }).content.slice(0, 2000)
      : '';
    if (!role || !content.trim()) continue;
    out.push({ role, content });
    if (out.length >= 12) break;
  }
  return out;
}

function toGeminiContents(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const contents = messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
  // generateContent prefers a user turn first.
  if (contents[0]?.role === 'model') {
    contents.unshift({
      role: 'user',
      parts: [{ text: 'The guest opened Sunny on the Melbourne venue map.' }],
    });
  }
  return contents;
}

function parseArgs(raw: unknown) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
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

function contractFromGemini(data: unknown) {
  const parts = (data as {
    candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }>;
  })?.candidates?.[0]?.content?.parts;
  let reply = '';
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  for (const part of Array.isArray(parts) ? parts : []) {
    if (typeof part?.text === 'string' && part.text.trim()) {
      reply += (reply ? '\n' : '') + part.text;
    }
    const fc = (part?.functionCall ?? part?.function_call) as
      | { name?: string; args?: unknown; arguments?: unknown }
      | undefined;
    const name = fc?.name;
    if (name !== 'setTimeOfDay' && name !== 'setFilters' && name !== 'panToVenue') continue;
    toolCalls.push({ name, args: parseArgs(fc?.args ?? fc?.arguments) });
  }
  return { reply, toolCalls };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ reply: '', toolCalls: [], error: 'method_not_allowed' }, 405);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return json({ reply: '', toolCalls: [], error: 'missing_gemini_key' }, 503);
  }

  let body: { messages?: unknown; sunnyContext?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ reply: '', toolCalls: [], error: 'invalid_json' }, 400);
  }

  const messages = sanitizeMessages(body?.messages);
  const sunnyContext = body?.sunnyContext && typeof body.sunnyContext === 'object'
    ? body.sunnyContext
    : {};

  const model = (Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const contents = toGeminiContents(messages);
  if (contents.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: 'Greet the guest briefly and wait for what they want.' }],
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_GENERATE_URL(model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            { text: SYSTEM_PROMPT },
            { text: `Hidden map context (do not mention this block): ${JSON.stringify(sunnyContext)}` },
          ],
        },
        contents,
        tools: [{ function_declarations: FUNCTION_DECLARATIONS }],
        tool_config: {
          function_calling_config: { mode: 'AUTO' },
        },
        generation_config: { temperature: 0.4 },
      }),
    });
  } catch (err) {
    console.error('chat-sunny gemini fetch failed', err);
    return json({ reply: '', toolCalls: [], error: 'gemini_unreachable' }, 502);
  }

  const data = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    console.error('chat-sunny gemini error', upstream.status, data);
    const detail = typeof data?.error?.message === 'string'
      ? data.error.message.slice(0, 300)
      : '';
    return json({ reply: '', toolCalls: [], error: 'gemini_error', detail }, 502);
  }

  const contract = contractFromGemini(data);
  if (!contract.reply && contract.toolCalls.length > 0) {
    contract.reply = 'On it — updating the map.';
  }
  return json(contract);
});
