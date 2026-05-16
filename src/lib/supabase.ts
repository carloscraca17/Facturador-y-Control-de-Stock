import { createClient } from "@supabase/supabase-js";

// Vite uses import.meta.env
// Next.js uses process.env.NEXT_PUBLIC_...
// We handle both for compatibility and user preference

const supabaseUrl = 
  import.meta.env.VITE_SUPABASE_URL || 
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined) || 
  "";

const supabaseAnonKey = 
  import.meta.env.VITE_SUPABASE_ANON_KEY || 
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined) || 
  "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;
