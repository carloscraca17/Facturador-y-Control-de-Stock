import express from "express";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { rawProductData } from "./products_data";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Initialize Supabase Client with strict validation
const getSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  console.log(`[BACKEND] Supabase Check: URL_Present=${!!url} (${url?.length || 0} chars), KEY_Present=${!!key} (${key?.length || 0} chars)`);

  if (!url || !key) {
    console.error("ERROR REAL EN VERCEL: Faltan las variables de entorno de Supabase. URL o KEY están indefinidas en process.env.");
    return null;
  }
  
  try {
    const normalizedUrl = url.trim()
      .replace(/\/$/, "")
      .replace(/\/rest\/v1$/, "");
      
    return createClient(normalizedUrl, key);
  } catch (err: any) {
    console.error("ERROR REAL EN VERCEL (Initialization):", err);
    return null;
  }
};

const supabase = getSupabaseClient();

if (!supabase) {
  const errorMsg = "Faltan las variables de entorno de Supabase en este entorno (SUPABASE_URL o KEY).";
  console.error("ERROR REAL EN VERCEL:", errorMsg);
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
    console.warn(`[AUTH] Unauthorized access attempt. Received: "${token}", Expected: "${AUTH_TOKEN}"`);
    res.status(401).json({ error: "Unauthorized" });
  }
};

// Supabase Guard Middleware
const guard = (req: any, res: any, next: any) => {
  if (!supabase) {
    console.error("ERROR REAL EN VERCEL: Database client not available for route:", req.path);
    return res.status(503).json({ 
      error: "Base de datos no conectada", 
      details: "No se pudieron cargar las variables de entorno de Supabase en el servidor (SUPABASE_URL o KEY faltantes)." 
    });
  }
  next();
};

// Global Guard for all /api routes EXCEPT /api/health (which handles its own missing config message)
app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.path === "/admin/seed") return next();
  guard(req, res, next);
});

// Health check
app.get("/api/health", async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ status: "config_missing", message: "Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." });
    }

    const { data: products, error: prodErr } = await supabase.from("products").select("id").limit(1);
    const { data: sales, error: saleErr } = await supabase.from("sales").select("id").limit(1);
    const { data: expenses, error: expErr } = await supabase.from("expenses").select("id").limit(1);
    const { data: movements, error: movErr } = await supabase.from("movements").select("id").limit(1);
    const { data: users, error: userErr } = await supabase.from("app_users").select("id").limit(1);

    if (prodErr || saleErr || expErr || movErr || userErr) {
      return res.json({ 
        status: "table_error", 
        details: { 
          products: prodErr?.message || "OK", 
          sales: saleErr?.message || "OK", 
          expenses: expErr?.message || "OK",
          movements: movErr?.message || "OK",
          app_users: userErr?.message || "OK"
        },
        message: "Tables might be missing. Please run the updated SQL in supabase_schema.sql in your Supabase SQL Editor."
      });
    }

    res.json({ 
      status: "ok", 
      supabase: "connected", 
      empty: products.length === 0 && sales.length === 0 && expenses.length === 0 && movements.length === 0,
      time: new Date().toISOString() 
    });
  } catch (err: any) {
    console.error("ERROR REAL EN VERCEL (Health Check):", err);
    res.json({ status: "error", supabase: err.message, time: new Date().toISOString() });
  }
});

// Login API
app.post("/api/login", guard, async (req, res) => {
  const { username, password } = req.body;
  
  try {
    if (!supabase) throw new Error("Database not connected");

    // Primero, verificamos contra la tabla de Supabase si existe
    const { data: user } = await supabase
      .from("app_users")
      .select("*")
      .eq("username", username)
      .eq("password", password)
      .maybeSingle();

    if (user) {
      return res.json({ 
        token: AUTH_TOKEN, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role,
          permissions: user.permissions 
        } 
      });
    }

    // Fallback para admin inicial si la tabla está vacía o hay error de conexión
    if (username === "admin" && password === "admin123") {
      res.json({ 
        token: AUTH_TOKEN,
        user: { 
          id: "admin", 
          username: "admin", 
          role: "admin",
          permissions: ["dashboard", "inventory", "financials", "access"]
        } 
      });
    } else {
      res.status(401).json({ error: "Credenciales inválidas" });
    }
  } catch (err) {
    // Si falla Supabase, permitimos admin fallback
    if (username === "admin" && password === "admin123") {
      res.json({ 
        token: AUTH_TOKEN,
        user: { 
          id: "admin", 
          username: "admin", 
          role: "admin",
          permissions: ["dashboard", "inventory", "financials", "access"]
        } 
      });
    } else {
      res.status(500).json({ error: "Error de servidor al iniciar sesión" });
    }
  }
});

// Users Management API
app.get("/api/users", authenticate, guard, async (req, res) => {
  try {
    const { data, error } = await supabase!
      .from("app_users")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
       console.error("[USERS] Supabase Error:", error);
       return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    }
    res.json(data);
  } catch (error: any) {
    console.error("[USERS] Catch Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users", authenticate, guard, async (req, res) => {
  try {
    const body = req.body;
    const { data, error } = await supabase!
      .from("app_users")
      .insert([body])
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/users/:id", authenticate, guard, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const { data, error } = await supabase!
      .from("app_users")
      .update(body)
      .eq("id", id)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/users/:id", authenticate, guard, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase!
      .from("app_users")
      .delete()
      .eq("id", id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Products API
app.get("/api/products", authenticate, guard, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase!
      .from("products")
      .select("*", { count: "exact" })
      .order("nombre", { ascending: true })
      .range(from, to);
    
    if (error) {
      console.error("Supabase GET Products Error Details:", JSON.stringify(error, null, 2));
      return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    }
    res.json({ data, total: count });
  } catch (error: any) {
    console.error("ERROR REAL EN VERCEL (GET Products):", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/products", authenticate, async (req, res) => {
  try {
    const rawProduct = req.body;
    console.log("[INVENTORY] Saving new product. Raw body keys:", Object.keys(rawProduct));
    
    // Pick only valid fields to avoid errors with unexpected fields
    const product = {
      nombre: rawProduct.nombre,
      sku_barcode: rawProduct.sku_barcode,
      categoria: rawProduct.categoria,
      costo_unitario: Number(rawProduct.costo_unitario) || 0,
      precio_venta: Number(rawProduct.precio_venta) || 0,
      stock_actual: Number(rawProduct.stock_actual) || 0,
      stock_minimo: Number(rawProduct.stock_minimo) || 0,
      detalles: rawProduct.detalles,
      "userId": rawProduct.userId || "admin",
      created_at: new Date(),
      updated_at: new Date()
    };

    const { data, error } = await supabase
      .from("products")
      .upsert([product], { onConflict: 'sku_barcode' })
      .select()
      .single();

    if (error) {
      console.error("POST Products Supabase Error:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      throw error;
    }
    res.json(data);
  } catch (error: any) {
    console.error("POST Products Catch Error:", {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details
    });
    let message = error.message;
    if (error.code === '23505') {
      message = `El código SKU "${req.body.sku_barcode}" ya existe.`;
    }
    res.status(500).json({ 
      error: message || "Unknown error", 
      details: error.details || error.message || error,
      code: error.code
    });
  }
});

app.put("/api/products/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const rawProduct = req.body;
    
    // Pick valid fields for update
    const product: any = {
      nombre: rawProduct.nombre,
      sku_barcode: rawProduct.sku_barcode,
      categoria: rawProduct.categoria,
      costo_unitario: Number(rawProduct.costo_unitario),
      precio_venta: Number(rawProduct.precio_venta),
      stock_actual: Number(rawProduct.stock_actual),
      stock_minimo: Number(rawProduct.stock_minimo),
      detalles: rawProduct.detalles,
      updated_at: new Date()
    };

    const { error } = await supabase
      .from("products")
      .update(product)
      .eq("id", id);

    if (error) {
      console.error("PUT Products Supabase Error:", {
        message: error.message,
        details: error.details,
        code: error.code
      });
      throw error;
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("PUT Products Catch Error:", {
      message: error.message,
      code: error.code
    });
    res.status(500).json({ error: error.message, code: error.code });
  }
});

app.delete("/api/products/:id", authenticate, async (req, res) => {
  try {
    const id = String(req.params.id).trim();
    console.log(`[PRODUCTS] Attemping DELETE for ID: ${id}`);
    const { data, error } = await supabase
      .from("products")
      .delete()
      .eq("id", id)
      .select();

    if (error) {
      console.error(`[PRODUCTS] Delete error for ID ${id}:`, error);
      throw error;
    }
    if (!data || data.length === 0) {
      console.warn(`[PRODUCTS] ID ${id} not found for deletion`);
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    console.log(`[PRODUCTS] Successfully deleted ID: ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sales API
app.get("/api/sales", authenticate, guard, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase!
      .from("sales")
      .select("*", { count: "exact" })
      .order("fecha_venta", { ascending: false })
      .range(from, to);

    if (error) {
       console.error("ERROR REAL EN VERCEL (GET Sales):", error);
       throw error;
    }
    res.json({ data, total: count });
  } catch (error: any) {
    console.error("ERROR REAL EN VERCEL (Catch Sales):", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sales", authenticate, async (req, res) => {
  try {
    const sale = req.body;
    
    // Ensure numeric types are valid numbers
    const cleanSale = {
      ...sale,
      ingreso_bruto: Number(sale.ingreso_bruto) || 0,
      ingreso_neto: Number(sale.ingreso_neto) || 0,
      descuento: Number(sale.descuento) || 0,
      pago_parcial: Number(sale.pago_parcial) || 0,
      estado_entrega: sale.estado_entrega || "Pendiente",
      fecha_venta: new Date()
    };
    
    // 1. Discover existing columns in the table to avoid insertion errors
    const { data: firstSale } = await supabase.from("sales").select("*").limit(1).maybeSingle();
    const existingColumns = firstSale ? Object.keys(firstSale) : ["canal_venta", "ingreso_bruto", "cliente_nombre", "pagado", "product_id", "fecha_venta"];

    const safeSale: any = {};
    Object.keys(cleanSale).forEach(key => {
      if (existingColumns.includes(key)) {
        safeSale[key] = (cleanSale as any)[key];
      }
    });

    // 2. Insert the sale
    const insertResult = await supabase
      .from("sales")
      .insert([safeSale])
      .select()
      .maybeSingle();

    if (insertResult.error) {
       console.error("[SALES] Insertion failed:", insertResult.error);
       return res.status(500).json({ 
         error: "Error insertando venta", 
         details: insertResult.error.message 
       });
    }
    
    const newSale = insertResult.data;
    if (!newSale) {
        console.error("[SALES] Insertion succeeded but no data returned.");
        return res.status(500).json({ error: "La base de datos no devolvió la venta creada." });
    }

    // 2. If sale creation was successful and has a product_id, decrement stock
    if (newSale.product_id) {
      try {
        const { data: product, error: fetchErr } = await supabase
          .from("products")
          .select("stock_actual")
          .eq("id", newSale.product_id)
          .single();

        if (!fetchErr && product) {
          const newStock = Math.max(0, Number(product.stock_actual) - 1);
          await supabase
            .from("products")
            .update({ stock_actual: newStock })
            .eq("id", newSale.product_id);
          console.log(`[SALES] Stock adjusted for product ${newSale.product_id}: ${product.stock_actual} -> ${newStock}`);
        }
      } catch (stockErr) {
        console.error("Error adjusting stock:", stockErr);
      }
    }

    // 3. If sale has payment, create a financial movement
    const paymentAmount = Number(newSale.pago_parcial) || (newSale.pagado ? Number(newSale.ingreso_bruto) : 0);
    if (paymentAmount > 0) {
      try {
        console.log(`[SALES] New sale ${newSale.id} has payment of ${paymentAmount}. Creating movement.`);
        const movementPayload = {
          tipo_movimiento: "Ingreso",
          categoria: "Venta",
          monto: paymentAmount,
          moneda: newSale.moneda || "ARS",
          descripcion: `Venta: #${newSale.id.slice(-4).toUpperCase()}${newSale.cliente_nombre ? ' - ' + newSale.cliente_nombre : ''}`,
          sale_id: newSale.id,
          userId: newSale.userId || "admin",
          fecha: new Date()
        };

        const { error: movErr } = await supabase.from("movements").insert([movementPayload]);
        
        if (movErr) {
            console.warn("[SALES] Error creating movement, retrying without sale_id:", movErr.message);
            // Fallback for old movements table without sale_id
            const safeMov = { ...movementPayload };
            delete (safeMov as any).sale_id;
            await supabase.from("movements").insert([safeMov]);
        }
      } catch (movErr) {
        console.error("Error creating movement for new sale:", movErr);
      }
    }

    res.json(newSale);
  } catch (error: any) {
    console.error("[SALES] Uncaught error in POST /api/sales:", {
        message: error.message,
        stack: error.stack,
        details: error.details || error.toString()
    });
    res.status(500).json({ 
      error: error.message || "Error interno al procesar la venta.",
      details: error.details || error.toString()
    });
  }
});

app.put("/api/sales/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    // 1. Get current sale state and discover available columns
    const { data: currentSale, error: fetchErr } = await supabase
      .from("sales")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr) {
       console.error(`[SALES] Fetch error for sale ${id}:`, fetchErr.message);
       throw fetchErr;
    }

    // 2. Prepare update payload
    const saleUpdate: any = {
      canal_venta: body.canal_venta,
      ingreso_bruto: body.ingreso_bruto !== undefined ? Number(body.ingreso_bruto) : undefined,
      ingreso_neto: body.ingreso_neto !== undefined ? Number(body.ingreso_neto) : undefined,
      descuento: body.descuento !== undefined ? Number(body.descuento) : undefined,
      cliente_nombre: body.cliente_nombre,
      cliente_apellido: body.cliente_apellido,
      pagado: body.pagado !== undefined ? !!body.pagado : undefined,
      estado_arca: body.estado_arca,
      detalles_venta: body.detalles_venta,
      pago_parcial: body.pago_parcial !== undefined ? Number(body.pago_parcial) : undefined,
      estado_entrega: body.estado_entrega,
      moneda: body.moneda,
      userId: body.userId
    };

    // Remove undefined values to avoid overwriting with null/undefined if not provided
    Object.keys(saleUpdate).forEach(key => saleUpdate[key] === undefined && delete saleUpdate[key]);

    // 3. Try to update everything first
    let { data: updatedSale, error: updateErr } = await supabase
      .from("sales")
      .update(saleUpdate)
      .eq("id", id)
      .select()
      .maybeSingle();

    // 4. If it fails with "undefined column", retry with only columns that exist in currentSale
    if (updateErr && (updateErr.code === '42703' || updateErr.message.includes("column"))) {
      const discoveredColumns = Object.keys(currentSale);
      const safeUpdate: any = {};
      const ignoredFields: string[] = [];
      
      Object.keys(saleUpdate).forEach(key => {
        if (discoveredColumns.includes(key)) {
          safeUpdate[key] = saleUpdate[key];
        } else {
          ignoredFields.push(key);
        }
      });

      console.warn(`[SALES] Missing columns in Supabase: [${ignoredFields.join(", ")}]. Retrying update with safe columns for ${id}`);

      const retryResult = await supabase
        .from("sales")
        .update(safeUpdate)
        .eq("id", id)
        .select()
        .maybeSingle();
      
      updatedSale = retryResult.data;
      updateErr = retryResult.error;
    }

    if (updateErr) {
      console.error(`[SALES] Update failed for sale ${id}:`, JSON.stringify(updateErr, null, 2));
      return res.status(500).json({ 
         error: "Error actualizando venta", 
         details: updateErr.message,
         code: updateErr.code
       });
    }

    if (!updatedSale) {
       // If maybeSingle returned null, it means the record might have been deleted or RLS blocked it
       return res.status(404).json({ error: "Venta no encontrada." });
    }

    // 3. Sync financial movement with pago_parcial
    const currentPP = Number(currentSale.pago_parcial) || 0;
    const updatedPP = Number(updatedSale.pago_parcial) || 0;
    const wasPaid = !!currentSale.pagado;
    const isPaid = !!updatedSale.pagado;
    const targetAmount = isPaid ? Number(updatedSale.ingreso_bruto) : updatedPP;

    if (currentPP !== updatedPP || wasPaid !== isPaid) {
      const { data: existingMov } = await supabase.from("movements").select("id").eq("sale_id", id).maybeSingle();
      
      if (targetAmount > 0) {
        if (existingMov) {
          await supabase.from("movements").update({ 
            monto: targetAmount,
            descripcion: `Venta: #${updatedSale.id.slice(-4).toUpperCase()}${updatedSale.cliente_nombre ? ' - ' + updatedSale.cliente_nombre : ''}`
          }).eq("id", existingMov.id);
        } else {
          await supabase.from("movements").insert([{
            tipo_movimiento: "Ingreso",
            categoria: "Venta",
            monto: targetAmount,
            moneda: updatedSale.moneda || "ARS",
            descripcion: `Venta: #${updatedSale.id.slice(-4).toUpperCase()}${updatedSale.cliente_nombre ? ' - ' + updatedSale.cliente_nombre : ''}`,
            sale_id: updatedSale.id,
            userId: updatedSale.userId || "admin",
            fecha: new Date()
          }]);
        }
      } else if (existingMov) {
        await supabase.from("movements").delete().eq("id", existingMov.id);
      }
    }

    res.json(updatedSale);
  } catch (error: any) {
    console.error(`[SALES] Uncaught error in PUT /api/sales/${req.params.id}:`, {
      message: error.message,
      stack: error.stack,
      details: error.details || error.toString()
    });
    res.status(500).json({ 
      error: error.message || "Error interno al actualizar la venta.",
      details: error.details || error.toString()
    });
  }
});

app.delete("/api/sales/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[SALES] Attemping DELETE for ID: ${id}`);
    
    // 1. Fetch the sale first to know which product to restore
    const { data: sale, error: fetchErr } = await supabase
      .from("sales")
      .select("product_id")
      .eq("id", id)
      .single();

    if (fetchErr) {
      console.error(`[SALES] Error fetching sale before deletion:`, fetchErr);
      // If sale not found, we can't restore stock, but maybe it doesn't exist anyway
    }

    // 2. Delete the sale
    const { data: deletedSale, error: deleteErr } = await supabase
      .from("sales")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (deleteErr) {
      console.error(`[SALES] Delete error for ID ${id}:`, deleteErr);
      throw deleteErr;
    }

    // 3. Increment stock if sale was successfully deleted and had a product_id
    if (deletedSale && deletedSale.product_id) {
      try {
        const { data: product, error: prodFetchErr } = await supabase
          .from("products")
          .select("stock_actual")
          .eq("id", deletedSale.product_id)
          .single();

        if (!prodFetchErr && product) {
          await supabase
            .from("products")
            .update({ stock_actual: product.stock_actual + 1 })
            .eq("id", deletedSale.product_id);
          console.log(`[SALES] Stock restored for product ${deletedSale.product_id}: ${product.stock_actual} -> ${product.stock_actual + 1}`);
        }
      } catch (stockErr) {
        console.error("Error restoring stock after sale deletion:", stockErr);
      }
    }

    // 4. Remove associated financial movement if it exists
    try {
      const { error: movDelErr } = await supabase
        .from("movements")
        .delete()
        .eq("sale_id", id);
      if (movDelErr) console.error(`[SALES] Error deleting movement for sale ${id}:`, movDelErr);
    } catch (movErr) {
      console.error(`[SALES] Movement deletion catch error:`, movErr);
    }

    console.log(`[SALES] Successfully deleted sales ID: ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Expenses API
app.get("/api/expenses", authenticate, guard, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("fecha_gasto", { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/expenses", authenticate, async (req, res) => {
  try {
    const expense = req.body;
    const { data, error } = await supabase
      .from("expenses")
      .insert([{ ...expense, fecha_gasto: expense.fecha_gasto || new Date() }])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/expenses/:id", authenticate, async (req, res) => {
  try {
    const id = String(req.params.id).trim();
    console.log(`[EXPENSES] Attemping DELETE for ID: ${id}`);
    const { data, error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", id)
      .select();

    if (error) {
      console.error(`[EXPENSES] Delete error for ID ${id}:`, error);
      throw error;
    }
    if (!data || data.length === 0) {
      console.warn(`[EXPENSES] ID ${id} not found for deletion`);
      return res.status(404).json({ error: "Gasto no encontrado" });
    }
    console.log(`[EXPENSES] Successfully deleted ID: ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk Delete API
app.post("/api/bulk-delete/:table", authenticate, guard, async (req, res) => {
  try {
    const { table } = req.params;
    const { ids } = req.body;
    
    const allowedTables = ["products", "movements", "expenses", "sales"];
    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: "Tabla no permitida" });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Se requiere un array de IDs" });
    }

    console.log(`[BULK DELETE] Table: ${table}, Count: ${ids.length}`, ids);
    
    const { data, error } = await supabase
      .from(table)
      .delete()
      .in("id", ids)
      .select();

    if (error) {
      console.error(`[BULK DELETE] Supabase error in table ${table}:`, error);
      throw error;
    }

    // Restore stock if deleting sales
    if (table === "sales" && data && data.length > 0) {
      for (const sale of data) {
        // Restore stock and delete movements if deleting sales
        if (sale.product_id) {
          try {
            const { data: product, error: prodFetchErr } = await supabase
              .from("products")
              .select("stock_actual")
              .eq("id", sale.product_id)
              .single();

            if (!prodFetchErr && product) {
              await supabase
                .from("products")
                .update({ stock_actual: product.stock_actual + 1 })
                .eq("id", sale.product_id);
              console.log(`[BULK DELETE] Stock restored for product ${sale.product_id}`);
            }
          } catch (stockErr) {
            console.error("Error restoring stock in bulk delete:", stockErr);
          }
        }
        
        // Always try to delete associated movement
        try {
          await supabase.from("movements").delete().eq("sale_id", sale.id);
        } catch (movErr) {
          console.error(`[BULK DELETE] Error deleting movement for sale ${sale.id}:`, movErr);
        }
      }
    }
    
    if (!data || data.length === 0) {
      console.warn(`[BULK DELETE] No records were deleted from ${table}. IDs check:`, ids);
    }
    
    console.log(`[BULK DELETE] Successfully deleted ${data?.length || 0} records from ${table}`);
    res.json({ success: true, count: data?.length || 0 });
  } catch (error: any) {
    console.error(`[BULK DELETE] Fatal error:`, error);
    res.status(500).json({ error: error.message, details: error });
  }
});

// Stats API
app.get("/api/stats", authenticate, guard, async (req, res) => {
  try {
    // Optimization: fetch only necessary columns for stats calculation
    const [salesRes, productsRes] = await Promise.all([
      supabase!.from("sales").select("ingreso_bruto, ingreso_neto, pagado, pago_parcial, estado_arca"),
      supabase!.from("products").select("stock_actual, stock_minimo")
    ]);

    const sales = salesRes.data || [];
    const products = productsRes.data || [];

    const totalRevenue = sales.reduce((acc, s) => acc + (Number(s.ingreso_bruto) || 0), 0);
    const totalNet = sales.reduce((acc, s) => acc + (Number(s.ingreso_neto) || 0), 0);
    
    // For profit, we really need cost. Let's estimate it if critical or fetch expenses.
    // If we want real profit including expenses:
    const { data: expenses } = await supabase!.from("expenses").select("monto");
    const totalExpenses = (expenses || []).reduce((acc, e) => acc + (Number(e.monto) || 0), 0);

    const unpaidTotal = sales.reduce((acc, s) => {
      if (s.pagado) return acc;
      return acc + (Math.max(0, (Number(s.ingreso_bruto) || 0) - (Number(s.pago_parcial) || 0)));
    }, 0);

    res.json({
      totalRevenue,
      realProfit: totalNet - totalExpenses,
      stockAlerts: products.filter(p => p.stock_actual <= p.stock_minimo).length,
      arcaPending: sales.filter(s => s.estado_arca === "Pendiente").length,
      salesCount: sales.length,
      unpaidTotal
    });
  } catch (err: any) {
    console.error("[STATS] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Final error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[GLOBAL ERROR]:", err);
  res.status(500).json({ 
    error: "Internal Server Error", 
    message: err.message || "Uncaught exception",
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Movements API
app.get("/api/movements", authenticate, guard, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("movements")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(300);

    if (error) {
       console.error("ERROR REAL EN VERCEL (GET Movements):", error);
       throw error;
    }
    res.json(data);
  } catch (error: any) {
    console.error("ERROR REAL EN VERCEL (Catch Movements):", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/movements", authenticate, async (req, res) => {
  try {
    const movement = req.body;
    const { data, error } = await supabase
      .from("movements")
      .insert([{ ...movement, created_at: new Date() }])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/movements/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const movement = req.body;
    const { error } = await supabase
      .from("movements")
      .update({ ...movement })
      .eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/movements/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const cleanId = String(id).trim();
    console.log(`[MOVEMENTS] Attempting DELETE for ID: "${cleanId}"`);
    
    const { data, error } = await supabase
      .from("movements")
      .delete()
      .eq("id", cleanId)
      .select();

    if (error) {
      console.error(`[MOVEMENTS] Supabase delete error for ID ${cleanId}:`, error);
      return res.status(500).json({ error: error.message });
    }
    
    if (!data || data.length === 0) {
      console.warn(`[MOVEMENTS] ID ${cleanId} not found or RLS blocked delete`);
      return res.status(404).json({ error: "Movimiento no encontrado" });
    }

    console.log(`[MOVEMENTS] Successfully deleted ID: ${cleanId}`);
    res.json({ success: true, count: data.length });
  } catch (error: any) {
    console.error(`[MOVEMENTS] Fatal server error during delete:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Seed API
app.post("/api/admin/seed", guard, async (req, res) => {
    try {
      if (!supabase) throw new Error("Base de datos no configurada");
      // 1. Seed Products (con upsert para evitar errores de duplicados)
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

      // Usamos onConflict para que si el sku_barcode ya existe, lo actualice
      const { data: prods, error: prodErr } = await supabase!
        .from("products")
        .upsert(items, { onConflict: 'sku_barcode' })
        .select();

      if (prodErr) throw prodErr;

      // 2. Seed a dummy sale (opcional)
      if (prods && prods.length > 0) {
        const sampleProd = prods[0];
        const { error: saleErr } = await supabase.from("sales").insert([{
          canal_venta: "Local",
          product_id: sampleProd.id,
          ingreso_bruto: sampleProd.precio_venta,
          ingreso_neto: sampleProd.precio_venta - sampleProd.costo_unitario,
          estado_arca: "Facturado",
          userId: "admin",
          fecha_venta: new Date()
        }]);
        if (saleErr && saleErr.code !== '23505') console.error("Sale seed error:", saleErr);
      }

      // 3. Seed a dummy expense
      const { error: expErr } = await supabase.from("expenses").insert([{
        descripcion: "Insumos Iniciales",
        monto: 25000,
        tipo: "Variable",
        userId: "admin",
        fecha_gasto: new Date()
      }]);
      if (expErr && expErr.code !== '23505') console.error("Expense seed error:", expErr);
      
      res.json({ message: "Seed successful", count: items.length });
    } catch (err: any) {
      console.error("Seed Error:", err);
      res.status(500).json({ error: err.message, details: err });
    }
});

async function startServer() {
  const appServer = app;
  
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    appServer.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    appServer.use(express.static(distPath));
    appServer.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  appServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// Start server only if not being imported as a module (e.g. by Vercel)
if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  startServer();
}

export default app;
