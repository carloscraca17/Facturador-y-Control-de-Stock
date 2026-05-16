import { createClient } from "@supabase/supabase-js";

// Vite uses import.meta.env
// Next.js uses process.env.NEXT_PUBLIC_...
// We handle both for compatibility and user preference

// Vite standard (Client side) - VITE_ prefix is REQUIRED for Vite
const VITE_URL = import.meta.env.VITE_SUPABASE_URL;
const VITE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fallback search (Vite build-time defines or Node environments)
const supabaseUrl = VITE_URL || "";
const supabaseAnonKey = VITE_KEY || "";

console.log("[FRONTEND] Supabase Variables Check:", { 
  hasUrl: !!supabaseUrl, 
  hasKey: !!supabaseAnonKey,
  mode: import.meta.env.MODE 
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("CRITICAL: Supabase URL or Key is missing. In Vercel, you MUST use the VITE_ prefix (e.g., VITE_SUPABASE_URL), not NEXT_PUBLIC_.");
}

// Only initialize if we have the values to prevent "supabaseUrl is required" crash
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any;

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;
