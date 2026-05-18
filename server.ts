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
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization;
  if (token === AUTH_TOKEN) {
    next();
  } else {
    console.warn(`[AUTH] Unauthorized access attempt. Received: "${token}"`);
    res.status(401).json({ error: "Unauthorized" });
  }
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

    const [prod, sale, exp, mov, user] = await Promise.all([
      supabase.from("products").select("id").limit(1),
      supabase.from("sales").select("id").limit(1),
      supabase.from("expenses").select("id").limit(1),
      supabase.from("movements").select("id").limit(1),
      supabase.from("app_users").select("id").limit(1)
    ]);

    if (prod.error || sale.error || exp.error || mov.error || user.error) {
      return res.json({ 
        status: "table_error", 
        details: { 
          products: prod.error?.message || "OK", 
          sales: sale.error?.message || "OK", 
          expenses: exp.error?.message || "OK",
          movements: mov.error?.message || "OK",
          app_users: user.error?.message || "OK"
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

    if (user) {
      return res.json({ 
        token: AUTH_TOKEN, 
        user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions } 
      });
    }

    // Fallback for admin initial
    if (username === "admin" && password === "admin123") {
      res.json({ 
        token: AUTH_TOKEN,
        user: { id: "admin", username: "admin", role: "admin", permissions: ["dashboard", "inventory", "financials", "access"] } 
      });
    } else {
      res.status(401).json({ error: "Credenciales inválidas" });
    }
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

    const sale = {
      ...s,
      ingreso_bruto: bruto,
      ingreso_neto: (bruto - desc) - productCost,
      descuento: desc,
      pago_parcial: Number(s.pago_parcial) || 0,
      fecha_venta: s.fecha_venta || new Date()
    };

    const { data, error } = await supabase.from("sales").insert([sale]).select().single();
    if (error) throw error;

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
        fecha: new Date()
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

    const bruto = Number(s.ingreso_bruto) !== undefined ? Number(s.ingreso_bruto) : oldSale.ingreso_bruto;
    const desc = Number(s.descuento) !== undefined ? Number(s.descuento) : oldSale.descuento;

    const updateData = {
      ...s,
      ingreso_bruto: bruto,
      ingreso_neto: (bruto - desc) - productCost,
      descuento: desc,
      pago_parcial: Number(s.pago_parcial) !== undefined ? Number(s.pago_parcial) : oldSale.pago_parcial,
    };

    // 2. Perform the update
    const { data: updatedSale, error: updateError } = await supabase
      .from("sales")
      .update(updateData)
      .eq("id", req.params.id)
      .select()
      .single();

    if (updateError) throw updateError;

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
        fecha: new Date()
      }]);
      if (syncError) console.error("[MOVE_SYNC] Error:", syncError);
    }

    res.json(updatedSale);
  } catch (error: any) {
    console.error("[SALES] PUT Error:", error);
    res.status(500).json({ error: error.message });
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
    const { data, error } = await supabase.from("expenses").insert([req.body]).select().single();
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stats API
app.get("/api/stats", authenticate, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "DB not available" });
    const [salesRes, productsRes, expensesRes, movementsRes] = await Promise.all([
      supabase.from("sales").select("ingreso_bruto, ingreso_neto, pagado, pago_parcial, estado_arca, canal_venta"),
      supabase.from("products").select("stock_actual, stock_minimo"),
      supabase.from("expenses").select("monto"),
      supabase.from("movements").select("monto, tipo_movimiento, categoria, moneda")
    ]);

    const sales = salesRes.data || [];
    const products = productsRes.data || [];
    const expenses = expensesRes.data || [];
    const movements = movementsRes.data || [];

    // Revenue should be based on movements of category "Venta" for ARS (main currency)
    const totalRevenue = movements
      .filter(m => m.categoria === "Venta" && m.moneda === "ARS")
      .reduce((acc, m) => m.tipo_movimiento === "Ingreso" ? acc + (Number(m.monto) || 0) : acc - (Number(m.monto) || 0), 0);
    
    const totalGrossSales = sales.reduce((acc, s) => acc + (Number(s.ingreso_bruto) || 0), 0);
    
    const salesByChannel = {
      Local: sales.filter(s => s.canal_venta === "Local").reduce((acc, s) => acc + (Number(s.ingreso_bruto) || 0), 0),
      Web: sales.filter(s => s.canal_venta === "Web").reduce((acc, s) => acc + (Number(s.ingreso_bruto) || 0), 0),
      MercadoLibre: sales.filter(s => s.canal_venta === "MercadoLibre").reduce((acc, s) => acc + (Number(s.ingreso_bruto) || 0), 0)
    };
    
    const totalExpenses = movements
      .filter(m => m.tipo_movimiento === "Egreso" && m.moneda === "ARS")
      .reduce((acc, m) => acc + (Number(m.monto) || 0), 0);
    
    const totalIncome = movements
      .filter(m => m.tipo_movimiento === "Ingreso" && m.moneda === "ARS")
      .reduce((acc, m) => acc + (Number(m.monto) || 0), 0);

    const realProfit = sales.reduce((acc, s) => acc + (Number(s.ingreso_neto) || 0), 0);

    const unpaidTotal = sales.reduce((acc, s) => s.pagado ? acc : acc + (Math.max(0, (Number(s.ingreso_bruto) || 0) - (Number(s.pago_parcial) || 0))), 0);

    const totalCollected = totalRevenue;

    res.json({
      totalRevenue,
      totalGrossSales,
      totalCollected,
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
    const { data, error } = await supabase.from("movements").select("*").order("fecha", { ascending: false }).limit(300);
    if (error) throw error;
    res.json(data || []);
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
