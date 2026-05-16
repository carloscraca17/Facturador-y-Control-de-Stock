import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { TrendingUp, AlertTriangle, FileText, DollarSign, Plus, ShoppingBag, LogOut, Trash2, Edit2, X, Check, Clock } from "lucide-react";
import { useData } from "./DataProvider";
import { Scanner } from "./Scanner";
import { Sale } from "../types";

interface DashboardProps {
  onPageChange: (page: "dashboard" | "inventory") => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onPageChange }) => {
  const { stats, products, sales, logout, refreshData } = useData();
  const [isScanning, setIsScanning] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("fecha_venta");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"all" | "paid" | "unpaid" | "partial">("all");
  const [canalFilter, setCanalFilter] = useState<string>("all");
  const [arcaFilter, setArcaFilter] = useState<string>("all");

  const formatDate = (date: any) => {
    if (!date) return "N/A";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("es-AR", { day: '2-digit', month: '2-digit' });
  };

  const handleDeleteSale = async (id: string) => {
    try {
      const response = await fetch(`/api/sales/${id}`, {
        method: "DELETE",
        headers: { "Authorization": localStorage.getItem("glow_token") || "" }
      });
      if (response.ok) {
        setIsDeletingId(null);
        refreshData();
      }
    } catch (err) {
      console.error("Error deleting sale:", err);
    }
  };

  const handleTogglePaid = async (sale: Sale) => {
    const newPaidState = !sale.pagado;
    const updatePayload = { 
      ...sale, 
      pagado: newPaidState,
      pago_parcial: newPaidState ? sale.ingreso_bruto : 0 // If marked as paid, assume full payment. If unpaid, assume 0 for now as requested.
    };
    try {
      const response = await fetch(`/api/sales/${sale.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": localStorage.getItem("glow_token") || "" 
        },
        body: JSON.stringify(updatePayload)
      });
      if (response.ok) {
        await refreshData();
      }
    } catch (err) {
      console.error("Error toggling paid state:", err);
    }
  };

  const handleUpdateDeliveryStatus = async (sale: Sale, status: string) => {
    try {
      const response = await fetch(`/api/sales/${sale.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": localStorage.getItem("glow_token") || "" 
        },
        body: JSON.stringify({ ...sale, estado_entrega: status })
      });
      if (response.ok) {
        await refreshData();
      }
    } catch (err) {
      console.error("Error updating delivery status:", err);
    }
  };

  const handleUpdateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;

    try {
      const response = await fetch(`/api/sales/${editingSale.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": localStorage.getItem("glow_token") || "" 
        },
        body: JSON.stringify(editingSale)
      });
      if (response.ok) {
        setEditingSale(null);
        await refreshData();
      }
    } catch (err) {
      console.error("Error updating sale:", err);
    }
  };

  const MONTHLY_GOAL = 1000000;
  const currentMonthSales = sales.filter(s => {
    const d = new Date(s.fecha_venta);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlyGrossTotal = currentMonthSales.reduce((acc, s) => acc + (s.ingreso_bruto || 0), 0);
  const goalProgress = Math.min((monthlyGrossTotal / MONTHLY_GOAL) * 100, 100);

  // Sorting and Filtering Logic
  const filteredAndSortedSales = [...sales]
    .filter(sale => {
      const saleDate = new Date(sale.fecha_venta);
      saleDate.setHours(0, 0, 0, 0);
      
      let matchesFrom = true;
      let matchesTo = true;

      // Extract raw comparison value to avoid timezone issues with date strings
      if (dateFrom) {
        // Parse "YYYY-MM-DD" as local date
        const [year, month, day] = dateFrom.split("-").map(Number);
        const fromDate = new Date(year, month - 1, day, 0, 0, 0, 0);
        matchesFrom = saleDate >= fromDate;
      }

      if (dateTo) {
        const [year, month, day] = dateTo.split("-").map(Number);
        const toDate = new Date(year, month - 1, day, 23, 59, 59, 999);
        matchesTo = saleDate <= toDate;
      }

      let matchesPayment = true;
      if (paymentStatusFilter === "paid") {
        matchesPayment = !!sale.pagado;
      } else if (paymentStatusFilter === "unpaid") {
        matchesPayment = !sale.pagado && (Number(sale.pago_parcial) || 0) === 0;
      } else if (paymentStatusFilter === "partial") {
        matchesPayment = !sale.pagado && (Number(sale.pago_parcial) || 0) > 0;
      }

      const matchesCanal = canalFilter === "all" || sale.canal_venta === canalFilter;
      const matchesArca = arcaFilter === "all" || sale.estado_arca === arcaFilter;

      return matchesFrom && matchesTo && matchesPayment && matchesCanal && matchesArca;
    })
    .sort((a, b) => {
      let valA: any = a[sortBy as keyof Sale];
      let valB: any = b[sortBy as keyof Sale];

      // Handle special cases
      if (sortBy === 'cliente_nombre') {
        valA = `${a.cliente_nombre || ''} ${a.cliente_apellido || ''}`.trim().toLowerCase();
        valB = `${b.cliente_nombre || ''} ${b.cliente_apellido || ''}`.trim().toLowerCase();
      } else if (sortBy === 'product_name') {
        const prodA = products.find(p => p.id === a.product_id);
        const prodB = products.find(p => p.id === b.product_id);
        valA = (prodA?.nombre || '').toLowerCase();
        valB = (prodB?.nombre || '').toLowerCase();
      } else if (sortBy === 'canal_venta') {
        valA = (a.canal_venta || '').toLowerCase();
        valB = (b.canal_venta || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  const unpaidTotalCalculated = sales.reduce((acc, s) => {
    if (s.pagado) return acc;
    return acc + (Math.max(0, (s.ingreso_bruto || 0) - (Number(s.pago_parcial) || 0)));
  }, 0);

  const isDisconnected = sales.length === 0 && products.length === 0 && !loading;

  const metrics = [
    { 
      label: "Ingresos Netos", 
      value: `$${stats.totalRevenue.toLocaleString()}`, 
      icon: TrendingUp, 
      color: "text-emerald-400",
      accent: "bg-emerald-500/20"
    },
    { 
      label: "Ganancia Real", 
      value: `$${stats.realProfit.toLocaleString()}`, 
      icon: DollarSign, 
      color: "text-pink-400",
      accent: "bg-pink-500/20"
    },
    { 
      label: "Saldo por Cobrar", 
      value: `$${unpaidTotalCalculated.toLocaleString()}`, 
      icon: Clock, 
      color: "text-amber-400",
      accent: "bg-amber-500/20"
    },
    { 
      label: "Estado ARCA", 
      value: `${stats.arcaPending} Pendientes`, 
      icon: FileText, 
      color: "text-blue-400",
      accent: "bg-blue-500/20"
    },
  ];

  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-10 max-w-7xl mx-auto pb-24 md:pb-10">
      {isDisconnected && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-3 text-amber-400 text-sm"
        >
          <AlertTriangle size={18} />
          <div>
            <p className="font-bold">Modo Desconectado / Demo</p>
            <p className="opacity-70 text-xs text-balance">No se pudo conectar con el servidor. Si estás en Vercel, asegúrate de configurar las variables de entorno de Supabase. Mientras tanto, puedes explorar la interfaz con las credenciales admin / admin123.</p>
          </div>
        </motion.div>
      )}
      {isScanning && <Scanner onClose={() => setIsScanning(false)} />}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-1">Resumen Ejecutivo</p>
          <h1 className="serif text-4xl md:text-5xl font-light text-white italic leading-tight">GlowManager <span className="text-pink-400">AI</span></h1>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsScanning(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-pink-500 text-white rounded-full text-xs font-bold hover:bg-pink-400 transition-all shadow-lg shadow-pink-500/20"
          >
            <Plus size={16} />
            Nueva Venta
          </button>
          <button 
            onClick={() => logout()}
            className="px-4 py-3 bg-white/5 text-white/60 rounded-full text-xs font-bold hover:bg-white/10 transition-all border border-white/10"
            title="Cerrar Sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Grid de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {metrics.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass p-6 rounded-3xl shadow-sm hover:shadow-xl hover:bg-white/10 transition-all group overflow-hidden relative"
          >
            <div className={`absolute top-0 right-0 p-3 opacity-5 group-hover:scale-110 transition-transform text-white`}>
                <m.icon size={80} strokeWidth={1} />
            </div>
            <div className={`w-12 h-12 ${m.accent} ${m.color} rounded-2xl flex items-center justify-center mb-4 border border-white/10`}>
              <m.icon size={24} />
            </div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">{m.label}</p>
            <p className="text-2xl font-bold text-white tracking-tight">{m.value}</p>
          </motion.div>
        ))}

        {/* Tarjeta de Meta Mensual reubicada arriba */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: metrics.length * 0.1 }}
          className="glass p-6 rounded-3xl shadow-sm border border-white/10 relative overflow-hidden flex flex-col justify-between"
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-pink-500 opacity-10 rounded-full blur-3xl"></div>
          <div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Meta Mensual</p>
            <div className="flex justify-between text-[11px] mb-2 font-bold">
              <span className="text-white">${monthlyGrossTotal.toLocaleString()}</span>
              <span className="text-pink-400">{goalProgress.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${goalProgress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.4)]" 
              />
            </div>
          </div>
          <p className="text-[9px] opacity-40 leading-tight font-medium uppercase tracking-wider">
            {goalProgress >= 100 ? "¡Meta Alcanzada!" : `${(100 - goalProgress).toFixed(1)}% restante`}
          </p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Tabla de Ventas Recientes - Ahora a ancho completo */}
        <div className="glass rounded-3xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-white/5">
            <div className="flex items-center justify-between mb-6">
              <h2 className="serif text-xl font-medium text-white flex items-center gap-2 italic">
                <ShoppingBag size={20} className="text-pink-400" />
                PANEL DE VENTAS
              </h2>
              <button 
                onClick={() => onPageChange("inventory")}
                className="text-xs font-bold text-pink-400 uppercase tracking-widest hover:underline"
              >
                Ver Todo
              </button>
            </div>

            {/* Filtros */}
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
                  <div>
                    <label className="block text-[8px] uppercase tracking-widest text-white/30 font-bold mb-1.5 ml-1">Desde</label>
                    <input 
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white focus:border-pink-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] uppercase tracking-widest text-white/30 font-bold mb-1.5 ml-1">Hasta</label>
                    <input 
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white focus:border-pink-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] uppercase tracking-widest text-white/30 font-bold mb-1.5 ml-1">Canal</label>
                    <select 
                      value={canalFilter}
                      onChange={(e) => setCanalFilter(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white focus:border-pink-500 outline-none appearance-none"
                    >
                      <option value="all">Todos</option>
                      <option value="Local">Local</option>
                      <option value="MercadoLibre">MercadoLibre</option>
                      <option value="Web">Web</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[8px] uppercase tracking-widest text-white/30 font-bold mb-1.5 ml-1">ARCA</label>
                    <select 
                      value={arcaFilter}
                      onChange={(e) => setArcaFilter(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white focus:border-pink-500 outline-none appearance-none"
                    >
                      <option value="all">Todos</option>
                      <option value="Pendiente">Pendiente</option>
                      <option value="Facturado">Facturado</option>
                      <option value="Error">Error</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                   <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                      <button 
                        onClick={() => setPaymentStatusFilter("all")}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${paymentStatusFilter === 'all' ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/20' : 'text-white/40 hover:text-white'}`}
                      >
                        Todos
                      </button>
                      <button 
                        onClick={() => setPaymentStatusFilter("paid")}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${paymentStatusFilter === 'paid' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-white/40 hover:text-white'}`}
                      >
                        Cobrados
                      </button>
                      <button 
                        onClick={() => setPaymentStatusFilter("partial")}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${paymentStatusFilter === 'partial' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-white/40 hover:text-white'}`}
                      >
                        Parciales
                      </button>
                      <button 
                        onClick={() => setPaymentStatusFilter("unpaid")}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${paymentStatusFilter === 'unpaid' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-white/40 hover:text-white'}`}
                      >
                        Sin Pago
                      </button>
                   </div>

                   {(dateFrom || dateTo || sortBy !== 'fecha_venta' || sortOrder !== 'desc' || paymentStatusFilter !== 'all' || canalFilter !== 'all' || arcaFilter !== 'all') && (
                     <button 
                        onClick={() => { 
                          setDateFrom(""); 
                          setDateTo(""); 
                          setSortBy("fecha_venta"); 
                          setSortOrder("desc"); 
                          setPaymentStatusFilter("all");
                          setCanalFilter("all");
                          setArcaFilter("all");
                        }}
                        className="px-3 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest text-pink-400/60 hover:text-pink-400 transition-colors"
                     >
                       Limpiar Filtros
                     </button>
                   )}
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[600px]">
              <thead className="bg-white/5 text-white/40 uppercase text-[10px] font-bold tracking-widest border-b border-white/5">
                <tr>
                  <th 
                    className="px-6 py-4 cursor-pointer hover:text-pink-400 transition-colors"
                    onClick={() => {
                        if (sortBy === 'product_name') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        else { setSortBy('product_name'); setSortOrder('asc'); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Producto {sortBy === 'product_name' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 cursor-pointer hover:text-pink-400 transition-colors"
                    onClick={() => {
                        if (sortBy === 'cliente_nombre') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        else { setSortBy('cliente_nombre'); setSortOrder('asc'); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Cliente {sortBy === 'cliente_nombre' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 cursor-pointer hover:text-pink-400 transition-colors"
                    onClick={() => {
                        if (sortBy === 'canal_venta') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        else { setSortBy('canal_venta'); setSortOrder('asc'); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Canal {sortBy === 'canal_venta' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-right cursor-pointer hover:text-pink-400 transition-colors"
                    onClick={() => {
                        if (sortBy === 'ingreso_bruto') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        else { setSortBy('ingreso_bruto'); setSortOrder('desc'); }
                    }}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Monto {sortBy === 'ingreso_bruto' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-center">Estado</th>
                  <th 
                    className="px-6 py-4 cursor-pointer hover:text-pink-400 transition-colors"
                    onClick={() => {
                        if (sortBy === 'fecha_venta') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        else { setSortBy('fecha_venta'); setSortOrder('desc'); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Fecha {sortBy === 'fecha_venta' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80 text-[13px]">
                {filteredAndSortedSales.length === 0 ? (
                    <tr>
                        <td colSpan={7} className="px-6 py-10 text-center text-white/30 italic">No hay ventas que coincidan con los filtros</td>
                    </tr>
                ) : filteredAndSortedSales.map((sale) => {
                  const product = products.find(p => p.id === sale.product_id);
                  return (
                    <tr key={sale.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <div className="font-semibold text-white leading-tight">
                            {product?.nombre || `Venta #${sale.id.slice(-4).toUpperCase()}`}
                          </div>
                          {sale.detalles_venta && (
                            <div className="text-[10px] text-pink-400 font-medium italic opacity-100 bg-pink-500/5 px-1.5 py-0.5 rounded inline-block w-fit">
                              {sale.detalles_venta}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-white/60">
                        {sale.cliente_nombre ? `${sale.cliente_nombre} ${sale.cliente_apellido || ''}` : "N/A"}
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${sale.canal_venta === 'MercadoLibre' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : sale.canal_venta === 'Web' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                            {sale.canal_venta}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-medium text-white">${sale.ingreso_bruto.toLocaleString()}</div>
                        {sale.descuento > 0 && <div className="text-[9px] text-rose-400 opacity-60">Desc: -${sale.descuento.toLocaleString()}</div>}
                        {!sale.pagado && (
                           <div className="text-[9px] text-amber-400 font-bold mt-1">
                             P: ${sale.pago_parcial?.toLocaleString()} / S: ${(sale.ingreso_bruto - (sale.pago_parcial || 0)).toLocaleString()}
                           </div>
                        )}
                      </td>
                    <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] uppercase font-bold border ${sale.estado_arca === 'Facturado' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                                {sale.estado_arca}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button 
                              onClick={() => handleTogglePaid(sale)}
                              className={`flex items-center gap-1 text-[8px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded-full border transition-all ${sale.pagado ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse'}`}
                            >
                              {sale.pagado ? <><Check size={8} /> Cobrado</> : 'Pend. Pago'}
                            </button>
                            
                            <div className="flex gap-1 border-l border-white/10 pl-1.5 ml-1">
                               <button 
                                  onClick={() => handleUpdateDeliveryStatus(sale, sale.estado_entrega === 'Entregado' ? 'Pendiente' : 'Entregado')}
                                  className={`px-3 py-1 rounded text-[9px] font-bold border transition-all ${sale.estado_entrega === 'Entregado' ? 'bg-emerald-600 text-white border-emerald-700 shadow-lg shadow-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-400'}`}
                                  title={sale.estado_entrega === 'Entregado' ? "Marcar como pendiente" : "Marcar como entregado"}
                               >
                                  {sale.estado_entrega === 'Entregado' ? 'ENTREGADO' : 'E'}
                               </button>
                            </div>
                          </div>
                        </div>
                    </td>
                    <td className="px-6 py-4 text-white/40 tabular-nums">
                        {formatDate(sale.fecha_venta)}
                    </td>
                    <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                            {!sale.pagado && (
                                <button 
                                    onClick={() => handleTogglePaid(sale)}
                                    className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20"
                                    title="Marcar como Pagado"
                                >
                                    <Check size={14} />
                                </button>
                            )}
                            <button 
                                onClick={() => setEditingSale(sale)}
                                className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 hover:bg-blue-500/20"
                                title="Editar"
                            >
                                <Edit2 size={14} />
                            </button>
                            <button 
                                onClick={() => setIsDeletingId(sale.id)}
                                className="p-2 bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20 hover:bg-rose-500/20"
                                title="Eliminar"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Sale Modal */}
      <AnimatePresence>
        {editingSale && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass p-8 rounded-[2rem] w-full max-w-lg relative border border-white/10"
            >
              <button 
                onClick={() => setEditingSale(null)}
                className="absolute top-6 right-6 text-white/30 hover:text-white"
              >
                <X size={24} />
              </button>
              
              <h3 className="serif text-2xl text-white mb-6 italic">Editar Venta <span className="text-pink-400">#{editingSale.id.slice(-5).toUpperCase()}</span></h3>
              
              <form onSubmit={handleUpdateSale} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Nombre Cliente</label>
                    <input 
                      type="text"
                      value={editingSale.cliente_nombre || ''}
                      onChange={(e) => setEditingSale({...editingSale, cliente_nombre: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Apellido Cliente</label>
                    <input 
                      type="text"
                      value={editingSale.cliente_apellido || ''}
                      onChange={(e) => setEditingSale({...editingSale, cliente_apellido: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Canal de Venta</label>
                    <select 
                      value={editingSale.canal_venta}
                      onChange={(e) => setEditingSale({...editingSale, canal_venta: e.target.value as any})}
                      className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none"
                    >
                      <option value="Local" className="bg-[#1e1e1e] text-white">Local</option>
                      <option value="MercadoLibre" className="bg-[#1e1e1e] text-white">MercadoLibre</option>
                      <option value="Web" className="bg-[#1e1e1e] text-white">Web</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Estado ARCA</label>
                    <select 
                      value={editingSale.estado_arca}
                      onChange={(e) => setEditingSale({...editingSale, estado_arca: e.target.value as any})}
                      className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none"
                    >
                      <option value="Pendiente" className="bg-[#1e1e1e] text-white">Pendiente</option>
                      <option value="Facturado" className="bg-[#1e1e1e] text-white">Facturado</option>
                      <option value="Error" className="bg-[#1e1e1e] text-white">Error</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Ingreso Bruto</label>
                    <input 
                      type="number"
                      value={editingSale.ingreso_bruto}
                      onChange={(e) => setEditingSale({...editingSale, ingreso_bruto: Number(e.target.value)})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Descuento</label>
                    <input 
                      type="number"
                      value={editingSale.descuento || 0}
                      onChange={(e) => setEditingSale({...editingSale, descuento: Number(e.target.value)})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-rose-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Neto</label>
                    <input 
                      type="number"
                      value={editingSale.ingreso_neto}
                      onChange={(e) => setEditingSale({...editingSale, ingreso_neto: Number(e.target.value)})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none font-bold text-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Moneda</label>
                    <select 
                      value={editingSale.moneda || "ARS"}
                      onChange={(e) => setEditingSale({...editingSale, moneda: e.target.value as any})}
                      className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none"
                    >
                      <option value="ARS" className="bg-[#1e1e1e] text-white">ARS ($)</option>
                      <option value="USD" className="bg-[#1e1e1e] text-white">USD (U$D)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Estado Cobro</label>
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 h-[46px]">
                        <button 
                            type="button"
                            onClick={() => setEditingSale({...editingSale, pagado: true, pago_parcial: editingSale.ingreso_bruto})}
                            className={`flex-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${editingSale.pagado ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-white/40 hover:text-white'}`}
                        >
                            Pagado
                        </button>
                        <button 
                            type="button"
                            onClick={() => setEditingSale({...editingSale, pagado: false, pago_parcial: 0})}
                            className={`flex-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${!editingSale.pagado ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-white/40 hover:text-white'}`}
                        >
                            Pendiente
                        </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Comentarios (Talle/Color/Tono)</label>
                        <input 
                        type="text"
                        value={editingSale.detalles_venta || ''}
                        onChange={(e) => setEditingSale({...editingSale, detalles_venta: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Pago Parcial ($)</label>
                        <input 
                        type="number"
                        value={editingSale.pago_parcial || 0}
                        onChange={(e) => setEditingSale({...editingSale, pago_parcial: Number(e.target.value)})}
                        className={`w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none`}
                        />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Estado Entrega</label>
                    <select 
                      value={editingSale.estado_entrega || "Pendiente"}
                      onChange={(e) => setEditingSale({...editingSale, estado_entrega: e.target.value as any})}
                      className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none"
                    >
                      <option value="Pendiente" className="bg-[#1e1e1e] text-white">Pendiente</option>
                      <option value="Entregado" className="bg-[#1e1e1e] text-white">Entregado</option>
                    </select>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-pink-500 text-white rounded-xl font-bold hover:bg-pink-400 transition-all shadow-lg shadow-pink-500/20"
                >
                  Guardar Cambios
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeletingId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass p-8 rounded-[2rem] w-full max-w-sm text-center border border-white/10"
            >
              <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
                <Trash2 size={32} />
              </div>
              <h3 className="serif text-xl text-white mb-2 italic">¿Eliminar esta venta?</h3>
              <p className="text-white/40 text-sm mb-6">Esta acción es permanente y no se puede deshacer.</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsDeletingId(null)}
                  className="flex-1 py-3 bg-white/5 text-white/60 rounded-xl font-bold hover:bg-white/10 border border-white/10"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteSale(isDeletingId)}
                  className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-400 shadow-lg shadow-rose-500/20"
                >
                  Eliminar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
