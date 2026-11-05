"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useAuth } from "./AuthContext";

export type AwsPreflightStatus = "connected" | "auth_expired" | "service_unavailable";
export type AwsPreflightLabel = "Connected" | "Authentication expired" | "Service unavailable";

export interface AwsPreflightContextValue {
  status: AwsPreflightStatus;
  label: AwsPreflightLabel;
  message: string;
  isChecking: boolean;
  recheck: () => Promise<void>;
}

const defaultContext: AwsPreflightContextValue = {
  status: "connected",
  label: "Connected",
  message: "AWS cloud services connected and operational.",
  isChecking: false,
  recheck: async () => { },
};

const AwsPreflightContext = createContext<AwsPreflightContextValue>(defaultContext);

export function AwsPreflightProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<AwsPreflightStatus>("connected");
  const [label, setLabel] = useState<AwsPreflightLabel>("Connected");
  const [message, setMessage] = useState<string>("AWS cloud services connected and operational.");
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const checkPreflight = useCallback(async () => {
    // Only query preflight endpoint when an authenticated user session is active
    if (!user) {
      return;
    }

    setIsChecking(true);
    try {
      const res = await fetch("/api/health/preflight", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (res.status === 401) {
        // Unauthenticated session, no state change
        return;
      }

      const data = await res.json().catch(() => null);

      if (data && data.status) {
        setStatus(data.status);
        setLabel(
          data.label ||
          (data.status === "connected"
            ? "Connected"
            : data.status === "auth_expired"
              ? "Authentication expired"
              : "Service unavailable")
        );
        setMessage(data.message || "");
      }
    } catch {
      setStatus("service_unavailable");
      setLabel("Service unavailable");
      setMessage(
        "AWS SERVICE UNAVAILABLE — Cloud resources could not be reached. Verify network connectivity."
      );
    } finally {
      setIsChecking(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      checkPreflight();
    }
  }, [user, checkPreflight]);

  return (
    <AwsPreflightContext.Provider
      value={{
        status,
        label,
        message,
        isChecking,
        recheck: checkPreflight,
      }}
    >
      {children}
    </AwsPreflightContext.Provider>
  );
}

export function useAwsPreflight(): AwsPreflightContextValue {
  return useContext(AwsPreflightContext);
}
