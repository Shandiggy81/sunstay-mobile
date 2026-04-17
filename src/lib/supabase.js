import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = supabaseUrl && supabaseAnonKey !== 'placeholder' 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : createClient('https://placeholder.supabase.co', 'placeholder');
