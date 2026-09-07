import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isServiceRoleKey =
  supabaseKey?.includes('"role":"service_role"') || supabaseKey?.startsWith('sb_secret_');

// Graceful fallback — missing env vars log a warning but never throw,
// so the map and UI still render during demos or cold-start hiccups.
if (!supabaseUrl || !supabaseKey || isServiceRoleKey) {
  console.warn(
    '[Sunstay] Supabase configuration is missing or uses a service-role key.\n' +
    'DB features will be disabled. Set a public Supabase URL and anon key in your .env.'
  );
}

// Export null when credentials are absent — callers must guard: if (supabase) { ... }
export const supabase =
  supabaseUrl && supabaseKey && !isServiceRoleKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
