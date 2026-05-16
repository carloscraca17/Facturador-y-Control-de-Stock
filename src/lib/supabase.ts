import { createClient } from "@supabase/supabase-js";

// Vite uses import.meta.env
// Next.js uses process.env.NEXT_PUBLIC_...
// We handle both for compatibility and user preference

const supabaseUrl = 
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined) || 
  (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined) || 
  import.meta.env.VITE_SUPABASE_URL || 
  "";

const supabaseAnonKey = 
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined) || 
  (typeof process !== "undefined" ? process.env.SUPABASE_ANON_KEY : undefined) || 
  import.meta.env.VITE_SUPABASE_ANON_KEY || 
  "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("CRITICAL: Supabase variables missing in Frontend environment.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;
