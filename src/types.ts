export interface Product {
  id: string;
  sku_barcode: string;
  nombre: string;
  categoria: "Maquillaje" | "Skincare" | "Perfumería" | string;
  costo_unitario: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  detalles?: string;
  userId: string;
  created_at: any;
}

export interface Sale {
  id: string;
  canal_venta: "Local" | "MercadoLibre" | "Web";
  product_id?: string;
  ingreso_bruto: number;
  comision_plataforma: number;
  costo_envio: number;
  ingreso_neto: number;
  descuento: number;
  cliente_nombre?: string;
  cliente_apellido?: string;
  pagado: boolean;
  estado_arca: "Pendiente" | "Facturado" | "Error";
  cae_arca?: string;
  userId: string;
  fecha_venta: any;
  moneda?: "ARS" | "USD";
  detalles_venta?: string;
  pago_parcial?: number;
  estado_entrega?: "Pendiente" | "Entregado";
}

export interface Movement {
  id: string;
  tipo_movimiento: "Ingreso" | "Egreso";
  categoria: "Venta" | "Varios" | "Fijo" | "Ajuste" | "Préstamo";
  monto: number;
  moneda: "ARS" | "USD";
  descripcion: string;
  fecha: any;
  sale_id?: string;
  userId: string;
}

export interface Expense {
  id: string;
  descripcion: string;
  monto: number;
  tipo: "Fijo" | "Variable";
  userId: string;
  fecha_gasto: string;
  moneda?: "ARS" | "USD";
}

export interface AppUser {
  id: string;
  username: string;
  password?: string;
  role: "admin" | "user";
  permissions: string[];
  created_at?: string;
}

export interface BusinessStats {
  totalRevenue: number;
  realProfit: number;
  stockAlerts: number;
  arcaPending: number;
  salesCount: number;
  unpaidTotal: number;
}
