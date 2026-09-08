import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[Sunstay Admin] Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).\n' +
    'Auth will be disabled. Set these in sunstay-admin/.env.local to enable them.'
  );
}

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;
