"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  Incident,
  IncidentStatus,
  IncidentSeverity,
  IncidentCategory,
  ActivityEvent,
} from "@/types/incident";
import { ResponseTeam, TeamStatus } from "@/types/team";
import { useOptionalAuth } from "@/context/AuthContext";
import { calculateResponseTelemetry } from "@/lib/telemetry";

export interface EmergencySettings {
  campusName: string;
  dispatchHotline: string;
  dispatchChannel: string;
  isConfigured: boolean;
  autoEscalateCritical: boolean;
  soundAlerts: boolean;
  aiAutoTriage: boolean;
}

export interface NewIncidentPayload {
  title: string;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  zone: string;
  building: string;
  landmark?: string;
  reporterContact?: string;
  hasPhoto?: boolean;
  photoUrl?: string;
  aiClassificationScore?: number;
}

export interface IncidentContextType {
  incidents: Incident[];
  teams: ResponseTeam[];
  activities: ActivityEvent[];
  emergencySettings: EmergencySettings;
  isHydrated: boolean;
  isLoading: boolean;
  error: string | null;

  // Computed metrics
  metrics: {
    totalIncidents: number;
    activeIncidents: number;
    criticalIncidents: number;
    resolvedIncidents: number;
    underReviewIncidents: number;
    activeRespondersCount: number;
    totalRespondersCount: number;
    avgResponseTimeMinutes: number | null;
    eligibleCount: number;
    responseTelemetryStatusLabel: string;
    responseTelemetryExplanation: string;
    responseTelemetry: import("@/lib/telemetry").ResponseTelemetryResult;
  };

  // Actions
  addIncident: (payload: NewIncidentPayload) => Promise<Incident>;
  updateIncidentStatus: (
    incidentId: string,
    newStatus: IncidentStatus,
    notes?: string
  ) => Promise<boolean>;
  assignTeam: (incidentId: string, teamId: string) => Promise<boolean>;
  unassignTeam: (incidentId: string) => Promise<boolean>;
  updateTeamStatus: (teamId: string, status: TeamStatus) => Promise<boolean>;
  updateEmergencySettings: (settings: Partial<EmergencySettings>) => Promise<boolean>;
  uploadEvidence: (
    incidentId: string,
    file: File | Blob,
    filename?: string
  ) => Promise<{ success: boolean; evidenceId?: string; url?: string; error?: string }>;
  refreshAll: () => Promise<void>;
  resetDemoData: () => void;
}

const DEFAULT_SETTINGS: EmergencySettings = {
  campusName: "University Metropolis Campus",
  dispatchHotline: "+1 (555) 991-1111",
  dispatchChannel: "DISPATCH-SEC-1",
  isConfigured: true,
  autoEscalateCritical: true,
  soundAlerts: true,
  aiAutoTriage: true,
};

const IncidentContext = createContext<IncidentContextType | undefined>(undefined);

export function IncidentProvider({ children }: { children: React.ReactNode }) {
  // Pure live state initialized empty without mock data fallbacks
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [teams, setTeams] = useState<ResponseTeam[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [emergencySettings, setEmergencySettings] = useState<EmergencySettings>(DEFAULT_SETTINGS);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // 1. Initial Data Hydration from Verified AWS Endpoints (No localStorage)
  // ---------------------------------------------------------------------------
  const refreshActivities = useCallback(async () => {
    try {
      const res = await fetch("/api/activities?limit=50", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const payload = await res.json();
        if (Array.isArray(payload.data)) {
          setActivities(payload.data);
        }
      }
    } catch (e) {
      console.warn("VIGILORA: Failed to refresh activities:", e);
    }
  }, []);

  const refreshTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/teams", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const payload = await res.json();
        if (Array.isArray(payload.data)) {
          setTeams(payload.data);
        }
      }
    } catch (e) {
      console.warn("VIGILORA: Failed to refresh teams:", e);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [incRes, teamsRes, actRes, setRes] = await Promise.allSettled([
        fetch("/api/incidents", { headers: { Accept: "application/json" }, cache: "no-store" }),
        fetch("/api/teams", { headers: { Accept: "application/json" }, cache: "no-store" }),
        fetch("/api/activities?limit=50", { headers: { Accept: "application/json" }, cache: "no-store" }),
        fetch("/api/settings", { headers: { Accept: "application/json" }, cache: "no-store" }),
      ]);

      // Incidents
      if (incRes.status === "fulfilled" && incRes.value.ok) {
        const payload = await incRes.value.json();
        setIncidents(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setIncidents([]);
      }

      // Teams
      if (teamsRes.status === "fulfilled" && teamsRes.value.ok) {
        const payload = await teamsRes.value.json();
        setTeams(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setTeams([]);
      }

      // Activities
      if (actRes.status === "fulfilled" && actRes.value.ok) {
        const payload = await actRes.value.json();
        setActivities(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setActivities([]);
      }

      // Settings
      if (setRes.status === "fulfilled" && setRes.value.ok) {
        const payload = await setRes.value.json();
        if (payload.data && typeof payload.data === "object") {
          setEmergencySettings({
            campusName: payload.data.campusName || DEFAULT_SETTINGS.campusName,
            dispatchHotline: payload.data.dispatchHotline || DEFAULT_SETTINGS.dispatchHotline,
            dispatchChannel: payload.data.dispatchChannel || DEFAULT_SETTINGS.dispatchChannel,
            isConfigured: Boolean(payload.data.dispatchHotline),
            autoEscalateCritical: payload.data.autoEscalateCritical ?? true,
            soundAlerts: payload.data.soundAlerts ?? true,
            aiAutoTriage: payload.data.aiAutoTriage ?? true,
          });
        }
      }
    } catch (err) {
      console.error("VIGILORA: Error hydrating state from AWS backend:", err);
      setError("Failed to load dispatch data from server.");
    } finally {
      setIsHydrated(true);
      setIsLoading(false);
    }
  }, []);

  const authContext = useOptionalAuth();
  const authIsAuthenticated = authContext?.isAuthenticated;
  const authIsLoading = authContext?.isLoading;
  const authUserEmail = authContext?.user?.email;

  useEffect(() => {
    if (authContext) {
      if (authIsAuthenticated) {
        refreshAll();
      } else if (!authIsLoading) {
        setIncidents([]);
        setTeams([]);
        setActivities([]);
        setIsLoading(false);
      }
    } else {
      refreshAll();
    }
  }, [authContext, authIsAuthenticated, authIsLoading, authUserEmail, refreshAll]);

  // ---------------------------------------------------------------------------
  // 2. Actions: Real Asynchronous AWS API Calls
  // ---------------------------------------------------------------------------

  // POST /api/incidents
  const addIncident = useCallback(
    async (payload: NewIncidentPayload): Promise<Incident> => {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          title: payload.title.trim(),
          description: payload.description.trim(),
          category: payload.category,
          severity: payload.severity,
          zone: payload.zone,
          building: payload.building?.trim() || payload.zone,
          landmark: payload.landmark?.trim() || undefined,
          reporterContact: payload.reporterContact?.trim() || undefined,
          hasPhoto: payload.hasPhoto ?? false,
          photoUrl: payload.photoUrl || undefined,
          aiClassificationScore: payload.aiClassificationScore,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || `Failed to create incident (${response.status})`);
      }

      const createdIncident = data.data as Incident;

      // Update state with server confirmed record
      setIncidents((prev) => [createdIncident, ...prev]);

      if (data.activity) {
        setActivities((prev) => [data.activity, ...prev]);
      } else {
        refreshActivities();
      }

      return createdIncident;
    },
    [refreshActivities]
  );

  // PATCH /api/incidents/[id]
  const updateIncidentStatus = useCallback(
    async (incidentId: string, newStatus: IncidentStatus, notes?: string): Promise<boolean> => {
      const current = incidents.find((i) => i.id === incidentId);
      if ((newStatus === "Assigned" || newStatus === "Responding") && !current?.assignedTeamId) {
        console.warn(
          `VIGILORA: Cannot transition ${incidentId} to "${newStatus}" without an assigned tactical response unit.`
        );
        return false;
      }

      try {
        const response = await fetch(`/api/incidents/${incidentId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            status: newStatus,
            notes,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
          console.error("VIGILORA: Status update rejected by server:", data.error);
          return false;
        }

        const updatedIncident = data.data as Incident;

        // Update incident in state
        setIncidents((prev) =>
          prev.map((i) => (i.id === incidentId ? updatedIncident : i))
        );

        if (data.activity) {
          setActivities((prev) => [data.activity, ...prev]);
        }

        // Auto-release or update teams state when incident resolves or responds
        if (newStatus === "Resolved" || newStatus === "Responding") {
          refreshTeams();
        }

        return true;
      } catch (err) {
        console.error("VIGILORA: Network failure updating incident status:", err);
        return false;
      }
    },
    [incidents, refreshTeams]
  );

  // POST /api/incidents/[id]/assign
  const assignTeam = useCallback(
    async (incidentId: string, teamId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/incidents/${incidentId}/assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ teamId, action: "assign" }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
          console.error("VIGILORA: Assignment rejected by server:", data.error);
          return false;
        }

        // Update incidents state
        setIncidents((prev) =>
          prev.map((i) =>
            i.id === incidentId
              ? {
                  ...i,
                  assignedTeamId: data.data?.assignedTeamId ?? teamId,
                  assignedResponder: data.data?.assignedResponder ?? i.assignedResponder,
                  status: data.data?.status ?? (i.status === "Reported" ? "Assigned" : i.status),
                  updatedAt: new Date().toISOString(),
                }
              : i
          )
        );

        // Update teams state
        setTeams((prev) =>
          prev.map((t) => {
            if (t.id === teamId) {
              return {
                ...t,
                status: "En Route",
                activeIncidentId: incidentId,
              };
            }
            if (t.activeIncidentId === incidentId) {
              return {
                ...t,
                status: "Available",
                activeIncidentId: undefined,
              };
            }
            return t;
          })
        );

        if (data.activity) {
          setActivities((prev) => [data.activity, ...prev]);
        }

        return true;
      } catch (err) {
        console.error("VIGILORA: Network failure assigning team:", err);
        return false;
      }
    },
    []
  );

  // POST /api/incidents/[id]/assign with action: "unassign"
  const unassignTeam = useCallback(
    async (incidentId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/incidents/${incidentId}/assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ action: "unassign" }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
          console.error("VIGILORA: Unassignment rejected by server:", data.error);
          return false;
        }

        setIncidents((prev) =>
          prev.map((i) =>
            i.id === incidentId
              ? {
                  ...i,
                  assignedTeamId: undefined,
                  assignedResponder: undefined,
                  status: data.data?.status ?? (i.status === "Assigned" ? "Under review" : i.status),
                  updatedAt: new Date().toISOString(),
                }
              : i
          )
        );

        setTeams((prev) =>
          prev.map((t) => {
            if (t.activeIncidentId === incidentId) {
              return {
                ...t,
                status: "Available",
                activeIncidentId: undefined,
              };
            }
            return t;
          })
        );

        if (data.activity) {
          setActivities((prev) => [data.activity, ...prev]);
        }

        return true;
      } catch (err) {
        console.error("VIGILORA: Network failure unassigning team:", err);
        return false;
      }
    },
    []
  );

  // PATCH /api/teams/[id]
  const updateTeamStatus = useCallback(
    async (teamId: string, status: TeamStatus): Promise<boolean> => {
      try {
        const response = await fetch(`/api/teams/${teamId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ status }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
          console.error("VIGILORA: Team status update rejected by server:", data.error);
          return false;
        }

        const updatedTeam = data.data as ResponseTeam;
        setTeams((prev) => prev.map((t) => (t.id === teamId ? updatedTeam : t)));
        return true;
      } catch (err) {
        console.error("VIGILORA: Network failure updating team status:", err);
        return false;
      }
    },
    []
  );

  // PATCH /api/settings
  const updateEmergencySettings = useCallback(
    async (settings: Partial<EmergencySettings>): Promise<boolean> => {
      try {
        const response = await fetch("/api/settings", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(settings),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
          console.error("VIGILORA: Settings update rejected by server:", data.error);
          return false;
        }

        if (data.data) {
          setEmergencySettings((prev) => ({ ...prev, ...data.data }));
        }
        return true;
      } catch (err) {
        console.error("VIGILORA: Network failure updating settings:", err);
        return false;
      }
    },
    []
  );

  // Presigned S3 Evidence Upload Orchestration (Option A) with Legacy Fallback
  const uploadEvidence = useCallback(
    async (
      incidentId: string,
      file: File | Blob,
      filename?: string
    ): Promise<{ success: boolean; evidenceId?: string; url?: string; error?: string }> => {
      const actualFilename = file instanceof File ? file.name : (filename || "evidence-upload.jpg");
      const actualMime = file.type || "image/jpeg";
      const sizeBytes = file.size;

      // -----------------------------------------------------------------------
      // Stage 1: Request Short-Lived S3 Upload Authorization
      // -----------------------------------------------------------------------
      let authData: { authId: string; uploadUrl: string; fields: Record<string, string>; s3Key: string } | null = null;
      try {
        const authRes = await fetch("/api/upload/authorize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            incidentId,
            filename: actualFilename,
            mimeType: actualMime,
            sizeBytes,
          }),
        });

        const authJson = await authRes.json().catch(() => ({}));
        if (authRes.ok && authJson.success && authJson.data) {
          authData = authJson.data;
        } else if (authRes.status === 404 || authRes.status === 413 || authRes.status === 415) {
          // Explicit validation or not-found failure from server; return immediately
          return {
            success: false,
            error: authJson.error || `Upload authorization failed with HTTP ${authRes.status}`,
          };
        }
      } catch (authErr) {
        console.warn("VIGILORA: Authorization endpoint unreachable, checking fallback:", authErr);
      }

      // -----------------------------------------------------------------------
      // Stage 2: Direct Browser-to-S3 Multipart Upload (if authorized)
      // -----------------------------------------------------------------------
      let s3UploadSucceeded = false;
      if (authData) {
        try {
          const s3FormData = new FormData();
          // Policy fields must precede file in S3 Presigned POST
          for (const [key, value] of Object.entries(authData.fields)) {
            s3FormData.append(key, value);
          }
          if (file instanceof File) {
            s3FormData.append("file", file);
          } else {
            s3FormData.append("file", file, actualFilename);
          }

          const s3Res = await fetch(authData.uploadUrl, {
            method: "POST",
            body: s3FormData,
          });

          if (s3Res.ok || s3Res.status === 204 || s3Res.status === 201) {
            s3UploadSucceeded = true;
          } else {
            const s3Text = await s3Res.text().catch(() => "");
            if (s3Res.status === 400 && s3Text.includes("EntityTooLarge")) {
              return {
                success: false,
                error: "File exceeds the maximum allowed size of 10 MB.",
              };
            }
            console.warn(`VIGILORA: Direct S3 POST returned HTTP ${s3Res.status}. Engaging fallback proxy.`);
          }
        } catch (s3Err) {
          // Network / CORS failure during direct S3 transfer
          console.warn("VIGILORA: Direct S3 POST network/CORS error. Engaging fallback proxy:", s3Err);
        }
      }

      // -----------------------------------------------------------------------
      // Stage 3: Verification & Metadata Transaction (/api/upload/complete)
      // STRICT SAFETY INVARIANT: Only executes if S3 direct upload succeeded!
      // If completion encounters an ambiguous network failure, retry safely.
      // NEVER fall back to legacy proxy after S3 accepted the asset.
      // -----------------------------------------------------------------------
      if (authData && s3UploadSucceeded) {
        const maxAttempts = 3;
        let lastError = "Upload completion failed.";

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const compRes = await fetch("/api/upload/complete", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                authId: authData.authId,
                s3Key: authData.s3Key,
              }),
            });

            const compJson = await compRes.json().catch(() => ({}));
            if (compRes.ok && compJson.success && compJson.data) {
              const { id: evidenceId, url } = compJson.data;

              // Atomically update incident record in React state
              setIncidents((prev) =>
                prev.map((inc) =>
                  inc.id === incidentId
                    ? {
                        ...inc,
                        hasPhoto: true,
                        photoUrl: url,
                        photoUrls: Array.from(new Set([...(inc.photoUrls || (inc.photoUrl ? [inc.photoUrl] : [])), url])),
                        updatedAt: new Date().toISOString(),
                      }
                    : inc
                )
              );

              return { success: true, evidenceId, url };
            }

            // Do not retry terminal client errors (400 magic bytes invalid, 404, 409, 410 expired)
            if (compRes.status >= 400 && compRes.status < 500 && compRes.status !== 408) {
              return {
                success: false,
                error: compJson.error || `Upload verification failed with HTTP ${compRes.status}`,
              };
            }

            lastError = compJson.error || `Upload completion failed with HTTP ${compRes.status}`;
          } catch (netErr) {
            console.warn(`VIGILORA: Completion attempt ${attempt}/${maxAttempts} network failure:`, netErr);
            lastError = "Network failure verifying evidence upload.";
          }

          if (attempt < maxAttempts) {
            // Short exponential backoff before retry (600ms, 1200ms)
            await new Promise((r) => setTimeout(r, 600 * attempt));
          }
        }

        // Retries exhausted without server confirmation
        return {
          success: false,
          error: `Evidence image was securely uploaded to S3 enclave, but database recording encountered network failure: ${lastError}`,
        };
      }

      // -----------------------------------------------------------------------
      // Fallback: Legacy POST /api/upload (Server-Buffered Proxy)
      // STRICT SAFETY: Can ONLY execute if direct S3 upload DID NOT succeed!
      // -----------------------------------------------------------------------
      try {
        const formData = new FormData();
        if (file instanceof File) {
          formData.append("file", file);
        } else {
          formData.append("file", file, actualFilename);
        }
        formData.append("incidentId", incidentId);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success || !data.data) {
          return {
            success: false,
            error: data.error || `Upload failed with HTTP ${response.status}`,
          };
        }

        const { id: evidenceId, url } = data.data;

        setIncidents((prev) =>
          prev.map((inc) =>
            inc.id === incidentId
              ? {
                  ...inc,
                  hasPhoto: true,
                  photoUrl: url,
                  photoUrls: Array.from(new Set([...(inc.photoUrls || (inc.photoUrl ? [inc.photoUrl] : [])), url])),
                  updatedAt: new Date().toISOString(),
                }
              : inc
          )
        );

        return { success: true, evidenceId, url };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network failure during evidence upload";
        return { success: false, error: msg };
      }
    },
    []
  );

  // Reset / Refresh action (does not inject demo records into cloud DynamoDB)
  const resetDemoData = useCallback(() => {
    refreshAll();
  }, [refreshAll]);

  // ---------------------------------------------------------------------------
  // 3. Dynamic Computed Metrics (Derived genuinely from live DynamoDB state)
  // ---------------------------------------------------------------------------
  const metrics = useMemo(() => {
    const totalIncidents = incidents.length;
    const resolvedIncidents = incidents.filter((i) => i.status === "Resolved").length;
    const activeIncidents = incidents.filter((i) => i.status !== "Resolved").length;
    const criticalIncidents = incidents.filter(
      (i) => i.severity === "Critical" && i.status !== "Resolved"
    ).length;
    const underReviewIncidents = incidents.filter((i) => i.status === "Under review").length;
    const activeRespondersCount = teams.filter(
      (t) => t.status !== "Available" && t.status !== "Off Duty"
    ).length;
    const totalRespondersCount = teams.length;

    // Derived genuinely from verified dispatch activities and incident timestamps
    const responseTelemetry = calculateResponseTelemetry(incidents, activities);
    const avgResponseTimeMinutes =
      responseTelemetry.available && responseTelemetry.meanMinutes !== null
        ? responseTelemetry.meanMinutes
        : null;

    return {
      totalIncidents,
      activeIncidents,
      criticalIncidents,
      resolvedIncidents,
      underReviewIncidents,
      activeRespondersCount,
      totalRespondersCount,
      avgResponseTimeMinutes,
      eligibleCount: responseTelemetry.eligibleCount,
      responseTelemetryStatusLabel: responseTelemetry.statusLabel,
      responseTelemetryExplanation: responseTelemetry.explanation,
      responseTelemetry,
    };
  }, [incidents, teams, activities]);

  const value = useMemo(
    () => ({
      incidents,
      teams,
      activities,
      emergencySettings,
      isHydrated,
      isLoading,
      error,
      metrics,
      addIncident,
      updateIncidentStatus,
      assignTeam,
      unassignTeam,
      updateTeamStatus,
      updateEmergencySettings,
      uploadEvidence,
      refreshAll,
      resetDemoData,
    }),
    [
      incidents,
      teams,
      activities,
      emergencySettings,
      isHydrated,
      isLoading,
      error,
      metrics,
      addIncident,
      updateIncidentStatus,
      assignTeam,
      unassignTeam,
      updateTeamStatus,
      updateEmergencySettings,
      uploadEvidence,
      refreshAll,
      resetDemoData,
    ]
  );

  return (
    <IncidentContext.Provider value={value}>
      {children}
    </IncidentContext.Provider>
  );
}

export function useIncidents(): IncidentContextType {
  const context = useContext(IncidentContext);
  if (!context) {
    throw new Error("useIncidents must be used within an IncidentProvider");
  }
  return context;
}
