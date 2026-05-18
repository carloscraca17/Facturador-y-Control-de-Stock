import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  Plus, 
  Package, 
  Edit, 
  Trash2, 
  Filter, 
  ArrowUpDown, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  Download
} from "lucide-react";
import * as XLSX from "xlsx";
import { useData } from "./DataProvider";

export const Inventory: React.FC = () => {
  const { products, setProducts, productsTotal, fetchProducts, refreshData, token } = useData();
  const [page, setPage] = useState(1);
  const itemsPerPage = 50;
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [sortField, setSortField] = useState<"nombre" | "categoria" | "costo_unitario" | "precio_venta" | "stock_actual" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // New/Edit Product Form State
  const [formData, setFormData] = useState({
    nombre: "",
    sku_barcode: "",
    costo_unitario: 0,
    precio_venta: 0,
    stock_actual: 0,
    stock_minimo: 5,
    categoria: "SKINCARE Y PERFUMERÍA",
    detalles: ""
  });

  // UseEffect for debounced search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      fetchProducts(1, itemsPerPage, searchTerm);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleSort = (field: "nombre" | "categoria" | "costo_unitario" | "precio_venta" | "stock_actual") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="opacity-20" />;
    return sortOrder === "asc" ? <ArrowUpDown size={12} className="text-pink-400" /> : <ArrowUpDown size={12} className="text-pink-400 rotate-180" />;
  };

  // Note: Filtering is handled server-side now for Term, but local for category
  const filteredProducts = products
    .filter(p => !activeCategory || p.categoria === activeCategory)
    .sort((a, b) => {
        if (!sortField) return 0;
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (typeof aVal === "string" && typeof bVal === "string") {
            return sortOrder === "asc" 
                ? aVal.localeCompare(bVal) 
                : bVal.localeCompare(aVal);
        }
        return sortOrder === "asc" 
            ? (aVal as number) - (bVal as number)
            : (bVal as number) - (aVal as number);
    });

  const categories = Array.from(new Set([
    "SKINCARE Y PERFUMERÍA",
    "MAQUILLAJE Y COSMÉTICA",
    "ELECTRÓNICOS",
    "INDUMENTARIA",
    "CALZADO",
    "ACCESORIOS",
    ...products.map(p => p.categoria || "General")
  ]));

  const startEdit = (product: any) => {
    setFormData({
      nombre: product.nombre,
      sku_barcode: product.sku_barcode,
      costo_unitario: product.costo_unitario,
      precio_venta: product.precio_venta,
      stock_actual: product.stock_actual,
      stock_minimo: product.stock_minimo,
      categoria: product.categoria || "General",
      detalles: product.detalles || ""
    });
    setEditingId(product.id);
    setIsAdding(true);
  };

  const resetForm = () => {
    setFormData({
      nombre: "",
      sku_barcode: "",
      costo_unitario: 0,
      precio_venta: 0,
      stock_actual: 0,
      stock_minimo: 5,
      categoria: "SKINCARE Y PERFUMERÍA",
      detalles: ""
    });
    setEditingId(null);
    setIsAdding(false);
  };

  const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
  );

  const cleanCurrency = (val: string) => {
    if (!val) return 0;
    // Remove symbols and handle Spanish format (dots for thousands, comma for decimal)
    // Example: $ 7.640,63 -> 7640.63
    let clean = val.replace(/[^\d,.-]/g, '');
    
    // If there is a comma and a dot, assume dot is thousands separator
    if (clean.includes(',') && clean.includes('.')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
        // If only comma, it's the decimal separator
        clean = clean.replace(',', '.');
    }
    return Number(clean) || 0;
  };

  const parseNumber = (val: any) => {
    if (typeof val === "number") return val;
    if (!val) return 0;
    
    // Convert to string and clean
    let clean = String(val).replace(/[^\d,.+-]/g, '');
    
    // Handle Spanish formatting
    // If there's a comma and it's near the end, it's likely decimal
    // But XLSX usually already gives numbers if possible.
    // However, if it's a string from CSV or similar:
    if (clean.includes(',') && clean.includes('.')) {
      // 1.234,56 -> 1234.56
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
      // 1234,56 -> 1234.56
      clean = clean.replace(',', '.');
    }
    
    const num = Number(clean);
    return isNaN(num) ? 0 : num;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSaving(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          alert("El archivo está vacío.");
          setIsSaving(false);
          return;
        }

        const productsToImport = (data as any[]).map(row => ({
          nombre: row["Nombre"] || row["Producto"] || row["Nombre Producto"],
          sku_barcode: String(row["SKU"] || row["sku"] || row["Codigo"] || ""),
          categoria: row["Categoría"] || row["Categoria"] || "General",
          costo_unitario: parseNumber(row["Costo Unitario"] || row["Costo"]),
          precio_venta: parseNumber(row["Precio Venta"] || row["Precio"]),
          stock_actual: parseNumber(row["Stock Actual"] || row["Stock"]),
          stock_minimo: parseNumber(row["Stock Mínimo"] || row["Minimo"] || 5),
          detalles: row["Detalles"] || row["Detalle"] || "",
          userId: "admin"
        })).filter(p => p.nombre && p.sku_barcode);

        if (productsToImport.length === 0) {
          alert("No se encontraron productos válidos en el archivo. Asegúrate de que las columnas tengan los nombres correctos.");
          setIsSaving(false);
          return;
        }

        const res = await fetch("/api/bulk-import/products", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": token || localStorage.getItem("glow_token") || ""
          },
          body: JSON.stringify({ items: productsToImport })
        });
        
        const result = await res.json();
        
        if (res.ok) {
          setShowImport(false);
          await fetchProducts(1, itemsPerPage);
          await refreshData();
          alert(`Importación finalizada con éxito. Se importaron/actualizaron ${result.count} productos.`);
        } else {
          throw new Error(result.error || "Error en el servidor");
        }
      } catch (err: any) {
        console.error("Error importing products:", err);
        alert(`Error al importar productos: ${err.message}`);
      } finally {
        setIsSaving(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    console.log(`[INVENTORY] handleDelete called for ID: ${id}`);
    
    // First click: set state to confirm
    if (confirmDeleteId !== id) {
        setConfirmDeleteId(id);
        // Reset after 3 seconds if not confirmed
        setTimeout(() => setConfirmDeleteId(null), 3000);
        return;
    }

    // Second click: proceed with deletion
    setConfirmDeleteId(null);
    console.log(`[INVENTORY] Proceeding with deletion for ID: ${id}`);

    // Guardar estado previo para rollback en caso de error
    const previousProducts = [...products];

    // Actualización Optimista: eliminamos de la lista inmediatamente
    setProducts(prev => prev.filter(p => p.id !== id));
    setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));

    try {
      const authHeader = token || localStorage.getItem("glow_token") || "";
      console.log(`[INVENTORY] Sending DELETE request to /api/products/${id} with token: ${authHeader ? 'Exists' : 'MISSING'}`);
      
      const response = await fetch(`/api/products/${id}`, {
        method: "DELETE",
        headers: { 
          "Authorization": authHeader
        }
      });

      console.log(`[INVENTORY] Response status: ${response.status}`);
      if (!response.ok) {
          const err = await response.json();
          console.error("[INVENTORY] Server error:", err);
          throw new Error(err.error || "No se pudo eliminar");
      }

      console.log("[INVENTORY] Delete successful, refreshing data...");
      // Refrescamos los datos globales para asegurar sincronía (stats, etc)
      await refreshData();
    } catch (err: any) {
      console.error("[INVENTORY] Catch error:", err);
      // Rollback del estado en caso de error
      setProducts(previousProducts);
      alert(`No se pudo eliminar el producto: ${err.message}`);
    }
  };

  const [isConfirmingBulk, setIsConfirmingBulk] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    // Si no estamos confirmando aún, pasamos al estado de confirmación
    if (!isConfirmingBulk) {
      console.log("[INVENTORY] Entering bulk delete confirmation mode");
      setIsConfirmingBulk(true);
      return;
    }

    // Si ya estamos confirmando, procedemos
    console.log(`[INVENTORY] Bulk delete executing for ${selectedIds.length} items:`, selectedIds);
    setIsDeletingBulk(true);

    const previousProducts = [...products];
    const previousSelectedIds = [...selectedIds];
    const idsToDelete = [...selectedIds];

    // Optimistic update
    setProducts(prev => prev.filter(p => !idsToDelete.includes(p.id)));

    try {
      const authHeader = token || localStorage.getItem("glow_token") || "";
      console.log(`[INVENTORY] Sending bulk delete request for ${idsToDelete.length} items. Table: products`);
      
      const response = await fetch("/api/bulk-delete/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader
        },
        body: JSON.stringify({ ids: idsToDelete })
      });

      const responseData = await response.json();
      console.log(`[INVENTORY] Bulk delete response:`, responseData);

      if (!response.ok) {
        throw new Error(responseData.error || "Error en el servidor al borrar");
      }

      console.log(`[INVENTORY] Bulk delete successful. Count: ${responseData.count}`);
      
      // Limpiamos selección solo si fue exitoso
      setSelectedIds([]);
      setIsConfirmingBulk(false);
      
      // Refrescamos todos los datos (stats, sales, etc)
      await refreshData();
    } catch (err: any) {
      console.error("[INVENTORY] Bulk delete FATAL error:", err);
      // Rollback
      setProducts(previousProducts);
      alert(`Error al eliminar: ${err.message}`);
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map(p => p.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const url = editingId ? `/api/products/${editingId}` : "/api/products";
      const method = editingId ? "PUT" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token || localStorage.getItem("glow_token") || ""
        },
        body: JSON.stringify({ ...formData, userId: "admin" })
      });

      if (response.ok) {
        setPage(1); // Reset to page 1 to see the new product (sorted by newest)
        await fetchProducts(1, itemsPerPage, searchTerm);
        resetForm();
      } else {
        const errData = await response.json();
        throw new Error(errData.error || "Error al guardar el producto");
      }
    } catch (err: any) {
      console.error("[INVENTORY] handleSubmit error:", err);
      alert(`Error al guardar producto: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const totalPages = Math.ceil(productsTotal / itemsPerPage);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      fetchProducts(newPage, itemsPerPage, searchTerm);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleExportProducts = async () => {
    try {
      // Fetch ALL products for export
      const res = await fetch(`/api/products?page=1&limit=${productsTotal || 2000}`, {
        headers: { "Authorization": localStorage.getItem("glow_token") || "" }
      });
      const data = await res.json();
      const allProducts = data.data || [];

      const exportData = allProducts.map((p: any) => ({
        "Nombre": p.nombre,
        "SKU": p.sku_barcode,
        "Categoría": p.categoria || "General",
        "Costo Unitario": p.costo_unitario,
        "Precio Venta": p.precio_venta,
        "Stock Actual": p.stock_actual,
        "Stock Mínimo": p.stock_minimo,
        "Detalles": p.detalles || "",
        "ID": p.id
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventario");
      XLSX.writeFile(wb, `Inventario_GlowManager_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error("Error exporting products:", err);
      alert("Error al exportar inventario.");
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-10 max-w-7xl mx-auto space-y-8 pb-32 md:pb-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-1">Gestión de Stock</p>
          <h1 className="serif text-4xl md:text-5xl font-light text-white italic">Inventario</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={handleExportProducts}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold hover:bg-emerald-500/20 transition-all font-mono"
          >
            <Download size={16} />
            Exportar XLS
          </button>
          <button 
            onClick={() => setShowImport(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white/5 text-white/60 border border-white/10 rounded-full text-xs font-bold hover:bg-white/10 transition-all font-mono"
          >
            Importar
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-pink-500 text-white rounded-full text-xs font-bold hover:bg-pink-400 transition-all shadow-lg shadow-pink-500/20"
          >
            <Plus size={16} />
            Añadir
          </button>
        </div>
      </header>

      {/* Control Bar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm focus:outline-none focus:border-pink-500 transition-colors"
          />
        </div>
        <div className="flex gap-2">
            <div className="relative group/filter flex-1 lg:flex-none">
                <button 
                  onClick={() => setActiveCategory(null)}
                  className={`w-full lg:w-auto px-6 py-4 rounded-2xl text-xs font-bold border transition-all flex items-center justify-center lg:justify-start gap-2 ${
                    activeCategory 
                      ? "bg-pink-500/10 text-pink-400 border-pink-500/20" 
                      : "bg-white/5 text-white/60 border-white/10"
                  }`}
                >
                    <Filter size={16} />
                    {activeCategory || "Filtros"}
                </button>
                <div className="absolute top-full right-0 mt-2 w-48 glass rounded-2xl opacity-0 invisible group-hover/filter:opacity-100 group-hover/filter:visible transition-all z-20 overflow-hidden shadow-2xl">
                    <button onClick={() => setActiveCategory(null)} className="w-full text-left px-4 py-3 text-[10px] hover:bg-white/5 text-white/60 border-b border-white/5 uppercase tracking-widest font-bold">Todos</button>
                    {categories.map(cat => (
                        <button 
                            key={cat} 
                            onClick={() => setActiveCategory(cat)}
                            className="w-full text-left px-4 py-3 text-[10px] hover:bg-white/5 text-white/60 uppercase tracking-widest font-bold"
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>
        </div>
      </div>

      {/* Product Grid/Table */}
      <div className="glass rounded-[2rem] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[800px]">
            <thead className="bg-white/5 text-white/40 uppercase text-[10px] font-bold tracking-widest border-b border-white/5">
              <tr>
                <th className="px-6 py-5 w-10">
                  <input 
                    type="checkbox" 
                    className="accent-pink-600 w-4 h-4 rounded border-white/10 bg-white/5"
                    checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-5">
                    <button 
                        onClick={() => handleSort("nombre")}
                        className="flex items-center gap-2 hover:text-white transition-colors"
                    >
                        Producto / Detalles
                        {getSortIcon("nombre")}
                    </button>
                </th>
                <th className="px-6 py-5">
                    <button 
                        onClick={() => handleSort("categoria")}
                        className="flex items-center gap-2 hover:text-white transition-colors"
                    >
                        Categoría
                        {getSortIcon("categoria")}
                    </button>
                </th>
                <th className="px-8 py-5 text-right">
                    <button 
                        onClick={() => handleSort("costo_unitario")}
                        className="flex items-center gap-2 hover:text-white transition-colors ml-auto"
                    >
                        Costo
                        {getSortIcon("costo_unitario")}
                    </button>
                </th>
                <th className="px-8 py-5 text-right">
                    <button 
                        onClick={() => handleSort("precio_venta")}
                        className="flex items-center gap-2 hover:text-white transition-colors ml-auto"
                    >
                        Venta
                        {getSortIcon("precio_venta")}
                    </button>
                </th>
                <th className="px-8 py-5 text-center">
                    <button 
                        onClick={() => handleSort("stock_actual")}
                        className="flex items-center gap-2 hover:text-white transition-colors mx-auto"
                    >
                        Stock
                        {getSortIcon("stock_actual")}
                    </button>
                </th>
                <th className="px-6 py-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 text-white/20">
                      <Package size={48} />
                      <p className="italic serif text-lg">No se encontraron productos</p>
                      <button onClick={() => setIsAdding(true)} className="text-pink-400 text-xs uppercase font-bold tracking-widest hover:underline mt-2">Cargar el primero ahora</button>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.map((p) => (
                <tr 
                  key={p.id} 
                  onClick={() => startEdit(p)}
                  className={`hover:bg-white/5 transition-colors group cursor-pointer ${selectedIds.includes(p.id) ? 'bg-pink-500/5 focus-within:bg-pink-500/10' : ''}`}
                >
                  <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      className="accent-pink-600 w-4 h-4 rounded border-white/10 bg-white/5 cursor-pointer"
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggleSelect(p.id)}
                    />
                  </td>
                  <td className="px-6 py-5">
                    <div className="font-semibold text-white group-hover:text-pink-400 transition-colors">{p.nombre}</div>
                    <div className="text-[10px] text-white/30 font-mono tracking-wider mb-1">{p.sku_barcode}</div>
                    {p.detalles && (
                        <div className="text-[10px] text-pink-400/60 italic max-w-xs truncate">{p.detalles}</div>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-white/10">
                        {(p as any).categoria || 'General'}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right text-white/50">${p.costo_unitario.toLocaleString()}</td>
                  <td className="px-6 py-5 text-right font-bold text-white">${p.precio_venta.toLocaleString()}</td>
                  <td className="px-6 py-5 text-center">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${
                        p.stock_actual <= p.stock_minimo 
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20" 
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    }`}>
                        {p.stock_actual}
                        <span className="opacity-40 text-[10px]">/ {p.stock_minimo}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                        <button 
                            onClick={() => startEdit(p)}
                            className="p-2 text-white/30 hover:text-white transition-colors"
                        >
                            <Edit size={16} />
                        </button>
                        <button 
                            onClick={() => handleDelete(p.id)}
                            className={`p-2 transition-all duration-200 rounded-lg ${
                                confirmDeleteId === p.id 
                                ? "bg-red-500 text-white animate-pulse scale-110" 
                                : "text-red-500/40 hover:text-red-500 hover:bg-red-500/10"
                            }`}
                            title={confirmDeleteId === p.id ? "Haz clic para CONFIRMAR" : "Eliminar producto"}
                        >
                            {confirmDeleteId === p.id ? <Trash2 size={16} className="animate-bounce" /> : <Trash2 size={16} />}
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <button 
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className="p-3 bg-white/5 border border-white/10 rounded-xl text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum = page;
              if (page <= 3) pageNum = i + 1;
              else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = page - 2 + i;
              
              if (pageNum < 1 || pageNum > totalPages) return null;

              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${
                    page === pageNum 
                      ? "bg-pink-500 text-white shadow-lg shadow-pink-500/20" 
                      : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button 
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className="p-3 bg-white/5 border border-white/10 rounded-xl text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

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
              <span className="text-xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">{selectedIds.length} productos</span>
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

      {/* Add Product Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass w-full max-w-xl rounded-[2.5rem] overflow-hidden shadow-2xl"
          >
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <h2 className="serif text-3xl font-light italic text-white">{editingId ? 'Editar Producto' : 'Nuevo Producto'}</h2>
              <button onClick={resetForm} className="text-white/30 hover:text-white transition-colors">
                <CloseIcon />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 col-span-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Nombre del Producto</label>
                    <input 
                        type="text" 
                        required
                        value={formData.nombre}
                        onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-pink-500 transition-colors"
                        placeholder="Ej: Esmalte Permanente Nude"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">SKU / Código</label>
                    <input 
                        type="text" 
                        required
                        value={formData.sku_barcode}
                        onChange={(e) => setFormData({...formData, sku_barcode: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-pink-500 transition-colors"
                        placeholder="SKU-001"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Categoría</label>
                    <select 
                        value={formData.categoria}
                        onChange={(e) => setFormData({...formData, categoria: e.target.value})}
                        className="w-full bg-[#1e1e1e] border border-white/10 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-pink-500 transition-colors"
                    >
                        <option value="SKINCARE Y PERFUMERÍA" className="bg-[#1e1e1e] text-white">SKINCARE Y PERFUMERÍA</option>
                        <option value="MAQUILLAJE Y COSMÉTICA" className="bg-[#1e1e1e] text-white">MAQUILLAJE Y COSMÉTICA</option>
                        <option value="ELECTRÓNICOS" className="bg-[#1e1e1e] text-white">ELECTRÓNICOS</option>
                        <option value="INDUMENTARIA" className="bg-[#1e1e1e] text-white">INDUMENTARIA</option>
                        <option value="CALZADO" className="bg-[#1e1e1e] text-white">CALZADO</option>
                        <option value="ACCESORIOS" className="bg-[#1e1e1e] text-white">ACCESORIOS</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Costo Unitario ($)</label>
                    <input 
                        type="number" 
                        required
                        value={formData.costo_unitario}
                        onChange={(e) => setFormData({...formData, costo_unitario: Number(e.target.value)})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-pink-500 transition-colors"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Precio Venta ($)</label>
                    <input 
                        type="number" 
                        required
                        value={formData.precio_venta}
                        onChange={(e) => setFormData({...formData, precio_venta: Number(e.target.value)})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-pink-500 transition-colors"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Stock Inicial</label>
                    <input 
                        type="number" 
                        required
                        value={formData.stock_actual}
                        onChange={(e) => setFormData({...formData, stock_actual: Number(e.target.value)})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-pink-500 transition-colors"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Stock Mínimo</label>
                    <input 
                        type="number" 
                        required
                        value={formData.stock_minimo}
                        onChange={(e) => setFormData({...formData, stock_minimo: Number(e.target.value)})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-pink-500 transition-colors"
                    />
                </div>
                <div className="space-y-2 col-span-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Detalles (Talle / Color / etc)</label>
                    <input 
                        type="text" 
                        value={formData.detalles}
                        onChange={(e) => setFormData({...formData, detalles: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-pink-500 transition-colors"
                        placeholder="Ej: Negro / Talle M"
                    />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={resetForm}
                    className="flex-1 py-4 bg-white/5 text-white/60 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all border border-white/10"
                  >
                      Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 py-4 bg-pink-500 text-white rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-pink-400 transition-all shadow-lg shadow-pink-500/20 flex items-center justify-center gap-2"
                  >
                      {isSaving ? <Loader2 className="animate-spin" size={18} /> : (editingId ? <Edit size={18} /> : <Plus size={18} />)}
                      {editingId ? 'Actualizar Producto' : 'Guardar Producto'}
                  </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl"
          >
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <h2 className="serif text-3xl font-light italic text-white">Importar Catálogo</h2>
              <button onClick={() => setShowImport(false)} className="text-white/30 hover:text-white transition-colors"><CloseIcon /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="bg-pink-500/10 border border-pink-500/20 p-6 rounded-3xl text-center space-y-4">
                <p className="text-white/60 text-sm">Selecciona un archivo Excel (.xlsx o .xls) con las columnas: <br/><strong>Nombre, SKU, Categoría, Costo, Precio, Stock, Min, Detalle</strong></p>
                <input 
                  type="file" 
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  disabled={isSaving}
                  className="hidden"
                  id="excel-upload"
                />
                <label 
                  htmlFor="excel-upload"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-pink-500 text-white rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-pink-400 transition-all cursor-pointer shadow-lg shadow-pink-500/20"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                  {isSaving ? "Procesando..." : "Seleccionar Archivo"}
                </label>
              </div>
              <div className="flex gap-4">
                  <button 
                    onClick={() => setShowImport(false)}
                    className="flex-1 py-4 bg-white/5 text-white/60 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-white/10"
                  >
                    Cerrar
                  </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const CloseIcon = (props: any) => (
    <svg 
        {...props} 
        xmlns="http://www.w3.org/2000/svg" 
        width="24" 
        height="24" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
    >
        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
);
