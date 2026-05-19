import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useData } from "./DataProvider";
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  Plus, 
  Trash2, 
  Calendar,
  Wallet,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Filter,
  Search,
  MoreHorizontal,
  Edit2,
  Check,
  X,
  Loader2
} from "lucide-react";
import { Movement } from "../types";

export const Financials: React.FC = () => {
  const { movements, setMovements, refreshData, token, stats } = useData();
  const [isAdding, setIsAdding] = useState(false);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingBalance, setIsEditingBalance] = useState<"ARS" | "USD" | null>(null);
  const [isEditingLoan, setIsEditingLoan] = useState<{ member: string, currency: "ARS" | "USD" } | null>(null);
  const [newBalanceValue, setNewBalanceValue] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterCurrency, setFilterCurrency] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isConfirmingBulk, setIsConfirmingBulk] = useState(false);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [formData, setFormData] = useState({
    tipo_movimiento: "Egreso" as "Ingreso" | "Egreso",
    categoria: "Varios" as "Venta" | "Varios" | "Fijo" | "Préstamo" | "Ajuste" | "Compra de Mercadería",
    monto: "",
    moneda: "ARS" as "ARS" | "USD",
    descripcion: "",
    fecha: (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })()
  });

  const formatDateForDisplay = (dateStr: string) => {
    if (!dateStr) return "-";
    // If it's a full ISO string, extract just the date part
    const cleanDate = dateStr.split('T')[0];
    const [year, month, day] = cleanDate.split('-');
    if (!year || !month || !day) return dateStr;
    return `${day}/${month}/${year}`;
  };

  const balances = useMemo(() => {
    // Prefer the server-calculated total balance if available
    if (stats.currentBalanceARS !== undefined && stats.currentBalanceUSD !== undefined) {
      return {
        ARS: stats.currentBalanceARS,
        USD: stats.currentBalanceUSD
      };
    }

    // Fallback to client-side calculation from loaded movements
    const res = { ARS: 0, USD: 0 };
    movements.forEach(m => {
      const val = parseFloat(String(m.monto)) || 0;
      const currency = m.moneda;
      if (currency === "ARS" || currency === "USD") {
        if (m.tipo_movimiento === "Ingreso") {
          res[currency] += val;
        } else {
          res[currency] -= val;
        }
      }
    });
    return res;
  }, [movements, stats.currentBalanceARS, stats.currentBalanceUSD]);

  const handleAdjustBalance = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log("Adjusting balance...", { isEditingBalance, newBalanceValue, isSubmitting });
    if (!isEditingBalance || newBalanceValue === "" || isSubmitting) return;

    const currentBalance = balances[isEditingBalance];
    const targetBalance = parseFloat(newBalanceValue.replace(',', '.'));
    const difference = targetBalance - currentBalance;

    console.log("Balance calculation:", { currentBalance, targetBalance, difference });

    if (isNaN(targetBalance) || Math.abs(difference) < 0.01) {
      setIsEditingBalance(null);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        tipo_movimiento: difference > 0 ? "Ingreso" : "Egreso",
        categoria: "Ajuste",
        monto: Math.abs(difference),
        moneda: isEditingBalance,
        descripcion: `Ajuste de Saldo: de ${isEditingBalance === 'ARS' ? '$' : 'U$D'}${currentBalance.toLocaleString()} a ${isEditingBalance === 'ARS' ? '$' : 'U$D'}${targetBalance.toLocaleString()}`,
        fecha: new Date().toISOString(),
        userId: "admin"
      };
      
      console.log("Sending movement request:", payload);
      
      const response = await fetch("/api/movements", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token || localStorage.getItem("glow_token") || "" 
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        console.log("Movement registered successfully");
        setIsEditingBalance(null);
        setNewBalanceValue("");
        await refreshData();
      } else {
        const err = await response.json();
        console.error("Error response from server:", err);
      }
    } catch (err) {
      console.error("Error adjusting balance:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustLoanDebt = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    console.log("Adjusting loan debt...", { isEditingLoan, newBalanceValue, isSubmitting });
    if (!isEditingLoan || newBalanceValue === "" || isSubmitting) return;

    const { member, currency } = isEditingLoan;
    
    // Calculate current debt
    const memberMovements = movements.filter(m => m.categoria === "Préstamo" && (m.descripcion || "").includes(member));
    const currentDebt = memberMovements.reduce((acc, m) => {
      const val = parseFloat(String(m.monto)) || 0;
      if (m.moneda !== currency) return acc;
      return m.tipo_movimiento === "Egreso" ? acc + val : acc - val;
    }, 0);

    const targetDebt = parseFloat(newBalanceValue.replace(',', '.'));
    if (isNaN(targetDebt)) return;
    
    const difference = targetDebt - currentDebt;
    console.log("Loan debt calculation:", { currentDebt, targetDebt, difference });

    if (Math.abs(difference) < 0.01) {
      setIsEditingLoan(null);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        tipo_movimiento: difference > 0 ? "Egreso" : "Ingreso",
        categoria: "Préstamo",
        monto: Math.abs(difference),
        moneda: currency,
        descripcion: `Ajuste Deuda ${member}: de ${currency === 'ARS' ? '$' : 'U$D'}${currentDebt.toLocaleString()} a ${currency === 'ARS' ? '$' : 'U$D'}${targetDebt.toLocaleString()}`,
        fecha: new Date().toISOString(),
        userId: "admin"
      };

      console.log("Sending loan adjustment request:", payload);

      const response = await fetch("/api/movements", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token || localStorage.getItem("glow_token") || "" 
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log("Loan adjustment registered successfully");
        setIsEditingLoan(null);
        setNewBalanceValue("");
        await refreshData();
      } else {
        const err = await response.json();
        console.error("Error response from server:", err);
      }
    } catch (err) {
      console.error("Error adjusting loan debt:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const url = editingMovement ? `/api/movements/${editingMovement.id}` : "/api/movements";
      const method = editingMovement ? "PUT" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token || localStorage.getItem("glow_token") || "" 
        },
        body: JSON.stringify({
          ...formData,
          monto: parseFloat(formData.monto) || 0,
          userId: "admin"
        })
      });
      if (response.ok) {
        setIsAdding(false);
        setEditingMovement(null);
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        setFormData({
          tipo_movimiento: "Egreso",
          categoria: "Varios",
          monto: "",
          moneda: "ARS",
          descripcion: "",
          fecha: todayStr
        });
        await refreshData();
      }
    } catch (err) {
      console.error("Error saving movement:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (m: Movement) => {
    setEditingMovement(m);
    
    // Safely parse date to YYYY-MM-DD for input
    const datePart = m.fecha ? m.fecha.split('T')[0] : "";
    
    setFormData({
      tipo_movimiento: m.tipo_movimiento as any,
      categoria: m.categoria as any,
      monto: m.monto.toString(),
      moneda: m.moneda as any,
      descripcion: m.descripcion,
      fecha: datePart
    });
    setSelectedIds([]);
    setIsAdding(true);
  };

  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    if (!isConfirmingBulk) {
      setIsConfirmingBulk(true);
      return;
    }

    setIsConfirmingBulk(false);
    setIsDeletingBulk(true);

    const previousMovements = [...movements];
    const previousSelectedIds = [...selectedIds];
    const idsToDelete = [...selectedIds];

    // Optimistic update
    setMovements(prev => prev.filter(m => !idsToDelete.includes(m.id)));

    try {
      const authHeader = token || localStorage.getItem("glow_token") || "";
      const response = await fetch("/api/bulk-delete/movements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader
        },
        body: JSON.stringify({ ids: idsToDelete })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Error en el borrado masivo");
      }

      setSelectedIds([]);
      await refreshData();
    } catch (err: any) {
      console.error("[FINANCIALS] Bulk delete catch error:", err);
      setMovements(previousMovements);
      setSelectedIds(previousSelectedIds);
      alert(`Error al eliminar registros: ${err.message}`);
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const toggleSelectAll = (filteredItems: Movement[]) => {
    if (selectedIds.length === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map(m => m.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log(`[FINANCIALS] handleDelete called for ID: ${id}`);
    if (!id || isSubmitting) return;

    // First click: set state to confirm
    if (confirmDeleteId !== id) {
        setConfirmDeleteId(id);
        // Reset after 3 seconds if not confirmed
        setTimeout(() => setConfirmDeleteId(null), 3000);
        return;
    }

    // Second click: proceed with deletion
    setConfirmDeleteId(null);
    console.log(`[FINANCIALS] Proceeding with deletion for ID: ${id}`);

    // Estado previo para rollback
    const previousMovements = [...movements];

    // Actualización optimista
    setMovements(prev => prev.filter(m => m.id !== id));
    setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));

    setIsSubmitting(true);
    try {
      const authHeader = token || localStorage.getItem("glow_token") || "";
      console.log(`[FINANCIALS] Sending DELETE request to /api/movements/${id} with token: ${authHeader ? 'Exists' : 'MISSING'}`);
      
      const response = await fetch(`/api/movements/${id}`, {
        method: "DELETE",
        headers: { 
          "Authorization": authHeader 
        }
      });

      console.log(`[FINANCIALS] Response status: ${response.status}`);
      if (response.ok) {
        console.log("[FINANCIALS] Delete successful, refreshing data...");
        // Todo bien, el balance y stats se recalcularán al llamar a refreshData
        await refreshData();
      } else {
        const err = await response.json().catch(() => ({}));
        console.error("[FINANCIALS] Server error:", err);
        // Rollback
        setMovements(previousMovements);
        alert(`Error al eliminar: ${err.error || "No autorizado"}`);
      }
    } catch (err) {
      // Rollback
      setMovements(previousMovements);
      console.error("[FINANCIALS] Catch error:", err);
      alert("Error de conexión al servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredMovements = useMemo(() => {
    return movements
      .filter(m => {
        if (filterType && m.categoria !== filterType) return false;
        if (filterCurrency && m.moneda !== filterCurrency) return false;
        
        if (startDate || endDate) {
          const mDateStr = m.fecha ? m.fecha.split('T')[0] : "";
          
          if (startDate && mDateStr < startDate) return false;
          if (endDate && mDateStr > endDate) return false;
        }

        if (searchTerm && !(m.descripcion || "").toLowerCase().includes(searchTerm.toLowerCase())) {
          return false;
        }
        
        return true;
      })
      .sort((a, b) => {
        const dateA = new Date(a.fecha).getTime();
        const dateB = new Date(b.fecha).getTime();
        if (dateA !== dateB) {
          return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
        }
        
        // Tie-breaker: use created_at for movements on the same logical date
        const createA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const createB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return sortOrder === "asc" ? createA - createB : createB - createA;
      });
  }, [movements, filterType, filterCurrency, startDate, endDate, searchTerm, sortOrder]);

  // Reference date for resetting the "Ajuste" counter as requested by user
  // This will hide "Ajuste" movements created before this specific timestamp in the summary panel
  const ADJUSTMENT_RESET_DATE = new Date("2026-05-18T03:45:00Z").getTime();

  const panels = [
    { id: "Venta", label: "Ingresos por Ventas", color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { id: "Compra de Mercadería", label: "Compra de Mercadería", color: "text-orange-400", bg: "bg-orange-500/10" },
    { id: "Varios", label: "Egresos Varios", color: "text-rose-400", bg: "bg-rose-500/10" },
    { id: "Fijo", label: "Gastos Fijos", color: "text-amber-400", bg: "bg-amber-500/10" },
    { id: "Ajuste", label: "Ajustes", color: "text-indigo-400", bg: "bg-indigo-500/10" },
    { id: "Préstamo", label: "Préstamos", color: "text-violet-400", bg: "bg-violet-500/10" }
  ];

  const loanMembers = ["Carlos Craca", "Yeimar González"];

  return (
    <div className="p-4 lg:p-8 space-y-8">
      {/* Header & Balance Cards */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="serif text-4xl lg:text-5xl text-white italic tracking-tight">Finanzas</h1>
          <p className="text-white/40 text-xs uppercase tracking-[0.3em] font-bold mt-2">Control de Ingresos y Egresos</p>
        </div>

        <div className="flex flex-wrap gap-4">
          {/* Balance ARS */}
          <div className="bg-[#1e1e1e] border border-white/5 p-4 rounded-3xl min-w-[200px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
              <Wallet className="text-emerald-400" size={40} />
            </div>
            <div className="flex justify-between items-start mb-1">
              <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Saldo ARS</p>
              {isEditingBalance !== "ARS" && (
                <button 
                  onClick={() => {
                    setIsEditingBalance("ARS");
                    setNewBalanceValue(balances.ARS.toString());
                  }}
                  className="p-2 -m-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                  title="Editar saldo"
                >
                  <Edit2 size={14} />
                </button>
              )}
            </div>
            
            {isEditingBalance === "ARS" ? (
              <div className="flex items-center gap-2 relative z-10">
                <input 
                  autoFocus
                  type="number"
                  value={newBalanceValue}
                  onChange={(e) => setNewBalanceValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdjustBalance();
                    if (e.key === "Escape") setIsEditingBalance(null);
                  }}
                  className="w-full bg-white/10 border border-emerald-500/50 rounded-xl px-3 py-1 text-emerald-400 font-mono font-bold text-xl outline-none"
                />
                <button 
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleAdjustBalance()} 
                  className={`p-1.5 rounded-lg text-white transition-all ${isSubmitting ? 'bg-emerald-500/50 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                >
                  <Check size={16} className={isSubmitting ? "animate-pulse" : ""} />
                </button>
                <button onClick={() => setIsEditingBalance(null)} className="bg-white/10 p-1.5 rounded-lg text-white/40"><X size={16} /></button>
              </div>
            ) : (
              <p className="text-2xl font-mono font-bold text-emerald-400">${balances.ARS.toLocaleString()}</p>
            )}
          </div>

          {/* Balance USD */}
          <div className="bg-[#1e1e1e] border border-white/5 p-4 rounded-3xl min-w-[200px] relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
              <DollarSign className="text-blue-400" size={40} />
            </div>
            <div className="flex justify-between items-start mb-1">
              <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Saldo USD</p>
              {isEditingBalance !== "USD" && (
                <button 
                  onClick={() => {
                    setIsEditingBalance("USD");
                    setNewBalanceValue(balances.USD.toString());
                  }}
                  className="p-2 -m-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                  title="Editar saldo"
                >
                  <Edit2 size={14} />
                </button>
              )}
            </div>

            {isEditingBalance === "USD" ? (
              <div className="flex items-center gap-2 relative z-10">
                <input 
                  autoFocus
                  type="number"
                  value={newBalanceValue}
                  onChange={(e) => setNewBalanceValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdjustBalance();
                    if (e.key === "Escape") setIsEditingBalance(null);
                  }}
                  className="w-full bg-white/10 border border-blue-500/50 rounded-xl px-3 py-1 text-blue-400 font-mono font-bold text-xl outline-none"
                />
                <button 
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleAdjustBalance()} 
                  className={`p-1.5 rounded-lg text-white transition-all ${isSubmitting ? 'bg-blue-500/50 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
                >
                  <Check size={16} className={isSubmitting ? "animate-pulse" : ""} />
                </button>
                <button onClick={() => setIsEditingBalance(null)} className="bg-white/10 p-1.5 rounded-lg text-white/40"><X size={16} /></button>
              </div>
            ) : (
              <p className="text-2xl font-mono font-bold text-blue-400">U$D {balances.USD.toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* Left Column: List of movements */}
        <div className="xl:col-span-2 space-y-6">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {panels.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setFilterType(filterType === p.id ? null : p.id)}
                    className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${
                      filterType === p.id ? `${p.bg} ${p.color} border-white/10` : 'bg-white/5 text-white/40 border-transparent hover:border-white/10'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setIsAdding(true)}
                className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-pink-500/20 transition-all font-bold"
              >
                <Plus size={16} />
                Nuevo Registro
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 bg-white/5 p-4 rounded-3xl border border-white/5">
              <div className="flex-1 min-w-[250px] relative">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                <input 
                  type="text"
                  placeholder="Buscar por descripción..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-4 py-2 text-xs text-white focus:border-pink-500 outline-none transition-all"
                />
              </div>

              <div className="flex items-center gap-3">
                <Calendar size={14} className="text-white/40" />
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">Desde</span>
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:border-pink-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">Hasta</span>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:border-pink-500 outline-none"
                  />
                </div>
              </div>
              
              {(startDate || endDate || filterType || searchTerm) && (
                <button 
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setFilterType(null);
                    setSearchTerm("");
                    setSortOrder("desc");
                  }}
                  className="text-pink-500 hover:text-pink-400 text-[10px] font-bold uppercase tracking-widest ml-auto flex items-center gap-1 transition-all"
                >
                  <X size={14} />
                  Limpiar Filtros
                </button>
              )}
            </div>
          </div>

          <div className="bg-[#1e1e1e] border border-white/5 rounded-[40px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-white/40 uppercase text-[10px] font-bold tracking-widest border-b border-white/5">
                  <tr>
                    <th className="px-6 py-5 w-10" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        className="accent-pink-600 w-4 h-4 rounded border-white/10 bg-white/5 cursor-pointer"
                        checked={selectedIds.length === filteredMovements.length && filteredMovements.length > 0}
                        onChange={() => toggleSelectAll(filteredMovements)}
                      />
                    </th>
                    <th className="px-6 py-5">Movimiento</th>
                    <th className="px-6 py-5">Categoría</th>
                    <th className="px-6 py-5 text-right">Monto</th>
                    <th 
                      className="px-6 py-5 cursor-pointer hover:text-pink-400 transition-colors"
                      onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    >
                      <div className="flex items-center gap-1">
                        Fecha {sortOrder === 'asc' ? '↑' : '↓'}
                      </div>
                    </th>
                    <th className="px-6 py-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-white/20 italic">No hay movimientos registrados</td>
                    </tr>
                  ) : filteredMovements.map((m) => (
                    <tr 
                      key={m.id} 
                      onClick={() => handleEditClick(m)}
                      className={`hover:bg-white/5 transition-colors cursor-pointer group ${selectedIds.includes(m.id) ? 'bg-pink-500/5 focus-within:bg-pink-500/10' : ''}`}
                    >
                      <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          className="accent-pink-600 w-4 h-4 rounded border-white/10 bg-white/5 cursor-pointer"
                          checked={selectedIds.includes(m.id)}
                          onChange={() => toggleSelect(m.id)}
                        />
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${m.tipo_movimiento === 'Ingreso' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {m.tipo_movimiento === 'Ingreso' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                          </div>
                          <div>
                            <p className="font-semibold text-white">{m.descripcion}</p>
                            <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">{m.tipo_movimiento}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold border ${
                          m.categoria === 'Venta' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          m.categoria === 'Compra de Mercadería' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                          m.categoria === 'Fijo' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          m.categoria === 'Préstamo' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
                          'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}>
                          {m.categoria}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <p className={`font-mono font-bold text-lg ${m.tipo_movimiento === 'Ingreso' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {m.moneda === 'USD' ? 'U$D ' : '$'}
                          {(parseFloat(String(m.monto)) || 0).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-6 py-5 text-white/40 tabular-nums">
                        {formatDateForDisplay(m.fecha)}
                      </td>
                      <td className="px-6 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleEditClick(m)}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-pink-500/10 text-white/40 hover:text-pink-500 rounded-xl transition-all group"
                            title="Editar movimiento"
                          >
                            <Edit2 size={14} className="group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Editar</span>
                          </button>
                          <button 
                            onClick={(e) => handleDelete(e, m.id)}
                            disabled={isSubmitting}
                            className={`p-2 rounded-xl transition-all duration-200 group disabled:opacity-50 ${
                              confirmDeleteId === m.id 
                                ? "bg-red-500 text-white animate-pulse" 
                                : "text-red-500/40 hover:text-red-500 hover:bg-red-500/10"
                            }`}
                            title={confirmDeleteId === m.id ? "CONFIRMAR" : "Eliminar registro"}
                          >
                            <Trash2 size={16} className={confirmDeleteId === m.id ? "animate-bounce" : "group-hover:scale-110 transition-transform"} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Bulk Action Bar */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 glass px-8 py-4 rounded-3xl z-50 flex items-center gap-8 shadow-2xl border border-white/10"
            >
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">{isConfirmingBulk ? "¿Estás seguro?" : "Seleccionados"}</span>
                <span className="text-xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">{selectedIds.length} registros</span>
              </div>
              <div className="h-8 w-px bg-white/10"></div>

              {isConfirmingBulk ? (
                <div className="flex gap-4">
                  <button 
                    onClick={handleBulkDelete}
                    disabled={isDeletingBulk}
                    className="flex items-center gap-3 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-600/20 disabled:opacity-50 disabled:scale-100"
                  >
                    {isDeletingBulk ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    {isDeletingBulk ? "ELIMINANDO..." : "SÍ, ELIMINAR"}
                  </button>
                  <button 
                    onClick={() => setIsConfirmingBulk(false)}
                    disabled={isDeletingBulk}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <>
                  <button 
                    onClick={handleBulkDelete}
                    className="flex items-center gap-3 px-6 py-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-2xl font-bold transition-all border border-red-500/20"
                  >
                    <Trash2 size={18} />
                    Eliminar Selección
                  </button>
                  <button 
                    onClick={() => setSelectedIds([])}
                    className="text-white/40 hover:text-white uppercase text-[10px] font-bold tracking-widest transition-colors"
                  >
                    Cancelar
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Column: Summaries */}
        <div className="space-y-8">
          {panels.map(panel => {
            // Summary cards logic
            let panelMovements = filteredMovements.filter(m => m.categoria === panel.id);
            
            // Custom logic for Ajuste: reset to 0 by filtering old adjustments as requested
            if (panel.id === "Ajuste") {
              panelMovements = panelMovements.filter(m => new Date(m.fecha).getTime() > ADJUSTMENT_RESET_DATE);
            }
            
            // Custom logic for Préstamo: reflect REAL GLOBAL situation (ignore active filters)
            if (panel.id === "Préstamo") {
              panelMovements = movements.filter(m => m.categoria === "Préstamo");
            }

            const totalARS = panelMovements.filter(m => m.moneda === 'ARS').reduce((acc, m) => {
              const val = parseFloat(String(m.monto)) || 0;
              return m.tipo_movimiento === 'Ingreso' ? acc + val : acc - val;
            }, 0);
            const totalUSD = panelMovements.filter(m => m.moneda === 'USD').reduce((acc, m) => {
              const val = parseFloat(String(m.monto)) || 0;
              return m.tipo_movimiento === 'Ingreso' ? acc + val : acc - val;
            }, 0);

            return (
              <div key={panel.id} className="bg-[#1e1e1e] border border-white/5 p-8 rounded-[40px] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className={`font-bold uppercase tracking-[0.2em] text-[10px] ${panel.color}`}>{panel.label}</h3>
                  <MoreHorizontal className="text-white/20" size={16} />
                </div>
                <div className="space-y-2">
                   <div className="flex justify-between items-end">
                      <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest">Total ARS</p>
                      <p className="text-2xl font-mono font-bold text-white">${totalARS.toLocaleString()}</p>
                   </div>
                   <div className="flex justify-between items-end">
                      <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest">Total USD</p>
                      <p className="text-xl font-mono font-bold text-white/60">U$D {totalUSD.toLocaleString()}</p>
                   </div>
                </div>
                <div className="pt-4 border-t border-white/5">
                   <p className="text-[10px] text-white/20 italic">
                      {panelMovements.length} transacciones registradas {startDate || endDate ? "en el rango seleccionado" : "en total"}
                   </p>
                </div>
              </div>
            );
          })}

          {/* Préstamos Panel */}
          <div className="bg-[#1e1e1e] border border-white/5 p-8 rounded-[40px] space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-violet-400">Panel de Préstamos</h3>
              <MoreHorizontal className="text-white/20" size={16} />
            </div>
            
            <div className="space-y-6">
              {loanMembers.map(member => {
                const memberMovements = movements.filter(m => m.categoria === "Préstamo" && (m.descripcion || "").includes(member));
                const debtARS = memberMovements.reduce((acc, m) => {
                  if (m.moneda !== "ARS") return acc;
                  const val = parseFloat(String(m.monto)) || 0;
                  return m.tipo_movimiento === "Egreso" ? acc + val : acc - val;
                }, 0);
                const debtUSD = memberMovements.reduce((acc, m) => {
                  if (m.moneda !== "USD") return acc;
                  const val = parseFloat(String(m.monto)) || 0;
                  return m.tipo_movimiento === "Egreso" ? acc + val : acc - val;
                }, 0);

                return (
                  <div key={member} className="p-4 bg-white/5 rounded-3xl border border-white/5 space-y-3 relative group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-bold">
                        {member.split(' ').map(n => n[0]).join('')}
                      </div>
                      <p className="font-bold text-white text-sm">{member}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Debt ARS */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest">Deuda ARS</p>
                          {isEditingLoan?.member === member && isEditingLoan?.currency === "ARS" ? null : (
                            <button 
                              onClick={() => {
                                setIsEditingLoan({ member, currency: "ARS" });
                                setNewBalanceValue(debtARS.toString());
                              }}
                              className="p-1 hover:bg-white/5 rounded-md text-white/20 hover:text-white transition-colors"
                            >
                              <Edit2 size={10} />
                            </button>
                          )}
                        </div>
                        
                        {isEditingLoan?.member === member && isEditingLoan?.currency === "ARS" ? (
                          <div className="flex items-center gap-1">
                            <input 
                              autoFocus
                              type="number"
                              value={newBalanceValue}
                              onChange={(e) => setNewBalanceValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAdjustLoanDebt();
                                if (e.key === "Escape") setIsEditingLoan(null);
                              }}
                              className="w-full bg-white/10 border border-violet-500/50 rounded-lg px-2 py-1 text-violet-400 font-mono font-bold text-xs outline-none"
                            />
                            <button 
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleAdjustLoanDebt()} 
                              className={`p-1 rounded-md text-white transition-all ${isSubmitting ? 'bg-violet-500/50 cursor-not-allowed' : 'bg-violet-500 hover:bg-violet-600'}`}
                            >
                              <Check size={12} className={isSubmitting ? "animate-pulse" : ""} />
                            </button>
                            <button onClick={() => setIsEditingLoan(null)} className="bg-white/10 p-1 rounded-md text-white/40"><X size={12} /></button>
                          </div>
                        ) : (
                          <p className={`font-mono font-bold ${debtARS > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            ${debtARS.toLocaleString()}
                          </p>
                        )}
                      </div>

                      {/* Debt USD */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest">Deuda USD</p>
                          {isEditingLoan?.member === member && isEditingLoan?.currency === "USD" ? null : (
                            <button 
                              onClick={() => {
                                setIsEditingLoan({ member, currency: "USD" });
                                setNewBalanceValue(debtUSD.toString());
                              }}
                              className="p-1 hover:bg-white/5 rounded-md text-white/20 hover:text-white transition-colors"
                            >
                              <Edit2 size={10} />
                            </button>
                          )}
                        </div>

                        {isEditingLoan?.member === member && isEditingLoan?.currency === "USD" ? (
                          <div className="flex items-center gap-1">
                            <input 
                              autoFocus
                              type="number"
                              value={newBalanceValue}
                              onChange={(e) => setNewBalanceValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAdjustLoanDebt();
                                if (e.key === "Escape") setIsEditingLoan(null);
                              }}
                              className="w-full bg-white/10 border border-violet-500/50 rounded-lg px-2 py-1 text-violet-400 font-mono font-bold text-xs outline-none"
                            />
                            <button 
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleAdjustLoanDebt()} 
                              className={`p-1 rounded-md text-white transition-all ${isSubmitting ? 'bg-violet-500/50 cursor-not-allowed' : 'bg-violet-500 hover:bg-violet-600'}`}
                            >
                              <Check size={12} className={isSubmitting ? "animate-pulse" : ""} />
                            </button>
                            <button onClick={() => setIsEditingLoan(null)} className="bg-white/10 p-1 rounded-md text-white/40"><X size={12} /></button>
                          </div>
                        ) : (
                          <p className={`font-mono font-bold ${debtUSD > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            U$D {debtUSD.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Add Movement Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAdding(false);
                setEditingMovement(null);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#1e1e1e] border border-white/10 rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div>
                  <h3 className="serif text-3xl text-white italic">
                    {editingMovement ? "Editar Movimiento" : "Nuevo Movimiento"}
                  </h3>
                  <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest mt-1">
                    {editingMovement ? "Actualizar registro existente" : "Registrar Ingreso o Egreso"}
                  </p>
                </div>

                <form onSubmit={handleAddMovement} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">
                        {formData.categoria === "Préstamo" ? "Acción de Préstamo" : "Tipo"}
                      </label>
                      <select 
                        value={formData.tipo_movimiento}
                        onChange={(e) => setFormData({...formData, tipo_movimiento: e.target.value as any})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                      >
                        <option value="Ingreso" className="bg-[#1e1e1e]">
                          {formData.categoria === "Préstamo" ? "Devolución (Resta Deuda)" : "Ingreso"}
                        </option>
                        <option value="Egreso" className="bg-[#1e1e1e]">
                          {formData.categoria === "Préstamo" ? "Préstamo (Suma Deuda)" : "Egreso"}
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Categoría</label>
                      <select 
                        value={formData.categoria}
                        onChange={(e) => {
                          const newCat = e.target.value as any;
                          setFormData({
                            ...formData, 
                            categoria: newCat,
                            descripcion: newCat === "Préstamo" ? "Préstamo: Carlos Craca" : "",
                            tipo_movimiento: newCat === "Venta" ? "Ingreso" : "Egreso"
                          });
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                      >
                        <option value="Venta" className="bg-[#1e1e1e]">Ingreso por Venta</option>
                        <option value="Compra de Mercadería" className="bg-[#1e1e1e]">Compra de Mercadería</option>
                        <option value="Varios" className="bg-[#1e1e1e]">Egreso Vario</option>
                        <option value="Fijo" className="bg-[#1e1e1e]">Gasto Fijo</option>
                        <option value="Préstamo" className="bg-[#1e1e1e]">Préstamo (Carlos/Yeimar)</option>
                      </select>
                    </div>
                  </div>

                  {formData.categoria === "Préstamo" ? (
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Miembro</label>
                      <select 
                        required
                        value={formData.descripcion.split(': ')[1] || ""}
                        onChange={(e) => setFormData({...formData, descripcion: `Préstamo: ${e.target.value}`})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                      >
                        <option value="" disabled className="bg-[#1e1e1e]">Seleccionar Miembro</option>
                        {loanMembers.map(m => (
                          <option key={m} value={m} className="bg-[#1e1e1e]">{m}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Descripción</label>
                      <input 
                        type="text"
                        required
                        value={formData.descripcion}
                        onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                        placeholder="Ej: Marketing Redes, Pago Luz..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Monto</label>
                      <input 
                        type="number"
                        required
                        value={formData.monto}
                        onChange={(e) => setFormData({...formData, monto: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Moneda</label>
                      <select 
                        value={formData.moneda}
                        onChange={(e) => setFormData({...formData, moneda: e.target.value as any})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                      >
                        <option value="ARS" className="bg-[#1e1e1e]">ARS ($)</option>
                        <option value="USD" className="bg-[#1e1e1e]">USD (U$D)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Fecha</label>
                    <input 
                      type="date"
                      value={formData.fecha}
                      onChange={(e) => setFormData({...formData, fecha: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                    />
                  </div>

                  <div className="flex flex-col gap-3 pt-4">
                    <div className="flex gap-4">
                      <button 
                        type="button"
                        onClick={() => {
                          setIsAdding(false);
                          setEditingMovement(null);
                        }}
                        className="flex-1 bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 bg-pink-500 hover:bg-pink-600 text-white py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-pink-500/20 transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {editingMovement ? "Actualizar" : "Registrar"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
