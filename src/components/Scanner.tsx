import React, { useState } from "react";
import BarcodeScannerComponent from "react-qr-barcode-scanner";
import { motion } from "motion/react";
import { X, Package, Search, Loader2, Keyboard, Camera, Check } from "lucide-react";
import { useData } from "./DataProvider";
import { apiFetch as fetch } from "../lib/api";

interface ScannerProps {
  onClose: () => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onClose }) => {
  const { refreshData, products: globalProducts, token } = useData();
  const [data, setData] = useState<string>("Buscando...");
  const [scanning, setScanning] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [localProducts, setLocalProducts] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [mode, setMode] = useState<"scanning" | "manual">("scanning");
  const [manualData, setManualData] = useState({
    product_id: "",
    ingreso_bruto: "",
    canal_venta: "Local",
    estado_arca: "Pendiente"
  });

  const [extraData, setExtraData] = useState({
    cliente_nombre: "",
    cliente_apellido: "",
    descuento: "0",
    pagado: true,
    moneda: "ARS" as "ARS" | "USD",
    detalles_venta: "",
    pago_parcial: "0",
    estado_entrega: "Pendiente" as "Pendiente" | "Entregado",
    canal_venta: "Local" as "Local" | "MercadoLibre" | "Web"
  });
  
  const searchProducts = async (term: string) => {
    if (!token) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/products?page=1&limit=20&search=${encodeURIComponent(term)}`, {
        headers: { "Authorization": token }
      });
      if (res.ok) {
        const result = await res.json();
        setLocalProducts(result.data);
      }
    } catch (err) {
      console.error("Error searching products in scanner:", err);
    } finally {
      setIsSearching(false);
    }
  };

  React.useEffect(() => {
    if (mode === "manual" && productSearch.length >= 2) {
      const delayDebounceFn = setTimeout(() => {
        searchProducts(productSearch);
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } else if (mode === "manual" && productSearch.length === 0) {
      setLocalProducts(globalProducts.slice(0, 20));
    }
  }, [productSearch, mode, globalProducts]);

  const filteredProducts = productSearch.length >= 2 ? localProducts : globalProducts.slice(0, 50);

  const foundProduct = mode === "scanning" 
    ? globalProducts.find(p => p.sku_barcode === data)
    : globalProducts.find(p => p.id === manualData.product_id) || localProducts.find(p => p.id === manualData.product_id);

  const handleRegister = async () => {
    if (mode === "scanning" && !foundProduct) {
        alert("Primero selecciona o simula un producto válido.");
        return;
    }
    if (mode === "manual" && !manualData.product_id) {
        alert("Selecciona un producto.");
        return;
    }
    
    setIsRegistering(true);
    const productId = mode === "scanning" ? foundProduct?.id : manualData.product_id;
    
    if (!productId) {
        alert("Error: No se pudo identificar el producto.");
        setIsRegistering(false);
        return;
    }

    const bruto = mode === "scanning" ? (foundProduct?.precio_venta || 0) : (Number(manualData.ingreso_bruto) || foundProduct?.precio_venta || 0);
    const desc = Number(extraData.descuento) || 0;
    const finalBruto = bruto - desc;
    const neto = finalBruto - (foundProduct?.costo_unitario || 0);

    try {
      const payload = {
        canal_venta: extraData.canal_venta || "Local",
        product_id: productId,
        ingreso_bruto: finalBruto,
        ingreso_neto: neto,
        descuento: desc,
        cliente_nombre: extraData.cliente_nombre,
        cliente_apellido: extraData.cliente_apellido,
        pagado: extraData.pagado,
        estado_arca: mode === "scanning" ? "Pendiente" : manualData.estado_arca,
        moneda: extraData.moneda,
        detalles_venta: extraData.detalles_venta,
        pago_parcial: extraData.pagado ? finalBruto : (Number(extraData.pago_parcial) || 0),
        estado_entrega: extraData.estado_entrega,
        userId: "admin"
      };

      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": localStorage.getItem("glow_token") || ""
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        await refreshData();
        onClose();
      } else {
        const errorData = await response.json();
        const errorMsg = errorData.error || response.statusText;
        const details = errorData.details ? `\nDetalles: ${errorData.details}` : '';
        alert(`Error al registrar venta: ${errorMsg}${details}`);
      }
    } catch (err) {
      console.error("Error registering sale:", err);
      alert("Error de conexión al registrar la venta.");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleScan = (err: any, result: any) => {
    if (result) {
      setData(result.text);
      setScanning(false);
      const exists = globalProducts.some(p => p.sku_barcode === result.text);
      setNotFound(!exists);
    }
  };

  const simulateScan = () => {
    // Pick a random product from inventory if exists, otherwise a fake one
    if (globalProducts.length > 0) {
        const randomProd = globalProducts[Math.floor(Math.random() * globalProducts.length)];
        setData(randomProd.sku_barcode);
    } else {
        setData("7791234567890"); 
    }
    setScanning(false);
    setNotFound(globalProducts.length === 0);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl relative"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-white/5 rounded-full text-white/40 z-10 hover:text-white transition-colors">
          <X size={20} />
        </button>

        <div className="p-8 text-center border-b border-white/5 relative">
          <div className="flex bg-white/5 p-1 rounded-xl w-fit mx-auto mb-4 border border-white/5">
             <button 
                onClick={() => setMode("scanning")}
                className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${
                    mode === "scanning" ? "bg-pink-500 text-white shadow-lg shadow-pink-500/20" : "text-white/40 hover:text-white"
                }`}
             >
                <Camera size={14} />
                Escáner
             </button>
             <button 
                onClick={() => setMode("manual")}
                className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${
                    mode === "manual" ? "bg-pink-500 text-white shadow-lg shadow-pink-500/20" : "text-white/40 hover:text-white"
                }`}
             >
                <Keyboard size={14} />
                Manual
             </button>
          </div>
          <h2 className="serif text-3xl font-light italic mb-1 text-white">
            {mode === "scanning" ? "Nueva Venta" : "Carga Manual"}
          </h2>
          <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold">Registro en Tiempo Real</p>
        </div>

        <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
            {mode === "scanning" ? (
                <div className="aspect-square bg-black/20 rounded-3xl border-2 border-dashed border-white/10 overflow-hidden relative flex flex-col items-center justify-center mb-6">
                    {scanning ? (
                        <>
                            <BarcodeScannerComponent
                                width="100%"
                                height="100%"
                                onUpdate={handleScan}
                            />
                            <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none" />
                            <motion.div 
                                animate={{ y: [0, 200, 0] }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                className="absolute top-0 left-0 w-full h-0.5 bg-pink-500 shadow-[0_0_10px_#ec4899]" 
                            />
                        </>
                    ) : (
                        <div className="text-center space-y-4">
                            <div className="w-20 h-20 bg-pink-500/20 text-pink-400 rounded-full flex items-center justify-center mx-auto border border-pink-500/20">
                                <Package size={40} />
                            </div>
                            {foundProduct ? (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl">
                                    <p className="text-emerald-400 font-bold">{foundProduct.nombre}</p>
                                    <p className="text-[10px] text-emerald-400/60 uppercase tracking-widest font-mono">${foundProduct.precio_venta}</p>
                                </div>
                            ) : notFound && (
                                <div className="bg-rose-500/10 border border-rose-400/20 p-3 rounded-2xl">
                                    <p className="text-rose-400 text-xs font-bold">Producto No Encontrado</p>
                                </div>
                            )}
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-1">SKU Detectado</p>
                                <p className="text-2xl font-mono font-bold text-white tracking-wider">{data}</p>
                            </div>
                            <button 
                                onClick={() => setScanning(true)} 
                                className="text-xs font-bold text-pink-400 uppercase tracking-widest hover:underline"
                            >
                                Reintentar Escaneo
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-5 mb-6">
                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Buscar Producto</label>
                        <div className="relative mb-3">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                            <input 
                                type="text"
                                placeholder="Nombre o SKU..."
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                            />
                        </div>
                        <select 
                            value={manualData.product_id}
                            onChange={(e) => {
                                const prod = (productSearch.length >= 2 ? localProducts : globalProducts).find(p => p.id === e.target.value);
                                setManualData({...manualData, product_id: e.target.value, ingreso_bruto: prod?.precio_venta.toString() || ""});
                            }}
                            className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                        >
                            <option value="" className="bg-[#1e1e1e] text-white">{productSearch ? `Resultados (${filteredProducts.length})` : 'Seleccionar Producto...'}</option>
                            {(productSearch ? filteredProducts : globalProducts.slice(0, 50)).map(p => (
                                <option key={p.id} value={p.id} className="bg-[#1e1e1e] text-white">{p.nombre} ({p.sku_barcode})</option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Monto Base</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">$</span>
                                <input 
                                    type="number"
                                    value={manualData.ingreso_bruto}
                                    onChange={(e) => setManualData({...manualData, ingreso_bruto: e.target.value})}
                                    placeholder="0"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {foundProduct && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6 pt-6 border-t border-white/5"
                >
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Nombre Cliente</label>
                            <input 
                                type="text"
                                value={extraData.cliente_nombre}
                                onChange={(e) => setExtraData({...extraData, cliente_nombre: e.target.value})}
                                placeholder="Nombre"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Apellido Cliente</label>
                            <input 
                                type="text"
                                value={extraData.cliente_apellido}
                                onChange={(e) => setExtraData({...extraData, cliente_apellido: e.target.value})}
                                placeholder="Apellido"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Descuento ($)</label>
                            <input 
                                type="number"
                                value={extraData.descuento}
                                onChange={(e) => setExtraData({...extraData, descuento: e.target.value})}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm font-bold text-rose-400"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">¿Pagado ahora?</label>
                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 h-[46px]">
                                <button 
                                    onClick={() => setExtraData({...extraData, pagado: true})}
                                    className={`flex-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${extraData.pagado ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-white/40 hover:text-white'}`}
                                >
                                    Sí
                                </button>
                                <button 
                                    onClick={() => setExtraData({...extraData, pagado: false})}
                                    className={`flex-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${!extraData.pagado ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-white/40 hover:text-white'}`}
                                >
                                    No
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Moneda</label>
                            <select 
                                value={extraData.moneda}
                                onChange={(e) => setExtraData({...extraData, moneda: e.target.value as any})}
                                className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                            >
                                <option value="ARS" className="bg-[#1e1e1e] text-white">ARS ($)</option>
                                <option value="USD" className="bg-[#1e1e1e] text-white">USD (U$D)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Pago Inicial/Parcial ($)</label>
                            <input 
                                type="number"
                                value={extraData.pagado ? (((mode === "scanning" ? foundProduct.precio_venta : Number(manualData.ingreso_bruto) || foundProduct.precio_venta) - (Number(extraData.descuento) || 0))) : extraData.pago_parcial}
                                disabled={extraData.pagado}
                                onChange={(e) => setExtraData({...extraData, pago_parcial: e.target.value})}
                                placeholder="0"
                                className={`w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm ${extraData.pagado ? 'opacity-50' : ''}`}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Comentarios (Talle/Color/Tono)</label>
                        <input 
                            type="text"
                            value={extraData.detalles_venta}
                            onChange={(e) => setExtraData({...extraData, detalles_venta: e.target.value})}
                            placeholder="Ej: Talle M, Rojo, Tono 02"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-pink-500 outline-none text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Entregado</label>
                            <button 
                                onClick={() => setExtraData({...extraData, estado_entrega: extraData.estado_entrega === "Entregado" ? "Pendiente" : "Entregado"})}
                                className={`w-full h-[46px] rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${extraData.estado_entrega === "Entregado" ? 'bg-emerald-600 text-white border-emerald-700 shadow-lg shadow-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-400'}`}
                            >
                                {extraData.estado_entrega === "Entregado" ? "ENTREGADO" : "PENDIENTE"}
                            </button>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Canal</label>
                            <select 
                                value={extraData.canal_venta}
                                onChange={(e) => setExtraData({...extraData, canal_venta: e.target.value as any})}
                                className="w-full h-[46px] bg-[#1e1e1e] border border-white/10 rounded-xl px-4 text-white focus:border-pink-500 outline-none text-xs font-bold"
                            >
                                <option value="Local">Local</option>
                                <option value="Web">Web</option>
                                <option value="MercadoLibre">MercadoLibre</option>
                            </select>
                        </div>
                    </div>

                    <div className="p-4 bg-pink-500/10 border border-pink-500/20 rounded-2xl flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-[100px]">
                            <p className="text-[10px] text-pink-400/60 uppercase font-bold tracking-widest mb-1">Monto Final</p>
                            <p className="text-white font-mono font-bold text-xl">
                                ${((mode === "scanning" ? foundProduct.precio_venta : Number(manualData.ingreso_bruto) || foundProduct.precio_venta) - (Number(extraData.descuento) || 0)).toLocaleString()}
                            </p>
                        </div>
                        {!extraData.pagado && (
                            <div className="min-w-[100px] border-l border-white/10 pl-4">
                                <p className="text-[10px] text-amber-400/60 uppercase font-bold tracking-widest mb-1">Saldo Pendiente</p>
                                <p className="text-amber-400 font-mono font-bold text-xl">
                                    ${(((mode === "scanning" ? foundProduct.precio_venta : Number(manualData.ingreso_bruto) || foundProduct.precio_venta) - (Number(extraData.descuento) || 0)) - (Number(extraData.pago_parcial) || 0)).toLocaleString()}
                                </p>
                            </div>
                        )}
                        <div className="text-right min-w-[100px]">
                            <p className="text-[10px] text-pink-400/60 uppercase font-bold tracking-widest mb-1">Neto Estimado</p>
                            <p className="text-emerald-400 font-mono font-bold">
                                ${((mode === "scanning" ? foundProduct.precio_venta : Number(manualData.ingreso_bruto) || foundProduct.precio_venta) - (Number(extraData.descuento) || 0) - foundProduct.costo_unitario).toLocaleString()}
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}

            <div className="flex gap-4 pt-4">
                {mode === "scanning" && (
                    <button 
                        onClick={simulateScan}
                        className="flex-1 py-4 bg-white/5 text-white/60 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2 border border-white/10"
                    >
                        <Search size={18} />
                        Simular
                    </button>
                )}
                <button 
                    disabled={(mode === "scanning" && scanning) || isRegistering || (mode === "manual" && !manualData.product_id)}
                    onClick={handleRegister}
                    className="flex-1 py-4 bg-pink-500 text-white rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-pink-400 transition-all shadow-lg shadow-pink-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {isRegistering ? <Loader2 className="animate-spin" size={16} /> : (
                        <>
                            <Check size={18} />
                            Registrar Venta
                        </>
                    )}
                </button>
            </div>
        </div>
      </motion.div>
    </div>
  );
};
