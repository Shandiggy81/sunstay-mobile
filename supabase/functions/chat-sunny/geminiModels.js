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
