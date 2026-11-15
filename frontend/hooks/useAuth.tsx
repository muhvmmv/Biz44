"use client";

import type { Permissions } from "@/lib/permissions";
import {
  createContext, useContext, useState, useEffect, useCallback, ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId: string;
  businessType?: string | null;
  companyName?: string | null;
  currency?: string;
  permissions?: Permissions;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  company?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return null;
    try {
      const res = await apiFetch<{ success: boolean; data: User }>("/auth/me");
      return res.success ? res.data : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const me = await fetchMe();
      if (active) {
        setUser(me);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ success: boolean; data: { user: User; token: string } }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    );
    localStorage.setItem("token", res.data.token);
    const me = await fetchMe();
    setUser(me || res.data.user);
  }, [fetchMe]);

  const register = useCallback(async (data: RegisterData) => {
    const res = await apiFetch<{ success: boolean; data: { user: User; token: string } }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(data) }
    );
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await fetchMe();
    if (me) setUser(me);
  }, [fetchMe]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}