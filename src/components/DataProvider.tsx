import React, { createContext, useContext, useEffect, useState } from "react";
import { Product, Sale, Expense, BusinessStats, Movement, AppUser, Customer } from "../types";

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
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  stats: BusinessStats;
  token: string | null;
  connectionError: string | null;
  refreshData: () => Promise<void>;
  fetchProducts: (page?: number, limit?: number, search?: string) => Promise<void>;
  fetchSales: (page?: number, limit?: number) => Promise<void>;
  productsTotal: number;
  salesTotal: number;
  login: (token: string, user: AppUser) => void;
  logout: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
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
    totalGrossSales: 0,
    totalCollected: 0,
    monthlyGrossSales: 0,
    realProfit: 0,
    stockAlerts: 0,
    arcaPending: 0,
    salesCount: 0,
    unpaidTotal: 0,
    salesByChannel: {
      Local: 0,
      Web: 0,
      MercadoLibre: 0
    }
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

  const fetchProducts = async (page = 1, limit = 5000, search = "") => {
    if (!token) return;
    try {
      const url = `/api/products?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
      const res = await fetch(url, { 
        headers: { "Authorization": token } 
      });
      if (res.status === 401 && token !== "glow-manager-session-true") {
        logoutAction();
        return;
      }
      if (res.ok) {
        const result = await res.json();
        setProducts(result.data);
        setProductsTotal(result.total);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  const fetchSales = async (page = 1, limit = 20) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/sales?page=${page}&limit=${limit}`, { 
        headers: { "Authorization": token } 
      });
      if (res.status === 401 && token !== "glow-manager-session-true") {
        logoutAction();
        return;
      }
      if (res.ok) {
        const result = await res.json();
        const formattedSales = result.data.map((s: any) => ({
          ...s,
          ingreso_bruto: Number(s.ingreso_bruto) || 0,
          ingreso_neto: Number(s.ingreso_neto) || 0,
          descuento: Number(s.descuento) || 0,
          pagado: s.pagado ?? false,
          pago_parcial: Number(s.pago_parcial) || 0
        }));
        setSales(formattedSales);
        setSalesTotal(result.total);
      }
    } catch (err) {
      console.error("Error fetching sales:", err);
    }
  };

  const fetchData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const headers = { "Authorization": token };
      const [statsRes, prodsRes, salesRes, expRes, movRes, custRes] = await Promise.all([
        fetch("/api/stats", { headers, signal: controller.signal }),
        fetch("/api/products?page=1&limit=5000", { headers, signal: controller.signal }),
        fetch("/api/sales?page=1&limit=20", { headers, signal: controller.signal }),
        fetch("/api/expenses", { headers, signal: controller.signal }),
        fetch("/api/movements", { headers, signal: controller.signal }),
        fetch("/api/customers", { headers, signal: controller.signal })
      ]);

      clearTimeout(timeoutId);

      if ((statsRes.status === 401 || prodsRes.status === 401 || salesRes.status === 401 || expRes.status === 401 || movRes.status === 401 || custRes.status === 401) && token !== "glow-manager-session-true") {
        logoutAction();
        return;
      }

      setConnectionError(null);

      if (statsRes.ok) setStats(await statsRes.json());
      if (custRes.ok) setCustomers(await custRes.json());

      if (prodsRes.ok) {
        const result = await prodsRes.json();
        setProducts(result.data);
        setProductsTotal(result.total);
      }
      
      if (salesRes.ok) {
        const result = await salesRes.json();
        setSales(result.data.map((s: any) => ({
          ...s,
          ingreso_bruto: Number(s.ingreso_bruto) || 0,
          ingreso_neto: Number(s.ingreso_neto) || 0,
          descuento: Number(s.descuento) || 0,
          pagado: s.pagado ?? false,
          pago_parcial: Number(s.pago_parcial) || 0
        })));
        setSalesTotal(result.total);
      }
      
      if (expRes.ok) setExpenses(await expRes.json());
      if (movRes.ok) setMovements(await movRes.json());

    } catch (err: any) {
      console.error("Error fetching data:", err);
      if (err.name !== "AbortError") {
        setConnectionError(`Error de conexion: ${err.message || JSON.stringify(err)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  return (
    <DataContext.Provider value={{ 
      user: user as any, 
      loading, 
      products, 
      setProducts,
      productsTotal,
      sales, 
      setSales,
      salesTotal,
      expenses, 
      setExpenses,
      movements,
      setMovements,
      customers,
      setCustomers,
      stats,
      token,
      connectionError,
      refreshData: fetchData,
      fetchProducts,
      fetchSales,
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
