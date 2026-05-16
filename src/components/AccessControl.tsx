import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Users, UserPlus, Shield, Lock, Trash2, Edit3, Check, X, AlertCircle } from "lucide-react";
import { AppUser } from "../types";

export function AccessControl() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    role: "user" as "admin" | "user",
    permissions: ["dashboard"] as string[]
  });

  const availablePermissions = [
    { id: "dashboard", label: "Panel Principal" },
    { id: "inventory", label: "Inventario" },
    { id: "financials", label: "Finanzas" },
    { id: "access", label: "Control de Acceso" }
  ];

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/users", {
        headers: { "Authorization": "glow-manager-session-true" }
      });
      
      const contentType = res.headers.get("content-type");
      if (!res.ok) {
        if (contentType && contentType.includes("application/json")) {
            const errorData = await res.json();
            throw new Error(errorData.error || `Error ${res.status}: Fallo al cargar usuarios`);
        } else {
            const textError = await res.text();
            console.error("Non-JSON Server Error:", textError);
            throw new Error(`Error ${res.status} del Servidor: ${textError.slice(0, 100)}...`);
        }
      }
      
      if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setUsers(data);
      } else {
          const text = await res.text();
          console.error("Received non-JSON response:", text);
          throw new Error("El servidor no devolvió JSON válido. Posible error de configuración en Vercel.");
      }
    } catch (err: any) {
      console.error("Fetch Users Error:", err);
      let msg = err.message;
      if (msg.includes("app_users") || msg.includes("schema cache")) {
        msg = "Falta la tabla 'app_users' en Supabase. Por favor, ejecuta el script SQL desde el botón de ayuda abajo.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleTogglePermission = (permId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter(p => p !== permId)
        : [...prev.permissions, permId]
    }));
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editUser ? `/api/users/${editUser.id}` : "/api/users";
      const method = editUser ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": "glow-manager-session-true"
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) throw new Error("Error al guardar usuario");
      
      await fetchUsers();
      setIsAddingUser(false);
      setEditUser(null);
      setFormData({ username: "", password: "", role: "user", permissions: ["dashboard"] });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este usuario?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        headers: { "Authorization": "glow-manager-session-true" }
      });
      if (!res.ok) throw new Error("Error al eliminar usuario");
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEditClick = (user: AppUser) => {
    setEditUser(user);
    setFormData({
      username: user.username,
      password: "", // Don't show password
      role: user.role,
      permissions: user.permissions
    });
    setIsAddingUser(true);
  };

  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-10 max-w-5xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="serif text-4xl text-white italic">Acceso</h1>
          <p className="text-white/40 text-sm mt-1">Gestión de usuarios y permisos del sistema</p>
        </div>
        {!isAddingUser && (
          <button 
            onClick={() => setIsAddingUser(true)}
            className="flex items-center gap-2 bg-pink-500 hover:bg-pink-600 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-pink-500/20"
          >
            <UserPlus size={18} />
            Nuevo Usuario
          </button>
        )}
      </header>

      {error && (
        <div className="space-y-4">
          <div className="bg-rose-500/10 border border-rose-500/20 p-6 rounded-2xl flex flex-col gap-4 text-rose-400">
            <div className="flex items-center gap-3 text-sm">
              <AlertCircle size={18} />
              <p className="font-bold">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto opacity-50 hover:opacity-100 transition-opacity"><X size={14}/></button>
            </div>
            
            {(error.includes("app_users") || error.includes("schema cache")) && (
              <div className="bg-black/20 p-4 rounded-xl space-y-3">
                <p className="text-[11px] text-white/60 leading-relaxed">
                  Para activar esta sección, copia el siguiente comando SQL y ejecútalo en el <b>SQL Editor</b> de tu panel de Supabase:
                </p>
                <div className="bg-black/40 p-3 rounded-lg font-mono text-[9px] text-emerald-400 select-all border border-white/5 break-all">
                  CREATE TABLE app_users ( id UUID DEFAULT gen_random_uuid() PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', permissions JSONB DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW() );
                  ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
                  CREATE POLICY "Allow all" ON app_users FOR ALL USING (true) WITH CHECK (true);
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`CREATE TABLE app_users ( id UUID DEFAULT gen_random_uuid() PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', permissions JSONB DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW() ); ALTER TABLE app_users ENABLE ROW LEVEL SECURITY; CREATE POLICY "Allow all" ON app_users FOR ALL USING (true) WITH CHECK (true);`);
                    alert("¡Copiado al portapapeles!");
                  }}
                  className="w-full py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500/30 transition-all border border-emerald-500/20"
                >
                  Copiar Código SQL
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isAddingUser ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-8 rounded-3xl border border-white/10"
        >
          <div className="flex items-center gap-2 mb-8 text-pink-400">
            {editUser ? <Edit3 size={20} /> : <UserPlus size={20} />}
            <h2 className="serif text-2xl italic text-white">{editUser ? "Editar Usuario" : "Nuevo Usuario"}</h2>
          </div>

          <form onSubmit={handleSaveUser} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] uppercase font-bold text-white/30 tracking-widest mb-2 ml-1">Usuario</label>
                <input 
                  type="text"
                  required
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white focus:border-pink-500 outline-none transition-all placeholder:text-white/10"
                  placeholder="Ej: carla_ventas"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-white/30 tracking-widest mb-2 ml-1">Contraseña</label>
                <input 
                  type="password"
                  required={!editUser}
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white focus:border-pink-500 outline-none transition-all placeholder:text-white/10"
                  placeholder={editUser ? "Dejar en blanco para no cambiar" : "••••••••"}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-white/30 tracking-widest mb-2 ml-1">Rol</label>
                <select 
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as any})}
                  className="w-full bg-[#1a1a1a] border border-white/10 rounded-2xl px-4 py-3 text-white focus:border-pink-500 outline-none transition-all appearance-none"
                >
                  <option value="user">Usuario Estándar</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>

            <div className="space-y-6">
              <label className="block text-[10px] uppercase font-bold text-white/30 tracking-widest ml-1">Permisos Especiales</label>
              <div className="grid grid-cols-1 gap-3">
                {availablePermissions.map(perm => (
                  <button
                    key={perm.id}
                    type="button"
                    disabled={formData.role === "admin"}
                    onClick={() => handleTogglePermission(perm.id)}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      formData.role === "admin" || formData.permissions.includes(perm.id)
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-white/5 border-white/5 text-white/40 hover:border-white/10"
                    }`}
                  >
                    <span className="text-xs font-semibold">{perm.label}</span>
                    {formData.role === "admin" || formData.permissions.includes(perm.id) ? <Check size={16} /> : <div className="w-4 h-4 rounded-full border border-white/10" />}
                  </button>
                ))}
              </div>
              {formData.role === "admin" && (
                <p className="text-[10px] text-emerald-500 font-medium tracking-tight bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/10 italic">
                  Los administradores tienen acceso total a todas las secciones.
                </p>
              )}
            </div>

            <div className="md:col-span-2 flex items-center justify-end gap-4 pt-4 border-t border-white/5">
              <button 
                type="button"
                onClick={() => { setIsAddingUser(false); setEditUser(null); }}
                className="px-6 py-3 rounded-2xl text-white/40 hover:text-white font-bold transition-all"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="bg-pink-500 hover:bg-pink-600 text-white px-10 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-pink-500/20"
              >
                {editUser ? "Guardar Cambios" : "Crear Usuario"}
              </button>
            </div>
          </form>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {loading ? (
            <div className="md:col-span-2 py-20 text-center flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white/20 text-sm">Cargando usuarios...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="md:col-span-2 py-20 text-center">
              <Users size={40} className="mx-auto text-white/5 mb-4" />
              <p className="text-white/20 italic">No hay usuarios registrados</p>
            </div>
          ) : users.map((user) => (
            <motion.div 
              key={user.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass p-6 rounded-3xl border border-white/10 flex items-start gap-5 relative overflow-hidden group"
            >
              <div className={`p-4 rounded-2xl ${user.role === 'admin' ? 'bg-pink-500/10 text-pink-400' : 'bg-white/5 text-white/40'}`}>
                {user.role === 'admin' ? <Shield size={24} /> : <Users size={24} />}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-white text-lg">{user.username}</h3>
                  {user.role === 'admin' && (
                    <span className="text-[9px] font-bold uppercase tracking-widest bg-pink-500 text-white px-2 py-0.5 rounded-full">Admin</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {user.role === 'admin' ? (
                    <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/10">Acceso Total</span>
                  ) : (
                    user.permissions.map(p => (
                      <span key={p} className="text-[10px] text-white/40 font-medium bg-white/5 px-2 py-0.5 rounded-lg border border-white/5 capitalize">{p}</span>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all">
                <button 
                  onClick={() => handleEditClick(user)}
                  className="p-2.5 rounded-xl bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-all"
                >
                  <Edit3 size={16} />
                </button>
                <button 
                  onClick={() => handleDeleteUser(user.id)}
                  className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
