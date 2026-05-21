import { supabase } from "./supabase";

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  let finalInit: RequestInit = init || {};
  
  const isApi = url.startsWith("/api/") || url.includes("/api/");
  if (isApi && !url.includes("/api/login") && !url.includes("/api/health")) {
    const token = localStorage.getItem("glow_token") || "";

    const headersObj: Record<string, string> = {};
    if (finalInit.headers) {
      if (finalInit.headers instanceof Headers) {
        finalInit.headers.forEach((value, key) => {
          headersObj[key] = value;
        });
      } else if (Array.isArray(finalInit.headers)) {
        finalInit.headers.forEach(([key, value]) => {
          headersObj[key] = value;
        });
      } else {
        Object.keys(finalInit.headers).forEach(key => {
          headersObj[key] = (finalInit.headers as Record<string, string>)[key];
        });
      }
    }
    
    if (token) {
      const authValue = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
      const authKey = Object.keys(headersObj).find(k => k.toLowerCase() === "authorization") || "Authorization";
      headersObj[authKey] = authValue;
    }
    
    const hasContentType = Object.keys(headersObj).some(k => k.toLowerCase() === "content-type");
    if (!hasContentType && finalInit.body && !(finalInit.body instanceof FormData)) {
      headersObj["Content-Type"] = "application/json";
    }

    finalInit = {
      ...finalInit,
      headers: headersObj
    };
  }

  return fetch(input, finalInit);
}
