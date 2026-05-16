import { createClient } from "@supabase/supabase-js";

// Vite uses import.meta.env
// Next.js uses process.env.NEXT_PUBLIC_...
// We handle both for compatibility and user preference

const envUrl = (typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) : undefined);
const envKey = (typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY) : undefined);

const supabaseUrl = envUrl || import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = envKey || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("CRITICAL: Supabase variables missing in Frontend environment. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

// Always pass arguments explicitly to createClient
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;
