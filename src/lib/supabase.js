import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fksuqgvsazoxarocmaii.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_fninyuZBIHxr7hz_1gQ69g_osWRZhaz';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
