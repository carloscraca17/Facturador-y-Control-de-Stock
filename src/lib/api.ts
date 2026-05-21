import { supabase } from "./supabase";

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  let finalInit: RequestInit = init || {};
  
  if (url.startsWith("/api/") && !url.includes("/api/login") && !url.includes("/api/health")) {
    const token = localStorage.getItem("glow_token") || "";

    const headers = new Headers(finalInit.headers || {});
    
    if (token) {
      const authValue = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
      headers.set("Authorization", authValue);
    }
    
    if (!headers.has("Content-Type") && finalInit.body && !(finalInit.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    finalInit = {
      ...finalInit,
      headers
    };
  }

  return fetch(input, finalInit);
}
