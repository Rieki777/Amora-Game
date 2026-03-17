import React, { createContext, useContext, useEffect, useState } from "react";

export interface User {
  id: string;
  name: string;
  email: string;
  paths: string[];
  contributions: Array<{
    id: string;
    type: string;
    description: string;
    heartsEarned: number;
    date: string;
  }>;
  quests: any[];
  heartsBalance: number;
  joinedAt: string;
  bio: string;
  avatar: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (name: string, email: string, password: string, paths: string[]) => Promise<void>;
  updateProfile: (updates: Partial<Omit<User, "id" | "email" | "joinedAt">>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("amora-auth-token");
    if (storedToken) {
      setToken(storedToken);
      validateToken(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  async function validateToken(tk: string) {
    try {
      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${tk}` },
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
      } else {
        localStorage.removeItem("amora-auth-token");
        setToken(null);
      }
    } catch (err) {
      console.error("Token validation failed:", err);
      localStorage.removeItem("amora-auth-token");
      setToken(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Login failed");
    }
    const data = await res.json();
    localStorage.setItem("amora-auth-token", data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function register(name: string, email: string, password: string, paths: string[]) {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, paths }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Registration failed");
    }
    const data = await res.json();
    localStorage.setItem("amora-auth-token", data.token);
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("amora-auth-token");
    setToken(null);
    setUser(null);
  }

  async function updateProfile(updates: Partial<Omit<User, "id" | "email" | "joinedAt">>) {
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Update failed");
    }
    const updated = await res.json();
    setUser(updated);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, register, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
