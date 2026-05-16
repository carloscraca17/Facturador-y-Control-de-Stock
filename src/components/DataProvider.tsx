import React, { createContext, useContext, useEffect, useState } from "react";
import { Product, Sale, Expense, BusinessStats, Movement, AppUser } from "../types";

interface DataContextType {
  user: AppUser | null;
  loading: boolean;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  sales: Sale[];
  setSales: React.Dispatch<React.SetStateAction<Sale[]>>;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  movements: Movement[];
  setMovements: React.Dispatch<React.SetStateAction<Movement[]>>;
  stats: BusinessStats;
  token: string | null;
  refreshData: () => Promise<void>;
  login: (token: string, user: AppUser) => void;
  logout: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [token, setToken] = useState<string | null>(localStorage.getItem("glow_token"));
  const [user, setUser] = useState<AppUser | null>(() => {
    const saved = localStorage.getItem("glow_user");
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [stats, setStats] = useState<BusinessStats>({
    totalRevenue: 0,
    realProfit: 0,
    stockAlerts: 0,
    arcaPending: 0,
    salesCount: 0,
    unpaidTotal: 0,
  });

  const login = (newToken: string, newUser: AppUser) => {
    localStorage.setItem("glow_token", newToken);
    localStorage.setItem("glow_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logoutAction = () => {
    localStorage.removeItem("glow_token");
    localStorage.removeItem("glow_user");
    setToken(null);
    setUser(null);
  };

  const fetchData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const headers = { "Authorization": token };
      const [prodsRes, salesRes, expRes, movRes] = await Promise.all([
        fetch("/api/products", { headers, signal: controller.signal }),
        fetch("/api/sales", { headers, signal: controller.signal }),
        fetch("/api/expenses", { headers, signal: controller.signal }),
        fetch("/api/movements", { headers, signal: controller.signal })
      ]);

      clearTimeout(timeoutId);

      if (prodsRes.ok) {
        setProducts(await prodsRes.json());
      } else {
        const err = await prodsRes.json();
        console.error("Products error:", err.error);
        if (err.error?.includes("Invalid path")) {
            alert("Error: Las tablas no parecen existir en Supabase. Por favor ejecuta el contenido de 'supabase_schema.sql' en el editor SQL de Supabase.");
        }
      }

      if (salesRes.ok) {
        const rawSales = await salesRes.json();
        setSales(rawSales.map((s: any) => ({
          ...s,
          ingreso_bruto: Number(s.ingreso_bruto) || 0,
          ingreso_neto: Number(s.ingreso_neto) || 0,
          descuento: Number(s.descuento) || 0,
          pagado: s.pagado ?? false,
          pago_parcial: Number(s.pago_parcial) || 0
        })));
      }
      if (expRes.ok) setExpenses(await expRes.json());
      
      if (movRes.ok) {
        setMovements(await movRes.json());
      } else {
        const err = await movRes.json();
        console.error("Movements error:", err);
      }
    } catch (err: any) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  useEffect(() => {
    const totalGross = sales.reduce((acc, s) => acc + (s.ingreso_bruto || 0), 0);
    const totalNet = sales.reduce((acc, s) => acc + (s.ingreso_neto || 0), 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + (e.monto || 0), 0);
    const unpaidTotal = sales.reduce((acc, s) => {
      if (s.pagado) return acc;
      const total = s.ingreso_bruto || 0;
      const paid = s.pago_parcial || 0;
      return acc + (total - paid);
    }, 0);
    
    setStats({
      totalRevenue: totalGross,
      realProfit: totalNet - totalExpenses,
      stockAlerts: products.filter(p => p.stock_actual <= p.stock_minimo).length,
      arcaPending: sales.filter(s => s.estado_arca === "Pendiente").length,
      salesCount: sales.length,
      unpaidTotal,
    });
  }, [sales, products, expenses]);

  return (
    <DataContext.Provider value={{ 
      user: user as any, 
      loading, 
      products, 
      setProducts,
      sales, 
      setSales,
      expenses, 
      setExpenses,
      movements,
      setMovements,
      stats,
      token,
      refreshData: fetchData,
      login,
      logout: logoutAction
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error("useData must be used within a DataProvider");
  return context;
};
