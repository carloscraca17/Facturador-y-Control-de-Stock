import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

import { createClient } from "@supabase/supabase-js";
import { rawProductData } from "./products_data.js";

const getSupabaseClient = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("[BACKEND] Missing Supabase variables.");
    return null;
  }
  
  try {
    const normalizedUrl = url.trim().replace(/\/$/, "").replace(/\/rest\/v1$/, "");
    return createClient(normalizedUrl, key.trim());
  } catch (err: any) {
    console.error("[BACKEND] Initialization Error:", err);
    return null;
  }
};

const supabase = getSupabaseClient();

if (!supabase) {
  console.error("[BACKEND] SUPABASE INITIALIZATION FAILED. Check env vars.");
}

const AUTH_TOKEN = "glow-manager-session-true";
export const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// Auth Middleware
const authenticate = async (req: any, res: any, next: any) => {
  const token = getSessionToken(req);
  if (!token) {
    console.warn("[AUTH] No token found in session or headers");
    return res.status(401).json({ error: "Unauthorized", details: "No active session" });
  }

  if (token === AUTH_TOKEN) {
    return next();
  }

  if (supabase) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        (req as any).user = user;
        return next();
      } else if (error) {
        if (error.message && error.message.includes("token is expired")) {
          console.warn("[AUTH] Session has expired. Prompting login.");
          return res.status(401).json({ error: "Unauthorized", details: "Session expired" });
        }
        console.warn("[AUTH] Supabase verification failed:", error.message);
      }
    } catch (err: any) {
      console.warn("[AUTH] Error verifying token:", err.message);
    }
  }

  console.warn(`[AUTH] Unauthorized access attempt.`);
  return res.status(401).json({ error: "Unauthorized", details: "No active session" });
};

// Robust session token parser from HTTP headers and cookies
const getSessionToken = (req: any): string => {
  // 1. Try Authorization header
  const authHeader = req.headers.authorization || "";
  if (authHeader) {
    const cleanToken = authHeader.replace(/^Bearer\s+/, "").trim();
    if (cleanToken && cleanToken !== "undefined" && cleanToken !== "null" && cleanToken !== AUTH_TOKEN) {
      return cleanToken;
    }
    if (cleanToken === AUTH_TOKEN) {
      return AUTH_TOKEN;
    }
  }

  // 2. Parse from Cookie header
  const cookieHeader = req.headers.cookie || "";
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").reduce((acc: any, c: string) => {
      const parts = c.trim().split("=");
      if (parts.length >= 2) {
        acc[parts[0]] = parts.slice(1).join("=");
      }
      return acc;
    }, {});

    // Try finding standard supabase cookie references (like sb-<reference>-auth-token)
    const supabaseCookieKey = Object.keys(cookies).find(key => 
      key.startsWith("sb-") && (key.endsWith("-auth-token") || key.includes("access-token"))
    );

    if (supabaseCookieKey) {
      try {
        const rawValue = cookies[supabaseCookieKey];
        const value = decodeURIComponent(rawValue);
        if (value.startsWith("{")) {
          const parsed = JSON.parse(value);
          if (parsed.access_token) return parsed.access_token;
        } else if (value.startsWith("[")) {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed) && parsed[0]) {
            return parsed[0];
          }
        }
        return value;
      } catch (err: any) {
        return cookies[supabaseCookieKey];
      }
    }

    // Try finding chunked cookies sb-<project>-auth-token.0, .1 etc.
    const chunkedKey = Object.keys(cookies).find(key => key.startsWith("sb-") && key.includes("-auth-token."));
    if (chunkedKey) {
      const prefix = chunkedKey.split(".")[0];
      let chunkIndex = 0;
      let fullValue = "";
      while (cookies[`${prefix}.${chunkIndex}`]) {
        fullValue += cookies[`${prefix}.${chunkIndex}`];
        chunkIndex++;
      }
      try {
        const decoded = decodeURIComponent(fullValue);
        if (decoded.startsWith("{")) {
          const parsed = JSON.parse(decoded);
          if (parsed.access_token) return parsed.access_token;
        } else if (decoded.startsWith("[")) {
          const parsed = JSON.parse(decoded);
          if (Array.isArray(parsed) && parsed[0]) {
            return parsed[0];
          }
        }
        return decoded;
      } catch (err: any) {
        console.warn("[AUTH_DEBUG] Failed parsing chunked keys:", err.message);
      }
    }

    if (cookies["sb-access-token"]) return cookies["sb-access-token"];
    if (cookies["supabase-auth-token"]) return cookies["supabase-auth-token"];
  }

  return "";
};

// Global Guard for all /api routes
app.use("/api", (req, res, next) => {
  const publicRoutes = ["/health", "/admin/seed", "/login"];
  if (publicRoutes.includes(req.path)) return next();
  
  if (!supabase) {
    console.error(`[BACKEND] Guard: No Supabase for ${req.path}`);
    return res.status(503).json({ 
      error: "Servidor no configurado", 
      details: "La conexión con Supabase falló en el arranque. Revisa tus variables de entorno en Vercel." 
    });
  }
  next();
});

// Health check
app.get("/api/health", async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ status: "config_missing", message: "Supabase configuration is missing." });
    }

    const [prod, sale, exp, mov, user, cust] = await Promise.all([
      supabase.from("products").select("id").limit(1),
      supabase.from("sales").select("id").limit(1),
      supabase.from("expenses").select("id").limit(1),
      supabase.from("movements").select("id").limit(1),
      supabase.from("app_users").select("id").limit(1),
      supabase.from("customers").select("id").limit(1)
    ]);

    if (prod.error || sale.error || exp.error || mov.error || user.error || cust.error) {
      return res.json({ 
        status: "table_error", 
        details: { 
          products: prod.error?.message || "OK", 
          sales: sale.error?.message || "OK", 
          expenses: exp.error?.message || "OK",
          movements: mov.error?.message || "OK",
          app_users: user.error?.message || "OK",
          customers: cust.error?.message || "OK"
        }
      });
    }

    res.json({ 
      status: "ok", 
      supabase: "connected", 
      empty: prod.data?.length === 0 && sale.data?.length === 0,
      time: new Date().toISOString() 
    });
  } catch (err: any) {
    console.error("[HEALTH] Fatal:", err);
    res.json({ status: "error", message: err.message });
  }
});

// Login API
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  
  try {
    if (!supabase) {
        // Fallback for initial admin
        if (username === "admin" && password === "admin123") {
            return res.json({ token: AUTH_TOKEN, user: { id: "admin", username: "admin", role: "admin", permissions: ["dashboard", "inventory", "financials", "access"] } });
        }
        return res.status(503).json({ error: "DB not connected" });
    }

    const { data: user, error } = await supabase
      .from("app_users")
      .select("*")
      .eq("username", username)
      .eq("password", password)
      .maybeSingle();

    if (error) console.warn("[LOGIN] Supabase check error:", error.message);

    let realUser: any = null;
    if (user) {
      realUser = { id: user.id, username: user.username, role: user.role, permissions: user.permissions };
    } else if (username === "admin" && password === "admin123") {
      realUser = { id: "admin", username: "admin", role: "admin", permissions: ["dashboard", "inventory", "financials", "access"] };
    }

    if (realUser) {
      const email = `${username.toLowerCase()}@glowmanager.com`;
      const supabasePassword = password.length >= 6 ? password : `${password}123456`;
      let token = AUTH_TOKEN;
      let finalUserId = realUser.id;

      try {
        // 1. Try to sign in the user
        let { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: supabasePassword
        });

        // 2. If sign-in fails, attempt to create the user first
        if (signInError) {
          console.log(`[LOGIN] User ${username} not found in auth.users or wrong pass. Creating user via admin interface...`);
          const { data: newAuthUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            password: supabasePassword,
            email_confirm: true,
            user_metadata: { username, role: realUser.role }
          });

          if (!createError && newAuthUser?.user) {
            console.log(`[LOGIN] User ${username} created in auth.users directly. ID: ${newAuthUser.user.id}`);
            // Force sign in now that they are created
            const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
              email,
              password: supabasePassword
            });
            if (!retryError && retryData?.session) {
              token = retryData.session.access_token;
              finalUserId = retryData.user.id;
            }
          } else {
            console.warn(`[LOGIN] Admin user creation failed for ${username}:`, createError?.message);
            // Fallback to signUp
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
              email,
              password: supabasePassword,
              options: { data: { username, role: realUser.role } }
            });
            if (!signUpError && signUpData?.session) {
              token = signUpData.session.access_token;
              finalUserId = signUpData.user?.id || finalUserId;
            }
          }
        } else if (authData && authData.session) {
          token = authData.session.access_token;
          finalUserId = authData.user.id;
        }

        // 3. Update the app_users table record so its ID matches the auth.users ID
        // This ensures any DB references or joins behave perfectly!
        if (finalUserId && finalUserId !== "admin" && user && user.id !== finalUserId) {
          console.log(`[LOGIN] Updating app_users ID from ${user.id} to auth.users ID ${finalUserId}`);
          const { error: updateErr } = await supabase
            .from("app_users")
            .update({ id: finalUserId })
            .eq("id", user.id);
          if (updateErr) {
            console.warn("[LOGIN] FAILED to update app_users ID matching auth.users:", updateErr.message);
          }
        }
      } catch (authErr: any) {
        console.warn("[LOGIN] Automatic auth.users sync failed:", authErr.message);
      }

      return res.json({
        token,
        user: { id: finalUserId, username: realUser.username, role: realUser.role, permissions: realUser.permissions }
      });
    }

    res.status(401).json({ error: "Credenciales inválidas" });
  } catch (err: any) {
    console.error("[LOGIN] Fatal:", err);
    res.status(500).json({ error: "Error de servidor al iniciar sesión" });
  }
});

// Users Management API
app.get("/api/users", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { data, error } = await supabase
      .from("app_users")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error("[USERS] GET Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { data, error } = await supabase
      .from("app_users")
      .insert([req.body])
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/users/:id", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { data, error } = await supabase
      .from("app_users")
      .update(req.body)
      .eq("id", req.params.id)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/users/:id", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { error } = await supabase
      .from("app_users")
      .delete()
      .eq("id", req.params.id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Products API
app.get("/api/products", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 1000;
    const search = req.query.search as string;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("products")
      .select("*", { count: "exact" });

    if (search) {
      query = query.or(`nombre.ilike.%${search}%,sku_barcode.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    
    if (error) throw error;
    res.json({ data: data || [], total: count || 0 });
  } catch (error: any) {
    console.error("[PRODUCTS] GET Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/products", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const p = req.body;
    const product = {
      nombre: p.nombre,
      sku_barcode: p.sku_barcode,
      categoria: p.categoria,
      costo_unitario: Number(p.costo_unitario) || 0,
      precio_venta: Number(p.precio_venta) || 0,
      stock_actual: Number(p.stock_actual) || 0,
      stock_minimo: Number(p.stock_minimo) || 0,
      detalles: p.detalles,
      userId: p.userId || "admin",
      updated_at: new Date()
    };

    const { data, error } = await supabase
      .from("products")
      .upsert([product], { onConflict: 'sku_barcode' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error("[PRODUCTS] POST Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/products/:id", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { data, error } = await supabase
      .from("products")
      .update({ ...req.body, updated_at: new Date() })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Implementation of user request: update sales when product price or cost changes
    if (req.body.precio_venta !== undefined || req.body.costo_unitario !== undefined) {
      const newPrice = Number(data.precio_venta);
      const newCost = Number(data.costo_unitario);

      const { data: salesToUpdate } = await supabase
        .from("sales")
        .select("id, descuento")
        .eq("product_id", req.params.id);

      if (salesToUpdate && salesToUpdate.length > 0) {
        // Update all related sales to reflect the new financial reality
        const updates = salesToUpdate.map(sale => ({
          id: sale.id,
          ingreso_bruto: newPrice,
          ingreso_neto: (newPrice - (Number(sale.descuento) || 0)) - newCost
        }));

        // Perform updates in batches or individually if upsert is not preferred
        for (const update of updates) {
          await supabase
            .from("sales")
            .update({
              ingreso_bruto: update.ingreso_bruto,
              ingreso_neto: update.ingreso_neto
            })
            .eq("id", update.id);
        }
      }
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/products/:id", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sales API
app.get("/api/sales", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 1000;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from("sales")
      .select("*, product_info:products(nombre, sku_barcode)", { count: "exact" })
      .order("fecha_venta", { ascending: false })
      .range(from, to);

    if (error) throw error;
    res.json({ data: data || [], total: count || 0 });
  } catch (error: any) {
    console.error("[SALES] GET Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sales", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const s = req.body;
    // Fetch product unit cost to ensure accurate ingreso_neto
    let productCost = 0;
    if (s.product_id) {
      const { data: prod } = await supabase.from("products").select("costo_unitario").eq("id", s.product_id).single();
      if (prod) productCost = Number(prod.costo_unitario) || 0;
    }

    const bruto = Number(s.ingreso_bruto) || 0;
    const desc = Number(s.descuento) || 0;

    // Dynamic user retrieval to avoid violating FK constraints on customers table
    const cleanToken = getSessionToken(req);
    let user: any = (req as any).user || null;
    if (supabase) {
      try {
        if (!user && cleanToken && cleanToken !== AUTH_TOKEN) {
          const { data: authData, error: authError } = await supabase.auth.getUser(cleanToken);
          if (authData?.user && !authError) {
            user = authData.user;
          }
        }
        if (!user) {
          const { data: authData, error: authError } = await supabase.auth.getUser();
          if (authData?.user && !authError) {
            user = authData.user;
          }
        }
      } catch (err) {
        console.warn("[SALES_POST] Failed to get user from Supabase Auth:", err);
      }
    }

    const activeUserId = user?.id || s.userId || "admin";

    // Direct auto-sync of active user in app_users to verify compatibility with foreign key constraint
    if (supabase && user && user.id) {
      try {
        const { data: matchedAppUser } = await supabase
          .from("app_users")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (!matchedAppUser) {
          console.log(`[SALES_POST] Synchronizing new or active user "${user.id}" in app_users table`);
          const userMail = user.email || "";
          const metadataUsername = user.user_metadata?.username || userMail.split("@")[0] || "manager";
          
          const { data: userByUsername } = await supabase
            .from("app_users")
            .select()
            .eq("username", metadataUsername)
            .maybeSingle();

          if (userByUsername) {
            await supabase
              .from("app_users")
              .update({ id: user.id })
              .eq("id", userByUsername.id);
            console.log(`[SALES_POST] Updated app_users ID from ${userByUsername.id} to ${user.id}`);
          } else {
            const defaultRole = user.user_metadata?.role || "manager";
            await supabase
              .from("app_users")
              .insert([{
                id: user.id,
                username: metadataUsername,
                password: "custom_user_123",
                role: defaultRole,
                permissions: ["dashboard", "inventory", "financials", "customers"]
              }]);
            console.log(`[SALES_POST] Created app_users row for ${metadataUsername}`);
          }
        }
      } catch (syncErr: any) {
        console.warn("[SALES_POST] Error in app_users sync:", syncErr.message);
      }
    }

    const sale = {
      ...s,
      userId: activeUserId,
      ingreso_bruto: bruto,
      ingreso_neto: (bruto - desc) - productCost,
      descuento: desc,
      pago_parcial: Number(s.pago_parcial) || 0,
      fecha_venta: s.fecha_venta || new Date()
    };

    const { data, error } = await supabase.from("sales").insert([sale]).select().single();
    if (error) throw error;

    // Automaticaly register/update customer
    if (sale.cliente_nombre) {
      try {
        const { data: existingCust } = await supabase
          .from("customers")
          .select("id")
          .eq("nombre", sale.cliente_nombre)
          .eq("apellido", sale.cliente_apellido || "")
          .maybeSingle();

        if (!existingCust) {
          await supabase.from("customers").insert([{
            nombre: sale.cliente_nombre,
            apellido: sale.cliente_apellido || "",
            userId: activeUserId,
            canal: s.canal_venta || "LOCAL"
          }]);
        }
      } catch (custErr) {
        console.error("[CUST_AUTO] Error:", custErr);
      }
    }

    // Decrement stock
    if (data.product_id) {
      const { data: prod } = await supabase.from("products").select("stock_actual").eq("id", data.product_id).single();
      if (prod) {
        await supabase.from("products")
          .update({ stock_actual: Math.max(0, (Number(prod.stock_actual) || 0) - 1) })
          .eq("id", data.product_id);
      }
    }

    // Fetch product name for better description
    let productName = "Venta";
    if (data.product_id) {
      const { data: prod } = await supabase.from("products").select("nombre").eq("id", data.product_id).single();
      if (prod) productName = prod.nombre;
    }

    const clienteDesc = `${data.cliente_nombre || ""} ${data.cliente_apellido || ""}`.trim() || "Consumidor Final";
    const detalleDesc = data.detalles_venta ? ` (${data.detalles_venta})` : "";

    // Movement fallback
    const amount = data.pagado ? Number(data.ingreso_bruto) : (Number(data.pago_parcial) || 0);
    if (amount > 0) {
      const { error: moveError } = await supabase.from("movements").insert([{
        tipo_movimiento: "Ingreso",
        categoria: "Venta",
        monto: amount,
        moneda: data.moneda || "ARS",
        descripcion: `Ingreso de Venta - ${clienteDesc} - ${productName}${detalleDesc}`,
        sale_id: data.id,
        fecha: new Date(),
        userId: "admin"
      }]);
      if (moveError) console.error("[MOVE_POST] Error:", moveError);
    }

    res.json(data);
  } catch (error: any) {
    console.error("[SALES] POST Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/sales/:id", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    
    // 1. Get original sale to compare payment state
    const { data: oldSale, error: fetchError } = await supabase
      .from("sales")
      .select("*")
      .eq("id", req.params.id)
      .single();
    
    if (fetchError || !oldSale) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    const { product_info, ...s } = req.body;
    
    // Fetch product unit cost for net income recalculation
    const pid = s.product_id || oldSale.product_id;
    let productCost = 0;
    if (pid) {
      const { data: prod } = await supabase.from("products").select("costo_unitario").eq("id", pid).single();
      if (prod) productCost = Number(prod.costo_unitario) || 0;
    }

    const bruto = (s.ingreso_bruto !== undefined && s.ingreso_bruto !== null) ? Number(s.ingreso_bruto) : Number(oldSale.ingreso_bruto || 0);
    const desc = (s.descuento !== undefined && s.descuento !== null) ? Number(s.descuento) : Number(oldSale.descuento || 0);
    const pago_parcial = (s.pago_parcial !== undefined && s.pago_parcial !== null) ? Number(s.pago_parcial) : Number(oldSale.pago_parcial || 0);

    // Dynamic user retrieval to avoid violating FK constraints on customers table
    const cleanToken = getSessionToken(req);
    let user: any = (req as any).user || null;
    if (supabase) {
      try {
        if (!user && cleanToken && cleanToken !== AUTH_TOKEN) {
          const { data: authData, error: authError } = await supabase.auth.getUser(cleanToken);
          if (authData?.user && !authError) {
            user = authData.user;
          }
        }
        if (!user) {
          const { data: authData, error: authError } = await supabase.auth.getUser();
          if (authData?.user && !authError) {
            user = authData.user;
          }
        }
      } catch (err) {
        console.warn("[SALES_PUT] Failed to get user from Supabase Auth:", err);
      }
    }

    const activeUserId = user?.id || s.userId || oldSale.userId || "admin";

    // Direct auto-sync of active user in app_users to verify compatibility with foreign key constraint
    if (supabase && user && user.id) {
      try {
        const { data: matchedAppUser } = await supabase
          .from("app_users")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (!matchedAppUser) {
          console.log(`[SALES_PUT] Synchronizing new or active user "${user.id}" in app_users table`);
          const userMail = user.email || "";
          const metadataUsername = user.user_metadata?.username || userMail.split("@")[0] || "manager";
          
          const { data: userByUsername } = await supabase
            .from("app_users")
            .select()
            .eq("username", metadataUsername)
            .maybeSingle();

          if (userByUsername) {
            await supabase
              .from("app_users")
              .update({ id: user.id })
              .eq("id", userByUsername.id);
            console.log(`[SALES_PUT] Updated app_users ID from ${userByUsername.id} to ${user.id}`);
          } else {
            const defaultRole = user.user_metadata?.role || "manager";
            await supabase
              .from("app_users")
              .insert([{
                id: user.id,
                username: metadataUsername,
                password: "custom_user_123",
                role: defaultRole,
                permissions: ["dashboard", "inventory", "financials", "customers"]
              }]);
            console.log(`[SALES_PUT] Created app_users row for ${metadataUsername}`);
          }
        }
      } catch (syncErr: any) {
        console.warn("[SALES_PUT] Error in app_users sync:", syncErr.message);
      }
    }

    const updateData: any = {};
    const allowedColumns = [
      "canal_venta",
      "product_id",
      "ingreso_bruto",
      "comision_plataforma",
      "costo_envio",
      "ingreso_neto",
      "descuento",
      "cliente_nombre",
      "cliente_apellido",
      "pagado",
      "estado_arca",
      "cae_arca",
      "userId",
      "fecha_venta",
      "moneda",
      "pago_parcial",
      "detalles_venta",
      "estado_entrega"
    ];

    for (const key of allowedColumns) {
      if (s[key] !== undefined) {
        updateData[key] = s[key];
      }
    }

    // Set correctly calculated and structured values
    updateData.userId = activeUserId;
    updateData.ingreso_bruto = bruto;
    updateData.ingreso_neto = (bruto - desc) - productCost;
    updateData.descuento = desc;
    updateData.pago_parcial = pago_parcial;
    if (s.pagado !== undefined) {
      updateData.pagado = Boolean(s.pagado);
    }

    // 2. Perform the update
    const { data: updatedSale, error: updateError } = await supabase
      .from("sales")
      .update(updateData)
      .eq("id", req.params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Automaticaly register/update customer on update as well
    if (updatedSale.cliente_nombre) {
      try {
        const { data: existingCust } = await supabase
          .from("customers")
          .select("id")
          .eq("nombre", updatedSale.cliente_nombre)
          .eq("apellido", updatedSale.cliente_apellido || "")
          .maybeSingle();

        if (!existingCust) {
          await supabase.from("customers").insert([{
            nombre: updatedSale.cliente_nombre,
            apellido: updatedSale.cliente_apellido || "",
            userId: activeUserId,
            canal: updatedSale.canal_venta || "LOCAL"
          }]);
        }
      } catch (custErr) {
        console.error("[CUST_AUTO_UP] Error:", custErr);
      }
    }

    // 3. Sync with movements
    const oldPaid = oldSale.pagado ? Number(oldSale.ingreso_bruto) : (Number(oldSale.pago_parcial) || 0);
    const newPaid = updatedSale.pagado ? Number(updatedSale.ingreso_bruto) : (Number(updatedSale.pago_parcial) || 0);
    const diff = newPaid - oldPaid;

    if (Math.abs(diff) > 0.01) {
      // Fetch product name for description
      let productName = "Venta";
      if (updatedSale.product_id) {
        const { data: prod } = await supabase.from("products").select("nombre").eq("id", updatedSale.product_id).single();
        if (prod) productName = prod.nombre;
      }
      const clienteDesc = `${updatedSale.cliente_nombre || ""} ${updatedSale.cliente_apellido || ""}`.trim() || "Consumidor Final";
      const detalleDesc = updatedSale.detalles_venta ? ` (${updatedSale.detalles_venta})` : "";

      const { error: syncError } = await supabase.from("movements").insert([{
        tipo_movimiento: diff > 0 ? "Ingreso" : "Egreso",
        categoria: "Venta",
        monto: Math.abs(diff),
        moneda: updatedSale.moneda || "ARS",
        descripcion: `${diff > 0 ? "Cobro" : "Reverso"} de Venta - ${clienteDesc} - ${productName}${detalleDesc}`,
        sale_id: updatedSale.id,
        fecha: new Date(),
        userId: "admin"
      }]);
      if (syncError) console.error("[MOVE_SYNC] Error:", syncError);
    }

    res.json(updatedSale);
  } catch (error: any) {
    console.error("[SALES] PUT Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk Delete Routes
app.post("/api/bulk-delete/:table", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { table } = req.params;
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    // Special clean up for sales
    if (table === "sales") {
      await supabase.from("movements").delete().in("sale_id", ids);
    }

    const { error, count } = await supabase
      .from(table)
      .delete()
      .in("id", ids);

    if (error) throw error;
    res.json({ success: true, count });
  } catch (err: any) {
    console.error(`[BULK DELETE ${req.params.table}] Error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk Import Routes
app.post("/api/bulk-import/:table", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { table } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    const onConflict = table === "products" ? "sku_barcode" : "id";
    
    // We use upside to avoid duplicates if they import multiple times
    const { data, error } = await supabase
      .from(table)
      .upsert(items, { onConflict })
      .select();

    if (error) throw error;
    res.json({ success: true, count: data?.length || 0 });
  } catch (err: any) {
    console.error(`[BULK IMPORT ${req.params.table}] Error:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/sales/:id", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    
    // Fetch sale first to find the product_id and restore stock
    const { data: sale, error: fetchError } = await supabase
      .from("sales")
      .select("product_id")
      .eq("id", req.params.id)
      .single();

    if (fetchError) throw fetchError;

    if (sale && sale.product_id) {
        // Increment stock
        const { data: prod } = await supabase.from("products").select("stock_actual").eq("id", sale.product_id).single();
        if (prod) {
            await supabase
                .from("products")
                .update({ stock_actual: Number(prod.stock_actual) + 1 })
                .eq("id", sale.product_id);
        }
    }

    // Clean up associated movements
    await supabase.from("movements").delete().eq("sale_id", req.params.id);

    const { error: deleteError } = await supabase.from("sales").delete().eq("id", req.params.id);
    if (deleteError) throw deleteError;
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Expenses API
app.get("/api/expenses", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("fecha_gasto", { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/expenses", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const exp = req.body;
    const { data, error } = await supabase.from("expenses").insert([exp]).select().single();
    if (error) throw error;

    // Create movement for expense
    await supabase.from("movements").insert([{
      tipo_movimiento: "Egreso",
      categoria: "Varios",
      monto: Number(exp.monto) || 0,
      moneda: "ARS", // Assuming ARS for legacy expenses, or use exp.moneda if context exists
      descripcion: `Gasto: ${exp.descripcion}`,
      fecha: exp.fecha_gasto || new Date(),
      userId: exp.userId || "admin"
    }]);

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stats API
app.get("/api/stats", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const [salesRes, productsRes, movementsRes] = await Promise.all([
      supabase.from("sales").select("ingreso_bruto, ingreso_neto, pagado, pago_parcial, estado_arca, canal_venta, moneda, fecha_venta"),
      supabase.from("products").select("stock_actual, stock_minimo"),
      supabase.from("movements").select("monto, tipo_movimiento, moneda")
    ]);

    const sales = salesRes.data || [];
    const products = productsRes.data || [];
    const movements = movementsRes.data || [];

    // Filter ARS sales for main currency totals
    const arsSales = sales.filter(s => (s.moneda || "ARS") === "ARS");

    // Monthly Gross Sales calculation
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthlyGrossSales = arsSales
      .filter(s => {
        const d = new Date(s.fecha_venta);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, s) => acc + (Number(s.ingreso_bruto) || 0), 0);

    // Total Gross Sales (ARS only)
    const totalGrossSales = arsSales.reduce((acc, s) => acc + (Number(s.ingreso_bruto) || 0), 0);
    
    // Total Collected (ARS only)
    const totalCollected = arsSales.reduce((acc, s) => 
      s.pagado ? 
      acc + (Number(s.ingreso_bruto) || 0) : 
      acc + (Number(s.pago_parcial) || 0), 0);

    // Calculate ACTUAL balance from ALL movements in DB
    const currentBalanceARS = movements
      .filter(m => (m.moneda || "ARS") === "ARS")
      .reduce((acc, m) => m.tipo_movimiento === "Ingreso" ? acc + Number(m.monto) : acc - Number(m.monto), 0);
    
    const currentBalanceUSD = movements
      .filter(m => m.moneda === "USD")
      .reduce((acc, m) => m.tipo_movimiento === "Ingreso" ? acc + Number(m.monto) : acc - Number(m.monto), 0);

    // Unpaid Total (ARS only)
    const unpaidTotal = arsSales.reduce((acc, s) => 
      s.pagado ? 
      acc : 
      acc + (Math.max(0, (Number(s.ingreso_bruto) || 0) - (Number(s.pago_parcial) || 0))), 0);

    const salesByChannel = {
      Local: arsSales.filter(s => s.canal_venta === "Local").reduce((acc, s) => acc + (Number(s.ingreso_bruto) || 0), 0),
      Web: arsSales.filter(s => s.canal_venta === "Web").reduce((acc, s) => acc + (Number(s.ingreso_bruto) || 0), 0),
      MercadoLibre: arsSales.filter(s => s.canal_venta === "MercadoLibre").reduce((acc, s) => acc + (Number(s.ingreso_bruto) || 0), 0)
    };

    const realProfit = arsSales.reduce((acc, s) => acc + (Number(s.ingreso_neto) || 0), 0);

    res.json({
      totalGrossSales,
      totalCollected,
      currentBalanceARS,
      currentBalanceUSD,
      monthlyGrossSales,
      salesByChannel,
      realProfit,
      stockAlerts: products.filter(p => Number(p.stock_actual) <= Number(p.stock_minimo)).length,
      arcaPending: sales.filter(s => s.estado_arca === "Pendiente").length,
      salesCount: sales.length,
      unpaidTotal
    });
  } catch (err: any) {
    console.error("[STATS] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Movements API
app.get("/api/movements", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { data, error } = await supabase
      .from("movements")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/movements", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { data, error } = await supabase.from("movements").insert([req.body]).select().single();
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/movements/:id", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { data, error } = await supabase.from("movements").update(req.body).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/movements/:id", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { error } = await supabase.from("movements").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Customers API
app.get("/api/customers", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("nombre", { ascending: true });
    
    if (error) {
      console.error("[CUST_LIST] Error:", JSON.stringify(error, null, 2));
      if ((error as any).code === '42P01') {
        return res.status(404).json({ 
          error: "La tabla 'customers' no existe.",
          details: "Debes crear la tabla 'customers' en Supabase con las columnas: nombre, apellido, canal, userId."
        });
      }
      throw error;
    }

    // Fetch all sales to calculate balances and purchases
    const { data: allSales } = await supabase.from("sales").select("*, product_info:products(nombre, sku_barcode)");
    
    const enrichedData = (data || []).map(cust => {
      const custSales = (allSales || []).filter(s => 
        String(s.cliente_nombre).toLowerCase() === String(cust.nombre).toLowerCase() && 
        String(s.cliente_apellido || "").toLowerCase() === String(cust.apellido || "").toLowerCase()
      );

      const totalPurchased = custSales.reduce((acc, s) => acc + (Number(s.ingreso_bruto) || 0), 0);
      const totalPaid = custSales.reduce((acc, s) => {
        if (s.pagado) return acc + (Number(s.ingreso_bruto) || 0);
        return acc + (Number(s.pago_parcial) || 0);
      }, 0);

      return {
        ...cust,
        totalPurchased,
        debt: totalPurchased - totalPaid,
        salesCount: custSales.length,
        purchases: custSales
      };
    });

    res.json(enrichedData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/customers", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    
    let customerData = req.body;
    
    // Extract dynamic token from Authorization header or Cookies
    const cleanToken = getSessionToken(req);

    // Obtain the real authenticated user from Supabase Auth dynamically
    let user: any = (req as any).user || null;
    if (supabase) {
      try {
        if (!user && cleanToken && cleanToken !== AUTH_TOKEN) {
          const { data: authData, error: authError } = await supabase.auth.getUser(cleanToken);
          if (authData?.user && !authError) {
            user = authData.user;
          }
        }
        
        // Strict parameterless fallback
        if (!user) {
          const { data: authData, error: authError } = await supabase.auth.getUser();
          if (authData?.user && !authError) {
            user = authData.user;
          }
        }
      } catch (err) {
        console.warn("[CUST_POST] Failed to get user from Supabase Auth:", err);
      }
    }

    // Abort immediately with 401 if we do NOT have a valid active user session
    if (!user || !user.id) {
      return res.status(401).json({ 
        error: "No hay sesión activa",
        details: "Debes iniciar sesión con un usuario válido para guardar clientes." 
      });
    }

    // Set dynamic userId exactly to the logged in user
    customerData.userId = user.id;

    // Direct auto-sync of active user in app_users to verify compatibility with foreign key constraint
    if (supabase && user && user.id) {
      try {
        const { data: matchedAppUser } = await supabase
          .from("app_users")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (!matchedAppUser) {
          console.log(`[CUST_POST] Synchronizing new or active user "${user.id}" in app_users table`);
          const userMail = user.email || "";
          const metadataUsername = user.user_metadata?.username || userMail.split("@")[0] || "manager";
          
          const { data: userByUsername } = await supabase
            .from("app_users")
            .select()
            .eq("username", metadataUsername)
            .maybeSingle();

          if (userByUsername) {
            await supabase
              .from("app_users")
              .update({ id: user.id })
              .eq("id", userByUsername.id);
            console.log(`[CUST_POST] Updated app_users ID from ${userByUsername.id} to ${user.id}`);
          } else {
            const defaultRole = user.user_metadata?.role || "manager";
            await supabase
              .from("app_users")
              .insert([{
                id: user.id,
                username: metadataUsername,
                password: "custom_user_123",
                role: defaultRole,
                permissions: ["dashboard", "inventory", "financials", "customers"]
              }]);
            console.log(`[CUST_POST] Created app_users row for ${metadataUsername}`);
          }
        }
      } catch (syncErr: any) {
        console.warn("[CUST_POST] Error in app_users sync:", syncErr.message);
      }
    }

    const { data, error } = await supabase.from("customers").insert([customerData]).select().single();
    
    if (error) {
      console.error("[CUST_POST] Full Error Object:", JSON.stringify(error, null, 2));
      // Helpful error message for foreign key violation
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: "Error de Relación: El ID de usuario no existe en la tabla de destino.",
          details: "La tabla de clientes requiere una Foreign Key válida. Si ya tienes la sesión activa, ejecuta el script SQL sugerido para que la FK apunte directamente a auth.users."
        });
      }
      if (error.code === '22P02') {
         return res.status(400).json({ 
          error: "Error de Formato: El ID de usuario no tiene el formato correcto.",
          details: "Asegúrate de estar usando un usuario real creado en el sistema."
        });
      }
      throw error;
    }
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/customers/:id", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    
    let updateData = req.body;
    
    // Extract dynamic token from Authorization header or Cookies
    const cleanToken = getSessionToken(req);

    // Obtain the real authenticated user from Supabase Auth dynamically
    let user: any = (req as any).user || null;
    if (supabase) {
      try {
        if (!user && cleanToken && cleanToken !== AUTH_TOKEN) {
          const { data: authData, error: authError } = await supabase.auth.getUser(cleanToken);
          if (authData?.user && !authError) {
            user = authData.user;
          }
        }
        
        // Strict parameterless fallback
        if (!user) {
          const { data: authData, error: authError } = await supabase.auth.getUser();
          if (authData?.user && !authError) {
            user = authData.user;
          }
        }
      } catch (err) {
        console.warn("[CUST_PUT] Failed to get user from Supabase Auth:", err);
      }
    }

    // Abort immediately with 401 if we do NOT have a valid active user session
    if (!user || !user.id) {
       return res.status(401).json({ 
        error: "No hay sesión activa",
        details: "Debes iniciar sesión con un usuario válido para modificar clientes." 
      });
    }

    const cleanUpdateData: any = {};
    const allowedCustomerColumns = [
      "nombre",
      "apellido",
      "email",
      "telefono",
      "userId",
      "canal"
    ];
    for (const key of allowedCustomerColumns) {
      if (req.body[key] !== undefined) {
        cleanUpdateData[key] = req.body[key];
      }
    }
    
    // Set dynamic userId exactly to the logged in user
    cleanUpdateData.userId = user.id;

    // Direct auto-sync of active user in app_users to verify compatibility with foreign key constraint
    if (supabase && user && user.id) {
      try {
        const { data: matchedAppUser } = await supabase
          .from("app_users")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (!matchedAppUser) {
          console.log(`[CUST_PUT] Synchronizing new or active user "${user.id}" in app_users table`);
          const userMail = user.email || "";
          const metadataUsername = user.user_metadata?.username || userMail.split("@")[0] || "manager";
          
          const { data: userByUsername } = await supabase
            .from("app_users")
            .select()
            .eq("username", metadataUsername)
            .maybeSingle();

          if (userByUsername) {
            await supabase
              .from("app_users")
              .update({ id: user.id })
              .eq("id", userByUsername.id);
            console.log(`[CUST_PUT] Updated app_users ID from ${userByUsername.id} to ${user.id}`);
          } else {
            const defaultRole = user.user_metadata?.role || "manager";
            await supabase
              .from("app_users")
              .insert([{
                id: user.id,
                username: metadataUsername,
                password: "custom_user_123",
                role: defaultRole,
                permissions: ["dashboard", "inventory", "financials", "customers"]
              }]);
            console.log(`[CUST_PUT] Created app_users row for ${metadataUsername}`);
          }
        }
      } catch (syncErr: any) {
        console.warn("[CUST_PUT] Error in app_users sync:", syncErr.message);
      }
    }

    const { data, error } = await supabase.from("customers").update(cleanUpdateData).eq("id", req.params.id).select().single();
    if (error) {
      console.error("[CUST_PUT] Full Error Object:", JSON.stringify(error, null, 2));
      if (error.code === '23503') {
        throw new Error("Error de Relación: El usuario asignado no existe en la base de datos.");
      }
      throw error;
    }
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/customers/:id", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const { error } = await supabase.from("customers").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// Seed API
app.post("/api/admin/seed", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const items = rawProductData.map(item => ({
      sku_barcode: item.sku,
      nombre: item.nombre,
      categoria: item.categoria,
      costo_unitario: item.costo,
      precio_venta: item.precio,
      stock_actual: item.stock,
      stock_minimo: item.min,
      detalles: item.detalle,
      userId: "admin",
      updated_at: new Date()
    }));

    const { error } = await supabase.from("products").upsert(items, { onConflict: 'sku_barcode' });
    if (error) throw error;
    res.json({ message: "Seed successful", count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Production Static Serving - ONLY when not on Vercel (Vercel handles static via rewrites)
if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  try {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api")) return next();
        const indexPath = path.join(distPath, "index.html");
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          next();
        }
      });
    }
  } catch (err) {
    console.error("[SERVER] Error setting up static serving:", err);
  }
}

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[GLOBAL ERROR]:", err);
  // Ensure we always return JSON
  res.status(err.status || 500).json({ 
    error: "Internal Server Error", 
    message: err.message || "An unexpected error occurred",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server on http://0.0.0.0:${PORT}`));
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
