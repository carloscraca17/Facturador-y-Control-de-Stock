import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "")
  .trim()
  .replace(/\/$/, "")
  .replace(/\/rest\/v1$/, "");
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing. Please check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in project secrets.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
