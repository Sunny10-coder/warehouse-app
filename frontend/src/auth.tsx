import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { api, saveToken, clearToken, getToken, errMsg } from "@/src/api";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: "manager" | "asst_manager" | "document_controller" | "employee";
  status: "pending" | "active" | "disabled";
  team?: string | null;
  location: "warehouse" | "ega";
  default_shift?: string | null;
  annual_leave_balance: number;
  sick_leave_balance: number;
  comp_off_balance: number;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (full_name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const tok = await getToken();
      if (!tok) {
        setUser(null);
        return;
      }
      const r = await api.get<User>("/auth/me");
      setUser(r.data);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    try {
      const r = await api.post("/auth/login", { email, password });
      await saveToken(r.data.access_token);
      setUser(r.data.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  };

  const register = async (full_name: string, email: string, password: string) => {
    try {
      await api.post("/auth/register", { full_name, email, password });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  const isAdmin = !!user && ["manager", "asst_manager", "document_controller"].includes(user.role);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
