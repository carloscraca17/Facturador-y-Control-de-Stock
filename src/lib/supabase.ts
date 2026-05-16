import { createClient } from "@supabase/supabase-js";

// Vite uses import.meta.env
// Next.js uses process.env.NEXT_PUBLIC_...
// We handle both for compatibility and user preference

// Vite standard (Client side)
const VITE_URL = import.meta.env.VITE_SUPABASE_URL;
const VITE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Next.js standard (for completeness if user migrated)
const NEXT_URL = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined;
const NEXT_KEY = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined;

const supabaseUrl = VITE_URL || NEXT_URL || "";
const supabaseAnonKey = VITE_KEY || NEXT_KEY || "";

console.log("[FRONTEND] Supabase Variables Check:", { 
  hasUrl: !!supabaseUrl, 
  urlLength: supabaseUrl?.length,
  hasKey: !!supabaseAnonKey,
  envType: import.meta.env.MODE 
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("CRITICAL: Supabase URL or Key is missing. In Vercel, ensure you added VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

// Only initialize if we have the values to prevent "supabaseUrl is required" crash
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any;

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;
