import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Send, X, Bot, Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useData } from "./DataProvider";

export const BusinessChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
    { role: "assistant", text: "¡Hola! Soy tu asistente de **GlowManager AI**. ¿En qué puedo ayudarte con el análisis de tu negocio hoy?" }
  ]);
  const [loading, setLoading] = useState(false);
  const { stats, products, sales, expenses, token } = useData();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const businessSnapshot = {
        stats,
        productsCount: products.length,
        salesCount: sales.length,
        lowStockItems: products.filter(p => p.stock_actual <= p.stock_minimo).map(p => ({ nombre: p.nombre, stock: p.stock_actual })),
        recentSales: sales.slice(0, 5).map(s => ({ m: s.ingreso_neto, canal: s.canal_venta })),
        totalExpenses: expenses.reduce((acc, e) => acc + e.monto, 0)
      };

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token || ""
        },
        body: JSON.stringify({
          message: userMsg,
          history: messages,
          businessSnapshot
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || `Error del servidor (status: ${response.status})`);
      }

      const result = await response.json();
      if (!result.text) {
        throw new Error("No se obtuvo respuesta del analista.");
      }

      setMessages(prev => [...prev, { role: "assistant", text: result.text }]);
    } catch (error: any) {
      console.error("Gemini Error:", error);
      let errorMsg = error.message || "Lo siento, hubo un error al procesar tu consulta.";
      if (errorMsg.includes("La clave de API de Gemini")) {
        errorMsg = "La clave de API de Gemini no está configurada o no es válida. Por favor, revísala en el panel de **Settings > Secrets**.";
      }
      setMessages(prev => [...prev, { role: "assistant", text: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.button
        drag
        dragConstraints={{ left: -window.innerWidth + 80, right: 0, top: -window.innerHeight + 80, bottom: 0 }}
        dragElastic={0.1}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-6 w-16 h-16 bg-pink-500 text-white rounded-full flex items-center justify-center shadow-2xl z-[100] border border-white/20 shadow-pink-500/20 cursor-grab active:cursor-grabbing"
      >
        <div className="relative pointer-events-none">
            <MessageSquare size={28} />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-400 rounded-full border-2 border-slate-900 animate-pulse" />
        </div>
      </motion.button>

      {/* Chat Sidebar Overlay/Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[105]"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full sm:w-[500px] glass z-[110] flex flex-col border-l border-white/10 overflow-hidden shadow-[-20px_0_40px_rgba(0,0,0,0.4)]"
            >
              {/* Header */}
              <div className="p-6 bg-white/5 text-white flex items-center justify-between relative overflow-hidden border-b border-white/10">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/20 rounded-full blur-3xl -mr-10 -mt-10" />
                  <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-pink-500/20">
                          <Bot size={24} />
                      </div>
                      <div>
                          <h3 className="serif text-xl font-medium tracking-tight italic">Estratega AI</h3>
                          <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-bold">Análisis Financiero Pro</p>
                      </div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                    }} 
                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white relative z-[120] cursor-pointer"
                  >
                      <X size={20} />
                  </button>
              </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-3xl text-sm ${
                    m.role === 'user' 
                      ? 'bg-pink-600 text-white rounded-tr-none' 
                      : 'bg-white/5 text-white italic shadow-sm border border-white/10 rounded-tl-none'
                  }`}>
                    <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown>{m.text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                   <div className="bg-white/5 p-4 rounded-3xl shadow-sm border border-white/10 flex items-center gap-3 italic text-white/40 text-sm">
                      <Loader2 size={16} className="animate-spin text-pink-500" />
                      Analizando tendencias...
                   </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6 bg-black/20 border-t border-white/10">
                <div className="flex items-center gap-2 bg-white/5 p-2 rounded-2xl border border-white/10 focus-within:border-pink-500/50 transition-colors">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Consultar al analista..."
                        className="flex-1 px-3 py-2 bg-transparent border-none focus:outline-none text-sm text-white placeholder:text-white/20"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className="p-3 bg-pink-500 text-white rounded-xl hover:bg-pink-400 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-pink-500/20"
                    >
                        <Send size={18} />
                    </button>
                </div>
                <p className="mt-4 text-[10px] text-center text-white/20 uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2">
                    <Sparkles size={10} className="text-pink-400" />
                    Powered by Gemini 3 Flash
                </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  );
};
