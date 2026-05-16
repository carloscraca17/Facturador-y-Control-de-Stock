import React from "react";
import { LayoutDashboard, Box, Wallet, LogOut } from "lucide-react";
import { motion } from "motion/react";
import { useData } from "./DataProvider";

interface SidebarProps {
  currentPage: "dashboard" | "inventory" | "financials";
  onPageChange: (page: "dashboard" | "inventory" | "financials") => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onPageChange }) => {
  const { logout } = useData();

  const menuItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "Panel" },
    { id: "inventory", icon: Box, label: "Inventario" },
    { id: "financials", icon: Wallet, label: "Finanzas" },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className="fixed left-0 top-0 bottom-0 w-24 glass border-r border-white/5 z-50 hidden md:flex flex-col items-center py-10 gap-8">
        <div className="w-12 h-12 bg-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/20 mb-4">
          <span className="text-white font-bold text-xl italic">G</span>
        </div>

        <div className="flex-1 flex flex-col gap-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id as any)}
              className={`group relative p-4 rounded-2xl transition-all ${
                currentPage === item.id 
                  ? "bg-pink-500 text-white shadow-lg shadow-pink-500/20" 
                  : "text-white/40 hover:bg-white/5 hover:text-white"
              }`}
              title={item.label}
            >
              <item.icon size={24} />
              {currentPage === item.id && (
                <motion.div 
                  layoutId="activeTabDesktop"
                  className="absolute -left-12 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-pink-500 rounded-r-full shadow-[0_0_15px_rgba(236,72,153,0.5)]"
                />
              )}
            </button>
          ))}
        </div>

        <button 
          onClick={() => logout()}
          className="p-4 text-white/20 hover:text-rose-400 transition-colors"
          title="Salir"
        >
          <LogOut size={24} />
        </button>
      </nav>

      {/* Mobile Bottom Bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 glass border-t border-white/5 z-50 flex md:hidden items-center justify-around px-6">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onPageChange(item.id as any)}
            className={`relative p-3 rounded-xl transition-all flex flex-col items-center gap-1 ${
              currentPage === item.id 
                ? "text-pink-500" 
                : "text-white/40"
            }`}
          >
            <item.icon size={22} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
            {currentPage === item.id && (
              <motion.div 
                layoutId="activeTabMobile"
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-pink-500 rounded-full shadow-[0_0_10px_rgba(236,72,153,0.5)]"
              />
            )}
          </button>
        ))}
        <button 
          onClick={() => logout()}
          className="p-3 text-white/20 flex flex-col items-center gap-1"
        >
          <LogOut size={22} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Salir</span>
        </button>
      </nav>
    </>
  );
};
