'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@vendorbridge/shared';
import { api, tokenStore } from './api';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  organization?: { name: string };
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: {
    organizationName: string;
    name: string;
    email: string;
    password: string;
    gstin?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<SessionUser>('/auth/me')
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string }>('/auth/login', { email, password });
    tokenStore.set(res.accessToken);
    const me = await api.get<SessionUser>('/auth/me');
    setUser(me);
  };

  const signup = async (input: {
    organizationName: string;
    name: string;
    email: string;
    password: string;
    gstin?: string;
  }) => {
    const res = await api.post<{ accessToken: string }>('/auth/signup', input);
    tokenStore.set(res.accessToken);
    const me = await api.get<SessionUser>('/auth/me');
    setUser(me);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
