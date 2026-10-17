// Google retired the 2.x models for this key (17 Oct: 2.5 Flash / Flash-Lite
// "no longer available to new users", 2.0 Flash shut down), so everything
// fell through to gemini-flash-latest, which thought for 490 of its 512
// output tokens and returned cut-off or empty replies. Current stable models
// first; the alias stays last as a safety net. 3.8 Flash leads because
// Flash-Lite picked venues well but almost never wrote its own reply (18 Oct),
// so guests got the app's fallback line instead of Sunny talking.
export const DEFAULT_MODEL = 'gemini-3.8-flash';

export const GEMINI_MODEL_FALLBACKS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-latest',
];

export function geminiModelChain(preferred) {
  const first = String(preferred || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const seen = new Set();
  const chain = [];
  for (const model of [first, ...GEMINI_MODEL_FALLBACKS]) {
    if (!model || seen.has(model)) continue;
    seen.add(model);
    chain.push(model);
  }
  return chain;
}

export function shouldTryNextModel(status, data) {
  if (status === 404) return true;
  // Overloaded ("This model is currently experiencing high demand"): another
  // model usually answers. Quota/billing 429s are not retried.
  if (status === 500 || status === 503 || status === 504) return true;
  const message = data?.error?.message;
  if (typeof message !== 'string') return false;
  return /not found|no longer available|not supported|invalid model|high demand|overloaded/i.test(message);
}

/**
 * generation_config for one model. Thinking tokens count against
 * max_output_tokens, so Sunny asks for as little thinking as each model
 * allows: its answers are short picks from the venues it is sent.
 *
 * - Gemini 3 Flash models take thinking_level ("minimal" where supported;
 *   3.8 Flash's lowest is "low"). Google recommends leaving temperature at
 *   its 1.0 default for Gemini 3, so none is sent.
 * - Gemini 2.5 Flash takes thinking_budget 0 (kept for a GEMINI_MODEL override).
 * - Anything else (the gemini-flash-latest alias, older ids) gets no thinking
 *   setting, since it may not accept one.
 */
export function generationConfigFor(model, { temperature, maxOutputTokens }) {
    const id = String(model ?? '');
    const level = /^gemini-3\.8-flash(-|$)/.test(id) ? 'low'
        : /^gemini-3(\.\d+)?-flash(-lite)?(-|$)/.test(id) ? 'minimal'
            : null;
    if (level) return { max_output_tokens: maxOutputTokens, thinking_config: { thinking_level: level } };
    const config = { temperature, max_output_tokens: maxOutputTokens };
    if (/^gemini-2\.5-flash(-lite)?(-|$)/.test(id)) {
        config.thinking_config = { thinking_budget: 0 };
    }
    return config;
}

/** Why Gemini returned what it did, for logs: finish reason, message, token use. */
export function geminiDiagnostics(data) {
    const c = data?.candidates?.[0];
    return {
        finishReason: c?.finishReason ?? c?.finish_reason ?? null,
        finishMessage: typeof c?.finishMessage === 'string' ? c.finishMessage.slice(0, 200) : null,
        blockReason: data?.promptFeedback?.blockReason ?? null,
        usage: data?.usageMetadata ?? null,
    };
}

/**
 * The request body for a second, text-only try after Gemini returned neither
 * text nor a tool call (17 Oct: "anything sunny near 3141?" with 15 venues
 * came back empty every time, while one-tool questions worked; Gemini 2.5
 * can fail a multi-call reply as MALFORMED_FUNCTION_CALL). Function calling
 * is switched off and Sunny is asked to name its picks in the reply instead.
 */
export function textOnlyRetryBody(body) {
    const parts = Array.isArray(body?.system_instruction?.parts) ? body.system_instruction.parts : [];
    return {
        ...body,
        system_instruction: {
            parts: [
                ...parts,
                { text: 'Tools are unavailable for this reply. Answer in 1–2 short sentences and name up to 3 venues from the context by name.' },
            ],
        },
        tool_config: { function_calling_config: { mode: 'NONE' } },
    };
}
