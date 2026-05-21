import React, { useState, useMemo } from "react";
import { 
  Users, 
  Search, 
  Plus, 
  ChevronRight, 
  Mail, 
  Phone, 
  ShoppingBag, 
  TrendingUp, 
  AlertCircle,
  Edit2,
  Trash2,
  X,
  CreditCard,
  DollarSign,
  ArrowRight,
  ArrowUpDown
} from "lucide-react";
import { useData } from "./DataProvider";
import { Customer, Sale } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { apiFetch as fetch } from "../lib/api";

export const Customers: React.FC = () => {
  const { customers, setCustomers, refreshData, token, user } = useData();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  // Filter and sorting states
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [filterChannel, setFilterChannel] = useState<string>("ALL");
  const [filterDebt, setFilterDebt] = useState<string>("ALL");

  // Filtered and sorted customers
  const filteredCustomers = useMemo(() => {
    // 1. Filter by Search Term
    let result = customers.filter(c => 
      c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.apellido || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.canal || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    // 2. Filter by Channel
    if (filterChannel !== "ALL") {
      result = result.filter(c => (c.canal || "LOCAL").toUpperCase() === filterChannel.toUpperCase());
    }

    // 3. Filter by Debt Status
    if (filterDebt !== "ALL") {
      if (filterDebt === "debt") {
        result = result.filter(c => (c.debt || 0) > 0);
      } else if (filterDebt === "no-debt") {
        result = result.filter(c => (c.debt || 0) === 0);
      }
    }

    // 4. Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return `${a.nombre} ${a.apellido || ""}`.localeCompare(`${b.nombre} ${b.apellido || ""}`);
        case "name-desc":
          return `${b.nombre} ${b.apellido || ""}`.localeCompare(`${a.nombre} ${a.apellido || ""}`);
        case "purchases-desc":
          return (b.totalPurchased || 0) - (a.totalPurchased || 0);
        case "debt-desc":
          return (b.debt || 0) - (a.debt || 0);
        case "date-desc":
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case "date-asc":
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [customers, searchTerm, sortBy, filterChannel, filterDebt]);

  const handleSaveCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) {
      alert("No hay una sesión activa. Por favor, vuelve a iniciar sesión.");
      return;
    }
    
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const customerData = {
      nombre: String(formData.get("nombre") || "").trim(),
      apellido: String(formData.get("apellido") || "").trim(),
      canal: String(formData.get("canal") || "LOCAL"),
      userId: user?.id || "admin"
    };

    if (!customerData.nombre) {
      alert("El nombre es obligatorio");
      setIsSubmitting(false);
      return;
    }

    try {
      const url = editingCustomer ? `/api/customers/${editingCustomer.id}` : "/api/customers";
      const method = editingCustomer ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": token
        },
        body: JSON.stringify(customerData)
      });

      const result = await res.json();

      if (res.ok) {
        setIsAdding(false);
        setEditingCustomer(null);
        await refreshData();
        alert(editingCustomer ? "Cliente actualizado con éxito" : "Cliente registrado con éxito");
      } else {
        alert(`Error al guardar: ${result.error || "Desconocido"}\n\n${result.details || "Si crees que esto es un error, por favor cierra sesión e inicia sesión de nuevo para forzar que tu navegador reciba las credenciales reales de Supabase."}`);
      }
    } catch (err: any) {
      console.error("Error saving customer:", err);
      alert(`Error de red: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteCustomer = async () => {
    if (!customerToDelete || !token) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${customerToDelete.id}`, {
        method: "DELETE",
        headers: { "Authorization": token }
      });
      if (res.ok) {
        await refreshData();
        if (selectedCustomer?.id === customerToDelete.id) {
          setSelectedCustomer(null);
        }
        setCustomerToDelete(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Error al eliminar cliente: ${errData.error || "Desconocido"}`);
      }
    } catch (err: any) {
      console.error("Error deleting customer:", err);
      alert(`Error de red: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number, moeda: string = "ARS") => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: moeda,
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-indigo-400" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">CLIENTES</h1>
          </div>
          <p className="text-white/40 text-sm font-medium">Gestión de cartera y balances de clientes</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-indigo-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white/5 border border-white/5 rounded-2xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white/[0.07] transition-all w-[240px]"
            />
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-indigo-500 hover:bg-indigo-400 text-white px-5 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" />
            NUEVO CLIENTE
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Customer List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row gap-4 p-5 bg-white/[0.02] border border-white/5 rounded-3xl items-center justify-between">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Filter by Channel */}
              <div className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white/60">
                <span className="font-mono text-[10px] uppercase font-bold text-indigo-400">Canal:</span>
                <select
                  value={filterChannel}
                  onChange={(e) => setFilterChannel(e.target.value)}
                  className="bg-transparent border-none text-white focus:outline-none focus:ring-0 cursor-pointer font-medium"
                >
                  <option value="ALL" className="bg-[#0e0e11] text-white">Todos</option>
                  <option value="LOCAL" className="bg-[#0e0e11] text-white">LOCAL</option>
                  <option value="WEB" className="bg-[#0e0e11] text-white">WEB</option>
                  <option value="MERCADOLIBRE" className="bg-[#0e0e11] text-white">MERCADOLIBRE</option>
                </select>
              </div>

              {/* Filter by Debt */}
              <div className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white/60">
                <span className="font-mono text-[10px] uppercase font-bold text-indigo-400">Deuda:</span>
                <select
                  value={filterDebt}
                  onChange={(e) => setFilterDebt(e.target.value)}
                  className="bg-transparent border-none text-white focus:outline-none focus:ring-0 cursor-pointer font-medium"
                >
                  <option value="ALL" className="bg-[#0e0e11] text-white">Todos</option>
                  <option value="debt" className="bg-[#0e0e11] text-rose-400 font-bold">Con Deuda Activa</option>
                  <option value="no-debt" className="bg-[#0e0e11] text-emerald-400 font-bold">Sin Deuda</option>
                </select>
              </div>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white/60 w-full md:w-auto justify-between md:justify-start">
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-indigo-400">
                <ArrowUpDown size={12} />
                <span>Ordenar por:</span>
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent border-none text-white focus:outline-none focus:ring-0 cursor-pointer font-medium text-right md:text-left"
              >
                <option value="name-asc" className="bg-[#0e0e11] text-white">Nombre (A-Z)</option>
                <option value="name-desc" className="bg-[#0e0e11] text-white">Nombre (Z-A)</option>
                <option value="purchases-desc" className="bg-[#0e0e11] text-white">Mayor Compra (Total)</option>
                <option value="debt-desc" className="bg-[#0e0e11] text-white">Mayor Deuda</option>
                <option value="date-desc" className="bg-[#0e0e11] text-white">Más Recientes</option>
                <option value="date-asc" className="bg-[#0e0e11] text-white">Más Antiguos</option>
              </select>
            </div>
          </div>

          <div className="glass rounded-[2rem] overflow-hidden border border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-white/40 uppercase text-[10px] font-bold tracking-widest border-b border-white/5">
                  <tr>
                    <th className="px-6 py-5">Cliente</th>
                    <th className="px-6 py-5 text-right">Compras</th>
                    <th className="px-6 py-5 text-right">Deuda</th>
                    <th className="px-6 py-5 text-center">Canal Habitual</th>
                    <th className="px-6 py-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center text-white/20">
                        No se encontraron clientes
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map(c => (
                      <tr 
                        key={c.id} 
                        onClick={() => setSelectedCustomer(c)}
                        className={`hover:bg-white/5 transition-colors group cursor-pointer ${selectedCustomer?.id === c.id ? 'bg-white/5' : ''}`}
                      >
                        <td className="px-6 py-5">
                          <div className="font-semibold text-white group-hover:text-indigo-400 transition-colors uppercase tracking-tight">
                            {c.nombre} {c.apellido}
                          </div>
                          <div className="text-[10px] text-white/30 font-mono tracking-wider">
                            Registrado el {new Date(c.created_at || Date.now()).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="font-bold text-white mb-0.5">{formatCurrency(c.totalPurchased || 0)}</div>
                          <div className="text-[10px] text-white/30">{c.salesCount || 0} compras</div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className={`font-bold ${(c.debt || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {formatCurrency(c.debt || 0)}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          {(() => {
                            const canalUpper = (c.canal || "LOCAL").toUpperCase();
                            const badgeClasses = 
                              canalUpper === "MERCADOLIBRE" 
                                ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" 
                                : canalUpper === "WEB" 
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                : "bg-blue-500/10 text-blue-400 border-blue-500/20";
                            return (
                              <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded border ${badgeClasses}`}>
                                {c.canal || "LOCAL"}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-2 px-6">
                            <button 
                              onClick={() => { setEditingCustomer(c); setIsAdding(true); }}
                              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/20 hover:text-white"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setCustomerToDelete(c)}
                              className="p-2 hover:bg-rose-500/20 rounded-xl transition-colors text-white/20 hover:text-rose-400"
                              title="Eliminar Cliente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Detailed Balance View */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {!selectedCustomer ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-[2rem] p-10 text-center border border-white/5 h-[400px] flex flex-col items-center justify-center bg-white/2"
              >
                <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mb-6">
                  <Users className="w-8 h-8 text-indigo-400/40" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Selecciona un cliente</h3>
                <p className="text-white/30 text-sm leading-relaxed max-w-[200px]">
                  Haz clic en un cliente para ver su historial de compras y balance detallado
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key="details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="glass rounded-[2rem] p-8 border border-white/5 space-y-8"
              >
                {/* Profile Header */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">
                      {selectedCustomer.nombre} {selectedCustomer.apellido}
                    </h3>
                    <div className="flex items-center gap-2">
                       <p className="text-white/40 text-xs font-mono tracking-widest uppercase">
                        ID: {String(selectedCustomer.id).slice(0, 8)}
                      </p>
                      {selectedCustomer.canal && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-white/40 border border-white/5 uppercase">
                          {selectedCustomer.canal}
                        </span>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedCustomer(null)}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/20"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Account Balances Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                      <ShoppingBag className="w-3 h-3" />
                      Total Compras
                    </p>
                    <p className="text-lg font-black text-white">
                      {formatCurrency(selectedCustomer.totalPurchased || 0)}
                    </p>
                  </div>
                  <div className={`border rounded-2xl p-4 ${(selectedCustomer.debt || 0) > 0 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5 ${(selectedCustomer.debt || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      <CreditCard className="w-3 h-3" />
                      Deuda Actual
                    </p>
                    <p className={`text-lg font-black ${(selectedCustomer.debt || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {formatCurrency(selectedCustomer.debt || 0)}
                    </p>
                  </div>
                </div>

                {/* Purchase History */}
                <div className="space-y-4">
                  <h4 className="text-[11px] font-black text-white/40 uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Historial de Compras
                  </h4>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-glow">
                    {(selectedCustomer.purchases || []).length === 0 ? (
                      <p className="text-white/20 text-xs italic">Sin registros de compras</p>
                    ) : (
                      selectedCustomer.purchases?.map((sale: Sale) => (
                        <div key={sale.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-sm font-bold text-white mb-0.5">
                                {(() => {
                                  const baseName = sale.product_info?.nombre || "Venta de Producto";
                                  const details = sale.detalles_venta || "";
                                  if (details.trim().startsWith("{") && details.trim().endsWith("}")) {
                                    try {
                                      const parsed = JSON.parse(details);
                                      const varInfo = parsed.variant_desc ? ` - Variante: ${parsed.variant_desc}` : parsed.variant_sku ? ` - SKU: ${parsed.variant_sku}` : "";
                                      const notesPart = parsed.notes ? ` (${parsed.notes})` : "";
                                      return `${baseName}${varInfo}${notesPart}`;
                                    } catch (e) {
                                      // ignore
                                    }
                                  }
                                  return details ? `${baseName} (${details})` : baseName;
                                })()}
                              </div>
                              <div className="text-[10px] text-white/30 font-mono tracking-wider">
                                {new Date(sale.fecha_venta).toLocaleDateString()}
                              </div>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border whitespace-nowrap ${sale.pagado ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                              {sale.pagado ? 'Pagado' : sale.pago_parcial && sale.pago_parcial > 0 ? 'Pago Parcial' : 'Sin Cobrar'}
                            </span>
                          </div>
                          <div className="flex justify-between items-end">
                            <div className="text-xs text-white/40 font-medium">
                              {sale.canal_venta} • {sale.moneda || 'ARS'}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-black text-white tracking-tight">
                                {formatCurrency(sale.ingreso_bruto, sale.moneda)}
                              </div>
                              {sale.pago_parcial && sale.pago_parcial > 0 && !sale.pagado && (
                                <div className="text-[10px] text-emerald-400 font-bold">
                                  Cobrado: {formatCurrency(sale.pago_parcial, sale.moneda)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Manual Add/Edit Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0A0A0A] border border-white/10 rounded-[2.5rem] w-full max-w-xl overflow-hidden shadow-2xl relative"
            >
              <div className="px-8 py-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
                <div>
                  <h2 className="text-2xl font-black text-white italic tracking-tighter">
                    {editingCustomer ? 'EDITAR CLIENTE' : 'REGISTRAR CLIENTE'}
                  </h2>
                  <p className="text-white/40 text-xs font-medium uppercase tracking-widest mt-1">Completa los datos del cliente</p>
                </div>
                <button onClick={() => { setIsAdding(false); setEditingCustomer(null); }} className="text-white/20 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} className="p-8 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Nombre</label>
                    <input 
                      name="nombre"
                      defaultValue={editingCustomer?.nombre}
                      required
                      placeholder="Ej: Juan"
                      className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Apellido</label>
                    <input 
                      name="apellido"
                      defaultValue={editingCustomer?.apellido}
                      placeholder="Ej: Perez"
                      className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Canal de Venta</label>
                    <div className="relative">
                      <ShoppingBag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                      <select 
                        name="canal"
                        defaultValue={editingCustomer?.canal || "LOCAL"}
                        className="w-full bg-white/5 border border-white/5 rounded-2xl pl-12 pr-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all appearance-none"
                      >
                        <option value="LOCAL" className="bg-[#0A0A0A]">LOCAL</option>
                        <option value="WEB" className="bg-[#0A0A0A]">WEB</option>
                        <option value="MERCADOLIBRE" className="bg-[#0A0A0A]">MERCADOLIBRE</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => { setIsAdding(false); setEditingCustomer(null); }}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl font-bold transition-all border border-white/5"
                  >
                    CANCELAR
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-400 text-white py-4 rounded-2xl font-black italic tracking-tighter disabled:opacity-50 transition-all shadow-xl shadow-indigo-500/20"
                  >
                    {isSubmitting ? 'GUARDANDO...' : editingCustomer ? 'ACTUALIZAR' : 'REGISTRAR'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Deletion Confirmation Modal */}
      <AnimatePresence>
        {customerToDelete && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0e0e11] border border-white/10 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-6 font-mono">
                <Trash2 size={24} />
              </div>
              <h3 className="serif text-2xl text-white mb-2 italic">
                ¿Eliminar Cliente?
              </h3>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                ¿Estás seguro de que deseas eliminar a <strong className="text-white uppercase font-bold">{customerToDelete.nombre} {customerToDelete.apellido || ""}</strong>? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => setCustomerToDelete(null)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3.5 rounded-2xl font-bold transition-all border border-white/5 text-xs tracking-wider"
                >
                  CANCELAR
                </button>
                <button 
                  type="button"
                  disabled={isSubmitting}
                  onClick={confirmDeleteCustomer}
                  className="flex-1 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white py-3.5 rounded-2xl font-black italic tracking-tighter transition-all shadow-xl shadow-rose-500/20 text-xs"
                >
                  {isSubmitting ? "ELIMINANDO..." : "ELIMINAR"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
