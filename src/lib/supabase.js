import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Graceful fallback — missing env vars log a warning but never throw,
// so the map and UI still render during demos or cold-start hiccups.
if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[Sunstay] Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).\n' +
    'DB features will be disabled. Set these in your .env to enable them.'
  );
}

// Export null when credentials are absent — callers must guard: if (supabase) { ... }
export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;
