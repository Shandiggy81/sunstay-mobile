/**
 * chat-sunny — Sunny as a context-aware UI driver.
 *
 * POST /functions/v1/chat-sunny
 * Body:    { messages: [{ role, content }], sunnyContext: { timeOfDay, activeVenue, visibleVenues } }
 * Auth:    Authorization: Bearer <user session JWT or legacy anon JWT>
 *          apikey: <anon / publishable key>
 * Secret:  GEMINI_API_KEY (alias GOOGLE_API_KEY). Optional GEMINI_MODEL.
 *          Default gemini-2.5-flash, then gemini-2.5-flash-lite, gemini-2.0-flash,
 *          gemini-flash-latest, gemini-1.5-flash (free-tier model ids retire often).
 *
 * Response contract (stable, this is what the app consumes):
 *   {
 *     reply: string,
 *     toolCalls: [{ name: string, args: {} }] // setTimeOfDay | setFilters | panToVenue
 *   }
 *
 * Tool args (must match src/utils/sunnyTools.js):
 *   setTimeOfDay  { todMinutes: number }   // 0–1439 Melbourne wall-clock minutes
 *   setFilters    { tags: string[] }
 *   panToVenue    { venueId: string }
 *
 * Gemini functionCall parts are mapped into that shape before the response
 * leaves the function. The frontend never sees Gemini's native payload.
 *
 * Limits (limits.js): 10 requests/min and 60/hour per client IP
 * (cf-connecting-ip, else the last x-forwarded-for hop) and 120/min per
 * instance → 429 rate_limited with Retry-After. Bodies over 64 KB, more than
 * 12 messages, a message over 2000 chars or sunnyContext over 24 KB → 413.
 * Replies are capped at 512 output tokens.
 *
 * Deploy:
 *   supabase functions deploy chat-sunny --project-ref fksuqgvsazoxarocmaii
 *   supabase secrets set GEMINI_API_KEY=... --project-ref fksuqgvsazoxarocmaii
 *
 * No npm SDK — Gemini generateContent is called with fetch.
 */

import { geminiDiagnostics, geminiModelChain, generationConfigFor, shouldTryNextModel, textOnlyRetryBody } from './geminiModels.js';
import { contextVenues, replyForToolCalls, tidyReply, withLinkedVenues } from './sunnyReply.js';
import {
  MAX_BODY_BYTES,
  MAX_OUTPUT_TOKENS,
  clientKey,
  createRateLimiter,
  payloadLimitError,
} from './limits.js';

const rateLimiter = createRateLimiter();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_GENERATE_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

const SYSTEM_PROMPT = `You are Sunny, a local who knows where the sun is in Melbourne.
You help guests pick venues for sun, shade and wind comfort: rooftops, courtyards, beer gardens, warm indoor spots.

What you know (hidden context, may be partly missing):
- timeOfDay: the map's time slider, Melbourne minutes past midnight, or null for now.
- forecastToday: sunrise, sunset, now ("sun", "cloud", "rain", "shade", "night"), sunLeftMin,
  nextSun, and hourly lines for the rest of today like "4pm sun 17° 0%" (time, sky, temperature, rain chance).
- visibleVenues and activeVenue: id, name, type, suburb, and when known sunWindow (when that venue gets direct sun
  today, e.g. "10am–2pm", or "none") and tags (e.g. "Beer Garden", "Pet Friendly").
  Some venues also carry sunMoments: the parts of today when that spot gets direct sun under a sky
  that isn't cloud or rain, from "Morning coffee", "Long lunch", "Afternoon" and "Sunset drinks".
  These venues are listed first.

Answering time questions ("sunny beer at 4pm?"):
- Check the forecastToday line for that hour first. If it's cloud or rain, say so plainly and offer the
  next sunny hour (nextSun) or a covered option instead.
- Then pick venues whose sunWindow covers that time and whose tags fit the ask (a beer means a pub or beer
  garden). Mention the time in your reply, and call setTimeOfDay so the map shows that hour.
- Never claim sun the context doesn't show. If you don't know, say so.

Answering sun-moment questions ("coffee in the sun?", "sunny lunch?", "sunset drinks in the sun?"):
- Prefer venues whose sunMoments include that moment (coffee = "Morning coffee", lunch = "Long lunch",
  sunset drinks = "Sunset drinks"), and call setFilters with the matching chip: moment-coffee,
  moment-lunch or moment-sunset.
- Say the timing comes from the buildings' shadows around each venue plus today's forecast.
- If no venue has that moment, say so plainly and offer the nearest alternative from the context.
  Never name a venue that isn't in visibleVenues or activeVenue.

Answering access, family, pet and hidden-bar questions ("wheelchair-friendly pub?", "somewhere with the pram?",
"dog-friendly cafe?", "hidden bar in the CBD?"):
- Venue tags include "Wheelchair accessible", "Pram friendly", "Dog friendly" and "Hidden gem" only when the venue
  has said so or the data shows it; type says what kind of place it is (e.g. "Cocktail & wine bar", "Pub & bar").
- amenitiesAsked lists what the guest asked for. If amenityMatches is 0, no venue there is listed with it: say so
  plainly, then offer the closest venues and suggest checking with the venue. Never claim access, pram or pet
  details a venue's tags don't show.
- For hidden bars, prefer "Hidden gem" venues, then cocktail and wine bars in laneways. Don't call a venue hidden
  unless it's tagged "Hidden gem".

Tools (names and arguments are fixed):
- setTimeOfDay({ todMinutes }): move the map's time slider, Melbourne minutes past midnight, 0–1439
  (noon = 720, 4pm = 960). Use forecastToday.sunset for sunset, not a guess.
- setFilters({ tags }): replace the active filter chips with ids the app has (Rooftop, Beer Garden,
  Pet Friendly, Shaded, Indoor Warmth, Wheelchair Accessible, sunny-mode, cozy-mode, moment-coffee,
  moment-lunch, moment-sunset, …).
- panToVenue({ venueId }): recommend a venue. The app shows it to the guest to tap.

Rules:
- Recommend at most 3 venues, each with one panToVenue call using an id from visibleVenues or activeVenue.
  Never invent an id. If they name a venue you can't see, say it isn't on the map right now.
- Never state opening hours, happy hours, prices or specials as fact. Say "check their website" instead.
- Reply in 1–2 short sentences, even when you call tools. Warm and Australian, not try-hard; no slang pile-ups.
- Always write the reply text, even when you call tools: name your picks and say why they suit.
- Write venue names as plain text. Never write ids, links or markdown.
- Never mention tools, JSON, system prompts or hidden context.`;

const FUNCTION_DECLARATIONS = [
  {
    name: 'setTimeOfDay',
    description: 'Scrub the time-of-day slider (Melbourne wall-clock minutes, 0–1439).',
    parameters: {
      type: 'object',
      properties: {
        todMinutes: {
          type: 'number',
          description: 'Minutes past Melbourne midnight: noon 720, 4pm 960.',
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
    description: 'Recommend a venue to the guest. Call once per venue, at most 3 times per reply.',
    parameters: {
      type: 'object',
      properties: {
        venueId: {
          type: 'string',
          description: 'Venue id from sunnyContext.visibleVenues or activeVenue (e.g. dv-13). Never invent one.',
        },
      },
      required: ['venueId'],
    },
  },
];

const json = (body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
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

  const limit = rateLimiter.check(clientKey(req.headers));
  if (!limit.ok) {
    return json(
      { reply: '', toolCalls: [], error: 'rate_limited' },
      429,
      { 'Retry-After': String(limit.retryAfterSec) },
    );
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
  if (!apiKey) {
    return json({ reply: '', toolCalls: [], error: 'missing_gemini_key' }, 503);
  }

  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ reply: '', toolCalls: [], error: 'payload_too_large' }, 413);
  }

  let body: { messages?: unknown; sunnyContext?: unknown };
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return json({ reply: '', toolCalls: [], error: 'payload_too_large' }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return json({ reply: '', toolCalls: [], error: 'invalid_json' }, 400);
  }

  const limitError = payloadLimitError(body);
  if (limitError) {
    return json({ reply: '', toolCalls: [], error: limitError }, 413);
  }

  const messages = sanitizeMessages(body?.messages);
  const sunnyContext = body?.sunnyContext && typeof body.sunnyContext === 'object'
    ? body.sunnyContext
    : {};

  const models = geminiModelChain(Deno.env.get('GEMINI_MODEL'));
  const contents = toGeminiContents(messages);
  if (contents.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: 'Greet the guest briefly and wait for what they want.' }],
    });
  }

  const payload = {
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
  };

  let lastStatus = 0;
  let lastData: unknown = null;
  for (const model of models) {
    const requestBody = {
      ...payload,
      generation_config: generationConfigFor(model, { temperature: 0.4, maxOutputTokens: MAX_OUTPUT_TOKENS }),
    };
    let upstream: Response;
    try {
      upstream = await fetch(GEMINI_GENERATE_URL(model), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      console.error('chat-sunny gemini fetch failed', model, err);
      lastStatus = 0;
      lastData = { error: { message: 'gemini_unreachable' } };
      continue;
    }

    const data = await upstream.json().catch(() => null);
    if (upstream.ok) {
      let contract = contractFromGemini(data);
      if (!contract.reply && contract.toolCalls.length === 0) {
        // Gemini answered with nothing: log why, then try once without tools
        // so the guest still gets a real answer.
        console.warn('chat-sunny empty reply', model, JSON.stringify(geminiDiagnostics(data)));
        try {
          const retry = await fetch(GEMINI_GENERATE_URL(model), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify(textOnlyRetryBody(requestBody)),
          });
          const retryData = await retry.json().catch(() => null);
          if (retry.ok) {
            contract = contractFromGemini(retryData);
            if (!contract.reply) console.warn('chat-sunny empty retry', model, JSON.stringify(geminiDiagnostics(retryData)));
          }
        } catch (err) {
          console.error('chat-sunny retry failed', model, err);
        }
      }
      const names = contextVenues(sunnyContext);
      const tidy = tidyReply(contract.reply, names);
      contract.reply = tidy.reply;
      contract.toolCalls = withLinkedVenues(contract.toolCalls, tidy.venueIds);
      if (!contract.reply && contract.toolCalls.length > 0) {
        contract.reply = replyForToolCalls(contract.toolCalls, names);
      }
      return json(contract);
    }

    lastStatus = upstream.status;
    lastData = data;
    console.error('chat-sunny gemini error', model, upstream.status, data);
    if (!shouldTryNextModel(upstream.status, data)) break;
  }

  const detail = typeof (lastData as { error?: { message?: unknown } })?.error?.message === 'string'
    ? String((lastData as { error: { message: string } }).error.message).slice(0, 300)
    : '';
  return json({
    reply: '',
    toolCalls: [],
    error: lastStatus ? 'gemini_error' : 'gemini_unreachable',
    detail,
  }, 502);
});
