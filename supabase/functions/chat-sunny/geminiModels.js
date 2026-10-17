export const DEFAULT_MODEL = 'gemini-2.5-flash';

export const GEMINI_MODEL_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-1.5-flash',
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
  const message = data?.error?.message;
  if (typeof message !== 'string') return false;
  return /not found|no longer available|not supported|invalid model/i.test(message);
}

/**
 * generation_config for one model. Gemini 2.5 Flash models "think" before
 * answering, and those thinking tokens count against max_output_tokens: with
 * a 512-token cap and a dozen venues to compare, the thinking used the whole
 * budget and Gemini returned no text and no tool call (seen 17 Oct: the chat
 * fell back to its canned reply). Sunny's answers are short picks from the
 * venues it is sent, so thinking is switched off for those models. Other
 * models get no thinking_config (older ones reject it).
 */
export function generationConfigFor(model, { temperature, maxOutputTokens }) {
    const config = { temperature, max_output_tokens: maxOutputTokens };
    if (/^gemini-2\.5-flash(-lite)?(-|$)/.test(String(model))) {
        config.thinking_config = { thinking_budget: 0 };
    }
    return config;
}
