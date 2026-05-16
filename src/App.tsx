import React, { useState } from "react";
import { DataProvider, useData } from "./components/DataProvider";
import { Dashboard } from "./components/Dashboard";
import { Inventory } from "./components/Inventory";
import { Financials } from "./components/Financials";
import { Sidebar } from "./components/Sidebar";
import { BusinessChat } from "./components/BusinessChat";
import { LogIn, Sparkles, Loader2, User, Lock, AlertCircle } from "lucide-react";
import { motion } from "motion/react";

const MainContent: React.FC = () => {
  const { user, loading, login } = useData();
  const [currentPage, setCurrentPage] = useState<"dashboard" | "inventory" | "financials">("dashboard");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoggingIn(true);
    
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const { token: newToken } = await response.json();
        login(newToken);
      } else {
        const data = await response.json();
        setError(data.error || "Credenciales inválidas");
      }
    } catch (err: any) {
      console.error("Login Error:", err);
      setError("Error de conexión con el servidor.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading || isLoggingIn) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-[#0c0c0e]">
        <Loader2 className="animate-spin text-pink-500" size={48} />
        <p className="serif text-xl italic text-slate-400">Preparando tu estudio...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0c0c0e] flex items-center justify-center p-6 relative overflow-hidden">
        {/* Background Mesh Gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-600/15 rounded-full blur-[140px]"></div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full glass p-10 rounded-[3rem] shadow-2xl relative z-10"
        >
          <div className="w-20 h-20 bg-gradient-to-br from-pink-500 to-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-pink-500/20">
             <Sparkles className="text-white" size={40} />
          </div>
          <h1 className="serif text-5xl font-light text-white mb-2 italic text-center">GlowManager <span className="text-pink-400">AI</span></h1>
          <p className="text-slate-400 mb-8 text-sm leading-relaxed px-4 text-center">
            Gestión inteligente de stock y análisis financiero.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input 
                type="text" 
                placeholder="Usuario" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-pink-500 transition-colors"
                required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input 
                type="password" 
                placeholder="Contraseña" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-pink-500 transition-colors"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold bg-rose-400/10 p-3 rounded-xl border border-rose-400/20">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <button 
              type="submit"
              className="w-full flex items-center justify-center gap-3 py-4 bg-pink-500 text-white rounded-full font-semibold hover:bg-pink-400 transition-all shadow-lg shadow-pink-500/20 active:scale-95"
            >
              <LogIn size={20} />
              Ingresar
            </button>
          </form>
          
          <p className="mt-8 text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold text-center">Modo de Acceso Administrativo</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0c0e] relative overflow-hidden">
      {/* Background Mesh Gradients */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-600/15 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="fixed top-[20%] right-[10%] w-[30%] h-[30%] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="relative z-10">
        <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
        <main className="pl-0 md:pl-24 transition-all duration-300">
          {currentPage === "dashboard" && <Dashboard onPageChange={setCurrentPage} />}
          {currentPage === "inventory" && <Inventory />}
          {currentPage === "financials" && <Financials />}
        </main>
      </div>
      <BusinessChat />
    </div>
  );
};

export default function App() {
  return (
    <DataProvider>
      <MainContent />
    </DataProvider>
  );
}
