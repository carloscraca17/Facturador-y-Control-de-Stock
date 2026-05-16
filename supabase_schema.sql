-- 1. LIMPIEZA: Eliminamos tablas viejas para evitar conflictos de columnas
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- 2. TABLA DE PRODUCTOS
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sku_barcode TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  costo_unitario NUMERIC NOT NULL DEFAULT 0,
  precio_venta NUMERIC NOT NULL DEFAULT 0,
  stock_actual INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER NOT NULL DEFAULT 0,
  detalles TEXT,
  "userId" TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE VENTAS
CREATE TABLE sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  canal_venta TEXT NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  ingreso_bruto NUMERIC NOT NULL DEFAULT 0,
  comision_plataforma NUMERIC NOT NULL DEFAULT 0,
  costo_envio NUMERIC NOT NULL DEFAULT 0,
  ingreso_neto NUMERIC NOT NULL DEFAULT 0,
  descuento NUMERIC NOT NULL DEFAULT 0,
  cliente_nombre TEXT,
  cliente_apellido TEXT,
  pagado BOOLEAN NOT NULL DEFAULT TRUE,
  estado_arca TEXT NOT NULL DEFAULT 'Pendiente',
  cae_arca TEXT,
  "userId" TEXT DEFAULT 'admin',
  fecha_venta TIMESTAMPTZ DEFAULT NOW(),
  moneda TEXT NOT NULL DEFAULT 'ARS',
  pago_parcial NUMERIC NOT NULL DEFAULT 0,
  detalles_venta TEXT,
  estado_entrega TEXT DEFAULT 'Pendiente'
);

-- 4. TABLA DE GASTOS
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  descripcion TEXT NOT NULL,
  monto NUMERIC NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL,
  "userId" TEXT DEFAULT 'admin',
  fecha_gasto TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  moneda TEXT NOT NULL DEFAULT 'ARS'
);

-- 5. TABLA DE MOVIMIENTOS
CREATE TABLE movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_movimiento TEXT NOT NULL, -- 'Ingreso' o 'Egreso'
  categoria TEXT NOT NULL,      -- 'Venta', 'Varios', 'Fijo'
  monto NUMERIC NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL,         -- 'ARS' o 'USD'
  descripcion TEXT NOT NULL,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  "userId" TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SEGURIDAD
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON movements FOR ALL USING (true) WITH CHECK (true);
