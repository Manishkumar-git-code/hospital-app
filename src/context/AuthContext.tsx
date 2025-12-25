'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type UserRole = 'patient' | 'hospital' | 'driver' | null;

interface AuthContextType {
  user: any | null;
  role: UserRole;
  isLoading: boolean;
  login: (email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from secure cookie (source of truth)
  useEffect(() => {
    const restore = async () => {
      try {
        const res = await fetch('/api/auth/me', { method: 'GET' });
        if (!res.ok) {
          setUser(null);
          setRole(null);
          localStorage.removeItem('user');
          localStorage.removeItem('role');
          return;
        }

        const data = await res.json().catch(() => ({}));
        const u = data?.user;
        if (!u?.id || !u?.role) {
          setUser(null);
          setRole(null);
          return;
        }

        setUser(u);
        setRole(u.role as UserRole);
        localStorage.setItem('user', JSON.stringify(u));
        localStorage.setItem('role', u.role as string);
      } finally {
        setIsLoading(false);
      }
    };

    restore().catch(() => setIsLoading(false));
  }, []);

  const login = async (email: string, _password: string, userRole: UserRole) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: _password, role: userRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || 'Login failed');
      }

      const userData = data?.user;
      if (!userData?.id || !userData?.role) {
        throw new Error('Login failed');
      }

      setUser(userData);
      setRole(userData.role as UserRole);

      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('role', userData.role as string);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setUser(null);
    setRole(null);
    localStorage.removeItem('user');
    localStorage.removeItem('role');
  };

  return (
    <AuthContext.Provider value={{ user, role, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
