"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

export type OperatorRole = "Supervisor" | "Dispatcher" | "Responder" | "Reporter";

export interface AuthUser {
  email: string;
  name: string;
  role: OperatorRole;
  callsign?: string;
  teamId?: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  demoLogin: (role: "Dispatcher" | "Responder" | "Supervisor") => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initial session verification from secure HttpOnly cookie
  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (response.ok) {
        const payload = await response.json();
        if (payload.success && payload.user) {
          setUser({
            email: payload.user.email,
            name: payload.user.name,
            role: payload.user.role,
            callsign: payload.user.callsign,
            teamId: payload.user.teamId,
          });
          return;
        }
      }

      setUser(null);
    } catch (err) {
      console.warn("VIGILORA: Session verification failed:", err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Submit credentials to POST /api/auth/login
  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email: email.trim(), password }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
          return {
            success: false,
            error: data.error || "Authentication failed. Invalid operator ID or passkey.",
          };
        }

        if (data.user) {
          setUser({
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            callsign: data.user.callsign,
            teamId: data.user.teamId,
          });
        }

        return { success: true };
      } catch {
        return {
          success: false,
          error: "Network error. Unable to reach terminal authorization server.",
        };
      }
    },
    []
  );

  // Authenticate as a pre-configured demo station via POST /api/auth/demo-login
  const demoLogin = useCallback(
    async (role: "Dispatcher" | "Responder" | "Supervisor"): Promise<LoginResult> => {
      try {
        const response = await fetch("/api/auth/demo-login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ role }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
          return {
            success: false,
            error: data.error || `Failed to authenticate as ${role}.`,
          };
        }

        if (data.user) {
          setUser({
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            callsign: data.user.callsign,
            teamId: data.user.teamId,
          });
        }

        return { success: true };
      } catch {
        return {
          success: false,
          error: "Network error connecting to demo authorization terminal.",
        };
      }
    },
    []
  );

  // Revoke session via POST /api/auth/logout and clear React auth state
  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
    } catch (err) {
      console.warn("VIGILORA: Logout network error:", err);
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      demoLogin,
      logout,
      refreshSession,
    }),
    [user, isLoading, login, demoLogin, logout, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function useOptionalAuth(): AuthContextType | null {
  return useContext(AuthContext) ?? null;
}

