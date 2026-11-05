"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Camera,
  MapPin,
  CheckCircle2,
  PhoneCall,
  ArrowRight,
  X,
  AlertTriangle,
  Skull,
  Sparkles,
  Bot,
  Check,
  Info,
} from "lucide-react";
import { TriageResult } from "@/lib/triage-engine";
import { Button } from "@/components/ui/Button";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { IncidentCategory, IncidentSeverity, Incident } from "@/types/incident";
import { DemoBadge } from "@/components/ui/DemoBanner";
import { GothicAtmosphere } from "@/components/ui/GothicAtmosphere";
import { useIncidents } from "@/context/IncidentContext";

const CATEGORIES: { label: IncidentCategory; description: string }[] = [
  { label: "Medical", description: "Injuries, fainting, sudden illness, allergic reactions, trauma" },
  { label: "Security", description: "Assault, perimeter trespass, theft, physical altercations, prowlers" },
  { label: "Fire and Hazard", description: "Smoke, open flame, electrical sparks, chemical or water hazard" },
  { label: "Crowd Management", description: "Overcrowding, stampede hazard, blocked egress, bottleneck" },
  { label: "Suspicious Activity", description: "Unattended packages, unauthorized drones, surveillance behavior" },
  { label: "Infrastructure", description: "Power outage, jammed emergency exits, structural collapse risk" },
  { label: "Missing Person", description: "Separated minors, disoriented attendees, missing party members" },
];

const CAMPUS_ZONES = [
  "Central Campus Sector",
  "North STEM Quad",
  "East Sports Complex",
  "West Arts District",
  "South Event Perimeter",
  "Residential Quad",
  "Memorial Arena Concourse",
];

export default function ReportIncidentPage() {
  const router = useRouter();
  const { addIncident, uploadEvidence, emergencySettings } = useIncidents();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<IncidentCategory>("Medical");
  const [severity, setSeverity] = useState<IncidentSeverity>("High");
  const [zone, setZone] = useState("East Sports Complex");
  const [building, setBuilding] = useState("");
  const [landmark, setLandmark] = useState("");
  const [description, setDescription] = useState("");
  const [reporterContact, setReporterContact] = useState("");

  // Retain actual File object in state (Zero base64 database persistence)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Validation & Submission States
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submittedIncident, setSubmittedIncident] = useState<Incident | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Intelligent Auto-Triage States
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [isTriageLoading, setIsTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [appliedScore, setAppliedScore] = useState<number | undefined>(undefined);
  const [triageDismissed, setTriageDismissed] = useState(false);

  // Run Auto-Triage analysis via server API route
  const handleRunTriage = async (customDesc?: string) => {
    const textToAnalyze = (customDesc !== undefined ? customDesc : description).trim();
    if (textToAnalyze.length < 8) {
      setTriageError("Please enter at least 8 characters in the description to run auto-triage.");
      return;
    }

    setIsTriageLoading(true);
    setTriageError(null);

    try {
      const res = await fetch("/api/incidents/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: textToAnalyze,
          title: title.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Triage server returned ${res.status}`);
      }

      const payload = await res.json();
      if (payload.success && payload.data) {
        setTriageResult(payload.data);
        setTriageDismissed(false);
      } else {
        throw new Error("Invalid response format from triage service.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI auto-triage service currently unavailable.";
      setTriageError(msg);
      setTriageResult(null);
    } finally {
      setIsTriageLoading(false);
    }
  };

  // Debounced auto-triage trigger on typing when narrative exceeds 15 characters
  useEffect(() => {
    if (emergencySettings.aiAutoTriage === false) return;
    const trimmed = description.trim();
    if (trimmed.length < 15) return;

    const timer = setTimeout(() => {
      if (!triageResult && !triageDismissed) {
        handleRunTriage(trimmed);
      }
    }, 1200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, emergencySettings.aiAutoTriage]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    setUploadError(null);

    if (!file) return;

    // Validate mime-type
    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimes.includes(file.type)) {
      setFileError("Invalid image type. Please select a JPEG, PNG, or WebP photograph.");
      return;
    }

    // Validate size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setFileError("Photograph size exceeds 10 MB limit.");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPhotoName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemovePhoto = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setPhotoName(null);
    setFileError(null);
    setUploadError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];

    if (!title.trim()) errors.push("Incident Title is required.");
    if (!description.trim()) errors.push("Incident Narrative Description is required.");
    if (!zone.trim()) errors.push("Campus Zone selection is required.");
    if (!building.trim()) errors.push("Specific Building / Landmark is required.");

    if (errors.length > 0) {
      setValidationErrors(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setValidationErrors([]);
    setIsSubmitting(true);
    setUploadError(null);

    try {
      // Stage 1: Commit incident record to DynamoDB (allocates atomic VIG-2026-XXX)
      const created = await addIncident({
        title: title.trim(),
        description: description.trim(),
        category,
        severity,
        zone,
        building: building.trim() || landmark.trim() || zone,
        landmark: landmark.trim() || undefined,
        reporterContact: reporterContact.trim() || undefined,
        hasPhoto: false, // confirmed once file is persisted to private S3
        aiClassificationScore: appliedScore,
      });

      // If no photo was attached, creation is 100% complete
      if (!selectedFile) {
        setSubmittedIncident(created);
        setRedirectCountdown(4);
        return;
      }

      // Stage 2: Upload evidence image to private S3 with incident binding
      const uploadRes = await uploadEvidence(created.id, selectedFile);
      if (uploadRes.success && uploadRes.url) {
        setSubmittedIncident({
          ...created,
          hasPhoto: true,
          photoUrl: uploadRes.url,
        });
        setRedirectCountdown(4);
      } else {
        // Partial failure: Incident exists in DynamoDB, but photo upload failed
        setSubmittedIncident(created);
        setUploadError(uploadRes.error || "Failed to upload evidence photograph to private S3 storage.");
        setRedirectCountdown(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to report incident to dispatch server.";
      setValidationErrors([msg]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safe Retry Mechanism (Uploads photo to existing incident ID without duplicate creation)
  const handleRetryUpload = async () => {
    if (!submittedIncident || !selectedFile || isRetrying) return;
    setIsRetrying(true);
    setUploadError(null);

    try {
      const uploadRes = await uploadEvidence(submittedIncident.id, selectedFile);
      if (uploadRes.success && uploadRes.url) {
        setSubmittedIncident({
          ...submittedIncident,
          hasPhoto: true,
          photoUrl: uploadRes.url,
        });
        setRedirectCountdown(4);
      } else {
        setUploadError(uploadRes.error || "Retry failed. Upload was rejected by server.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network failure during upload retry.";
      setUploadError(msg);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleResetForm = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setTitle("");
    setCategory("Medical");
    setSeverity("High");
    setZone("East Sports Complex");
    setBuilding("");
    setLandmark("");
    setDescription("");
    setReporterContact("");
    setSelectedFile(null);
    setPreviewUrl(null);
    setPhotoName(null);
    setFileError(null);
    setUploadError(null);
    setSubmittedIncident(null);
    setValidationErrors([]);
    setRedirectCountdown(null);
    setTriageResult(null);
    setTriageError(null);
    setAppliedScore(undefined);
    setTriageDismissed(false);
    setIsSubmitting(false);
    setIsRetrying(false);
  }, [previewUrl]);

  // Listen for global "vigilora:new-report" event dispatched from navigation buttons
  useEffect(() => {
    const handleNewReportEvent = () => {
      handleResetForm();
    };

    window.addEventListener("vigilora:new-report", handleNewReportEvent);
    return () => {
      window.removeEventListener("vigilora:new-report", handleNewReportEvent);
    };
  }, [handleResetForm]);

  useEffect(() => {
    if (redirectCountdown === null) return;
    if (redirectCountdown <= 0) {
      handleResetForm();
      router.push("/incidents");
      return;
    }
    const timer = setInterval(() => {
      setRedirectCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [redirectCountdown, router, handleResetForm]);

  return (
    <GothicAtmosphere variant="report">
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-[#790009]/25">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="font-bodoni text-2xl sm:text-3xl font-bold tracking-wide uppercase">
                <span className="text-[#F2EEE9] text-distressed-ivory">INCIDENT </span>
                <span className="text-[#C00012] text-distressed-crimson">REPORT</span>
              </h1>
              <DemoBadge isCustom={true} />
            </div>
            <p className="font-oswald text-xs uppercase tracking-widest text-[#92929A] font-semibold">
              Victorian Investigation Intake • Real-Time Field Dispatch Console
            </p>
          </div>
        </div>

      {/* Safety Notice & Configurable Hotline */}
      <div className="rounded-md bg-[#180306] border border-[#790009]/50 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#F2EEE9] shadow-lg">
        <div className="flex items-start sm:items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[#790009]/30 text-[#F00018] border border-[#C00012]/40 shrink-0">
            <PhoneCall className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <span className="font-oswald uppercase tracking-wider text-[#F00018] font-bold mr-2">
              EMERGENCY PROTOCOL NOTICE:
            </span>
            <span className="text-[#92929A]">
              Internal simulation terminal. In real life-threatening distress, dial <strong>911</strong> or campus dispatch hotline.
            </span>
          </div>
        </div>

        <div className="text-right shrink-0 font-mono">
          {emergencySettings.isConfigured && emergencySettings.dispatchHotline ? (
            <span className="px-2.5 py-1 rounded bg-[#050506] text-[#F00018] text-[11px] font-bold border border-[#790009]/60 whitespace-nowrap block">
              DISPATCH SIMULATION: {emergencySettings.dispatchHotline} (DEMO)
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded bg-[#200508] text-[#F00018] text-[11px] font-bold border border-[#790009] whitespace-nowrap block">
              HOTLINE STANDBY (DEMO)
            </span>
          )}
        </div>
      </div>

      {/* Validation Errors Alert */}
      {validationErrors.length > 0 && (
        <div className="p-4 rounded-md bg-[#200508] border border-[#F00018]/60 text-xs text-red-200 space-y-1.5 animate-in fade-in shadow-xl">
          <div className="flex items-center gap-2 font-oswald uppercase font-bold text-[#F00018]">
            <AlertTriangle className="w-4 h-4" />
            <span>Please complete all required fields before submitting:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[#F2EEE9] pl-1 font-mono text-[11px]">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {submittedIncident ? (
        uploadError ? (
          /* Partial Failure State: Incident Created, Photo Upload Failed */
          <div className="rounded-md bg-[#0A0B10] border border-[#EA580C]/50 p-6 sm:p-8 text-center max-w-2xl mx-auto shadow-2xl animate-in zoom-in-95 space-y-5">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[#7A1F0D]/30 text-[#FB923C] border border-[#EA580C]/40 mx-auto">
              <AlertTriangle className="w-8 h-8 animate-pulse" />
            </div>

            <div>
              <span className="px-2.5 py-0.5 rounded text-xs font-oswald uppercase font-bold bg-[#7A1F0D]/40 text-[#FB923C] border border-[#EA580C]/40 tracking-wider">
                INCIDENT RECORDED • EVIDENCE UPLOAD PENDING
              </span>

              <h2 className="font-bodoni text-xl sm:text-2xl font-bold text-white mt-3 mb-1">
                Incident #{submittedIncident.id} Logged to Grid
              </h2>
              <p className="text-xs sm:text-sm text-[#92929A]">
                The incident was committed to DynamoDB, but photographic evidence failed to transfer to private S3.
              </p>
            </div>

            {/* Error Details */}
            <div className="p-3.5 rounded-md bg-[#200508] border border-[#F00018]/40 text-left text-xs space-y-1">
              <div className="flex items-center gap-2 font-oswald uppercase font-bold text-[#F00018]">
                <AlertTriangle className="w-4 h-4" />
                <span>Evidence Upload Rejection:</span>
              </div>
              <p className="text-[#F2EEE9] font-mono text-[11px] pl-6">
                {uploadError}
              </p>
            </div>

            {/* Pending Photo Preview */}
            {previewUrl && (
              <div className="p-3 rounded-md bg-[#050506] border border-[#790009]/30 flex items-center gap-3 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Pending Evidence"
                  className="w-16 h-16 rounded-md object-cover border border-[#790009]/40 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{photoName}</p>
                  <p className="text-[10px] text-[#92929A] font-mono">
                    {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : "Pending file"} • Retained in memory
                  </p>
                </div>
              </div>
            )}

            {/* Retry & Continue Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  handleResetForm();
                  router.push("/incidents");
                }}
              >
                Proceed to Incidents Without Photo
              </Button>
              <Button
                variant="primary"
                disabled={isRetrying}
                onClick={handleRetryUpload}
              >
                {isRetrying ? "Retrying S3 Upload..." : "Retry Evidence Upload"}
              </Button>
            </div>
          </div>
        ) : (
          /* Confirmation State */
          <div className="rounded-md bg-[#0A0B10] border border-[#00CC66]/40 p-6 sm:p-8 text-center max-w-2xl mx-auto shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[#041a0d]/60 text-[#00CC66] border border-[#00CC66]/40 mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <span className="px-2.5 py-0.5 rounded text-xs font-oswald uppercase font-bold bg-[#041a0d] text-[#00CC66] border border-[#00CC66]/30 tracking-wider">
              INCIDENT RECORDED & DISPATCH LOGGED
            </span>

            <h2 className="font-bodoni text-xl sm:text-2xl font-bold text-white mt-3 mb-1">
              Incident #{submittedIncident.id} Successfully Dispatched
            </h2>
            <p className="text-xs sm:text-sm text-[#92929A] mb-6">
              The incident and evidence have been committed to the AWS DynamoDB & S3 dispatch grid with authenticated audit logging.
            </p>

            <div className="p-4 rounded-md bg-[#050506] border border-[#790009]/30 text-left text-xs space-y-2 mb-6">
              <div className="flex justify-between border-b border-[#790009]/20 pb-2">
                <span className="text-[#92929A] font-oswald uppercase">Incident Reference:</span>
                <span className="font-mono font-bold text-[#F00018]">
                  {submittedIncident.id}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#790009]/20 pb-2">
                <span className="text-[#92929A] font-oswald uppercase">Title:</span>
                <span className="font-semibold text-white">
                  {submittedIncident.title}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#790009]/20 pb-2">
                <span className="text-[#92929A] font-oswald uppercase">Designated Severity:</span>
                <PriorityBadge severity={submittedIncident.severity} size="sm" />
              </div>
              <div className="flex justify-between border-b border-[#790009]/20 pb-2">
                <span className="text-[#92929A] font-oswald uppercase">Location:</span>
                <span className="text-[#F2EEE9]">
                  {submittedIncident.location.zone} ({submittedIncident.location.building})
                </span>
              </div>
              {submittedIncident.hasPhoto && submittedIncident.photoUrl && (
                <div className="flex justify-between border-b border-[#790009]/20 pb-2 items-center">
                  <span className="text-[#92929A] font-oswald uppercase">Photographic Evidence:</span>
                  <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5 text-[#F00018]" />
                    <span>Verified & Secured in S3</span>
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#92929A] font-oswald uppercase">Initial Dispatch Status:</span>
                <StatusBadge status="Reported" size="sm" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button variant="secondary" onClick={handleResetForm}>
                Submit Another Report
              </Button>
              <Button
                variant="primary"
                rightIcon={<ArrowRight className="w-4 h-4" />}
                onClick={() => {
                  handleResetForm();
                  router.push("/incidents");
                }}
              >
                <span>View on Live Board</span>
                {redirectCountdown !== null && (
                  <span className="font-mono ml-1 text-xs">({redirectCountdown}s)</span>
                )}
              </Button>
            </div>
          </div>
        )
      ) : (
        /* 2-Column Form with Atmospheric Gothic Artwork matching reference board */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Form Fields (7 or 8 Cols) */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-8 rounded-md bg-[#0A0B10] border border-[#790009]/35 p-5 sm:p-7 space-y-5 shadow-2xl"
          >
            {/* Title */}
            <div>
              <label className="block text-xs font-oswald uppercase tracking-wider font-semibold text-[#F2EEE9] mb-1.5">
                Incident Title <span className="text-[#F00018]">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Medical emergency near Arena, or electrical smoke odor"
                className="w-full px-3.5 py-2.5 rounded-md bg-[#050506] border border-[#790009]/35 text-white placeholder-[#92929A] text-sm font-mono-plex focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] transition-colors"
              />
            </div>

            {/* Severity & Category Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Category */}
              <div>
                <label className="block text-xs font-oswald uppercase tracking-wider font-semibold text-[#F2EEE9] mb-1.5">
                  Category <span className="text-[#F00018]">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as IncidentCategory)}
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#050506] border border-[#790009]/35 text-[#F2EEE9] text-xs font-oswald uppercase focus:outline-none focus:border-[#C00012] cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.label} value={cat.label} className="bg-[#0A0B10] text-[#F2EEE9]">
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-xs font-oswald uppercase tracking-wider font-semibold text-[#F2EEE9] mb-1.5">
                  Severity Rating <span className="text-[#F00018]">*</span>
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#050506] border border-[#790009]/35 text-[#F00018] text-xs font-oswald uppercase font-bold focus:outline-none focus:border-[#C00012] cursor-pointer"
                >
                  <option value="Critical" className="bg-[#0A0B10] text-[#F00018]">Critical</option>
                  <option value="High" className="bg-[#0A0B10] text-[#FF7700]">High</option>
                  <option value="Medium" className="bg-[#0A0B10] text-[#FFCC00]">Medium</option>
                  <option value="Low" className="bg-[#0A0B10] text-[#00CC66]">Low</option>
                </select>
              </div>
            </div>

            {/* Location Fields */}
            <div className="space-y-3 p-4 rounded-md bg-[#050506] border border-[#790009]/30">
              <div className="flex items-center gap-2 text-xs font-oswald uppercase tracking-wider font-semibold text-[#F2EEE9]">
                <MapPin className="w-4 h-4 text-[#F00018]" />
                <span>Location Specifics</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-oswald uppercase text-[#92929A] mb-1">
                    Campus Zone <span className="text-[#F00018]">*</span>
                  </label>
                  <select
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-[#0A0B10] border border-[#790009]/30 text-[#F2EEE9] text-xs font-oswald uppercase focus:outline-none focus:border-[#C00012]"
                  >
                    {CAMPUS_ZONES.map((z) => (
                      <option key={z} value={z} className="bg-[#0A0B10] text-[#F2EEE9]">
                        {z}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-oswald uppercase text-[#92929A] mb-1">
                    Building / Landmark <span className="text-[#F00018]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    placeholder="e.g. Sports Complex, North Quad"
                    className="w-full px-3 py-2 rounded-md bg-[#0A0B10] border border-[#790009]/30 text-[#F2EEE9] placeholder-[#92929A] text-xs font-mono-plex focus:outline-none focus:border-[#C00012]"
                  />
                </div>
              </div>
            </div>

            {/* Description & Intelligent Auto-Triage Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-oswald uppercase tracking-wider font-semibold text-[#F2EEE9]">
                  Incident Narrative Description <span className="text-[#F00018]">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleRunTriage()}
                  disabled={isTriageLoading}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111A29] hover:bg-[#180306] text-[#F00018] hover:text-[#ff2a36] border border-[#790009]/40 text-[11px] font-oswald uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span>{isTriageLoading ? "Analyzing..." : "Run AI Triage"}</span>
                </button>
              </div>

              <textarea
                required
                rows={4}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (triageDismissed) setTriageDismissed(false);
                }}
                placeholder="Provide detailed narrative (e.g. Electrical sparks and sharp smoke odor coming from hallway breaker box)..."
                className="w-full px-3.5 py-2.5 rounded-md bg-[#050506] border border-[#790009]/35 text-white placeholder-[#92929A] text-sm font-sans focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] transition-colors"
              />

              {/* Non-blocking Loading State */}
              {isTriageLoading && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-[#0A0B10] border border-[#790009]/30 text-xs text-[#92929A] animate-pulse">
                  <Bot className="w-4 h-4 text-[#F00018] animate-bounce" />
                  <span className="font-oswald uppercase tracking-wider text-[#F2EEE9]">
                    VIGILORA Triage AI analyzing incident narrative indicators...
                  </span>
                </div>
              )}

              {/* Triage Error Alert */}
              {triageError && !isTriageLoading && (
                <div className="p-3 rounded-md bg-[#180306] border border-[#790009]/40 text-xs text-[#92929A] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-[#F00018] shrink-0" />
                    <span>{triageError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTriageError(null)}
                    className="text-[#92929A] hover:text-white text-xs p-1"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Triage Recommendation Preview Card */}
              {triageResult && !triageDismissed && !isTriageLoading && (
                <div className="rounded-md bg-[#0A0B10] border border-[#790009]/60 p-4 space-y-3.5 shadow-2xl animate-in fade-in slide-in-from-top-2">
                  {/* Header with AI Transparency Disclaimers */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#790009]/25">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-[#790009]/30 flex items-center justify-center text-[#F00018] border border-[#790009]/50">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold font-oswald uppercase tracking-wider text-[#F2EEE9]">
                            AI Triage Recommendation
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-[#790009]/30 text-[#F00018] border border-[#790009]/40 uppercase">
                            {triageResult.engineUsed === "external-ai" ? "Cloud Model" : "Calibrated NLP"}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#92929A]">
                          Advisory preview only • Operator review and override supported
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setTriageDismissed(true)}
                      className="text-[#92929A] hover:text-white text-xs px-2 py-0.5 rounded hover:bg-[#790009]/20 cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>

                  {/* Life-Safety Emergency Alert Banner */}
                  {triageResult.isLifeThreatening && (
                    <div className="p-3 rounded-md bg-[#180306] border-2 border-[#C00012] text-white flex items-start gap-2.5 shadow-lg shadow-black/60">
                      <PhoneCall className="w-4 h-4 text-[#F00018] shrink-0 mt-0.5 animate-pulse" />
                      <div className="text-xs">
                        <strong className="text-[#F00018] font-oswald uppercase block tracking-wider font-bold">
                          Emergency Life-Safety Advisory
                        </strong>
                        <p className="text-[11px] text-red-200 mt-0.5 leading-relaxed font-sans">
                          {triageResult.safetyAdvisory ||
                            "Immediate danger to life detected. Call 911 / Local Emergency Services immediately. Do not delay emergency evacuation or first-aid while filing this report."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Grid: Category, Severity, Urgency, Calibrated Score */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-2.5 rounded-md bg-[#050506] border border-[#790009]/30">
                      <div className="text-[10px] font-oswald uppercase text-[#92929A]">
                        Recommended Category
                      </div>
                      <div className="text-xs font-bold text-[#F2EEE9] font-mono mt-0.5 truncate">
                        {triageResult.category}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-md bg-[#050506] border border-[#790009]/30">
                      <div className="text-[10px] font-oswald uppercase text-[#92929A] mb-1">
                        Recommended Severity
                      </div>
                      <PriorityBadge severity={triageResult.severity} size="sm" />
                    </div>

                    <div className="p-2.5 rounded-md bg-[#050506] border border-[#790009]/30">
                      <div className="text-[10px] font-oswald uppercase text-[#92929A]">
                        Urgency Rating
                      </div>
                      <div className="text-xs font-semibold text-[#F00018] font-mono mt-0.5 truncate">
                        {triageResult.urgency}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-md bg-[#050506] border border-[#790009]/30">
                      <div className="text-[10px] font-oswald uppercase text-[#92929A]">
                        Calibrated Confidence
                      </div>
                      <div className="text-xs font-bold text-[#F2EEE9] font-mono mt-0.5">
                        {triageResult.confidenceScore !== null
                          ? `${Math.round(triageResult.confidenceScore * 100)}% Match`
                          : "Ambiguous (Manual Check)"}
                      </div>
                    </div>
                  </div>

                  {/* Explanation & Immediate Tactical Action */}
                  <div className="space-y-1.5 text-xs text-[#F2EEE9] bg-[#050506] p-3 rounded-md border border-[#790009]/20 font-sans">
                    <div>
                      <span className="text-[#92929A] font-oswald uppercase text-[10px] block">
                        Classification Analysis:
                      </span>
                      <p className="text-[11px] text-[#F2EEE9] leading-relaxed">
                        {triageResult.explanation}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[#790009]/20">
                      <span className="text-[#92929A] font-oswald uppercase text-[10px] block">
                        Recommended Immediate Action:
                      </span>
                      <p className="text-[11px] text-[#F00018] font-mono leading-relaxed">
                        {triageResult.immediateAction}
                      </p>
                    </div>

                    {triageResult.detectedKeywords.length > 0 && (
                      <div className="pt-2 border-t border-[#790009]/20 flex flex-wrap items-center gap-1.5">
                        <span className="text-[#92929A] text-[10px] font-oswald uppercase">
                          Detected Indicators:
                        </span>
                        {triageResult.detectedKeywords.map((k) => (
                          <span
                            key={k}
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#790009]/20 text-[#F2EEE9] border border-[#790009]/30"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Apply Recommendation Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <p className="text-[10px] text-[#92929A]">
                      Click below to set Category to <strong>{triageResult.category}</strong> and Severity to{" "}
                      <strong>{triageResult.severity}</strong>.
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setCategory(triageResult.category);
                        setSeverity(triageResult.severity);
                        setAppliedScore(triageResult.confidenceScore ?? undefined);
                      }}
                      className="px-3.5 py-1.5 rounded-md bg-[#790009] hover:bg-[#C00012] text-white text-xs font-oswald uppercase font-bold tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-black/40 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Apply Recommendations</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Optional Photo Attachment */}
            <div>
              <label className="block text-xs font-oswald uppercase tracking-wider font-semibold text-[#92929A] mb-1.5">
                Optional Photograph (JPEG, PNG, WebP • Max 10 MB)
              </label>
              <div className="p-3.5 rounded-md bg-[#050506] border border-dashed border-[#790009]/40 hover:border-[#C00012]/70 transition-colors text-center">
                {previewUrl ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Uploaded preview"
                      className="max-h-36 rounded-md border border-[#790009]/50 shadow-md object-contain"
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute -top-2 -right-2 p-1 rounded-full bg-[#790009] text-white hover:bg-[#F00018] shadow"
                      title="Remove Photograph"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <p className="text-[10px] text-[#92929A] mt-1 truncate max-w-xs font-mono">
                      {photoName} {selectedFile && `(${(selectedFile.size / 1024).toFixed(1)} KB)`}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <Camera className="w-5 h-5 text-[#790009]" />
                    <span className="text-xs text-[#92929A]">Attach photographic evidence</span>
                    <label className="px-3 py-1 rounded-md bg-[#0A0B10] hover:bg-[#111A29] border border-[#790009]/40 text-xs text-[#F2EEE9] font-oswald uppercase cursor-pointer transition-colors">
                      Browse
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {fileError && (
                  <div className="mt-2.5 text-left p-2.5 rounded-md bg-[#200508] border border-[#F00018]/50 text-red-200 text-xs flex items-center gap-2 font-mono">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#F00018] shrink-0" />
                    <span>{fileError}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions: [ Cancel ] & [ Submit Report ] */}
            <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 border-t border-[#790009]/20">
              <button
                type="button"
                onClick={() => {
                  handleResetForm();
                  router.push("/");
                }}
                className="btn-gothic-charcoal w-full sm:w-auto px-4 py-2.5 rounded-md text-xs font-oswald uppercase tracking-wider text-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-gothic-crimson w-full sm:w-auto px-6 py-2.5 rounded-md text-xs font-oswald uppercase tracking-wider font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-center"
              >
                {isSubmitting ? "Submitting Incident..." : "Submit Report"}
              </button>
            </div>
          </form>

          {/* Right Atmospheric Illustration Card matching the reference board */}
          <div className="lg:col-span-4 rounded-md bg-[#0A0B10] border border-[#790009]/35 overflow-hidden shadow-2xl relative flex flex-col justify-between min-h-[480px] group">
            {/* Top Atmospheric Header */}
            <div className="p-5 border-b border-[#790009]/25 z-10 bg-gradient-to-b from-[#0A0B10] to-transparent">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#790009]/30 text-[#F00018] border border-[#F00018]/30 tracking-wider">
                TACTICAL INTAKE TERMINAL
              </span>
              <h3 className="font-bodoni text-lg font-bold text-distressed-ivory mt-2">
                Emergency Dispatch Queue
              </h3>
              <p className="text-xs text-[#92929A] mt-1 leading-relaxed font-sans">
                Reports submitted through this node are ingested into the live radar board and triaged for immediate responder routing.
              </p>
            </div>

            {/* Illustrated Gothic Crime Scene Investigation Art */}
            <div className="relative flex-1 min-h-[260px] flex items-center justify-center overflow-hidden">
              <Image
                src="/artwork/gothic-investigator-scene.jpg"
                alt="Victorian Gothic Investigator at Crime Scene"
                fill
                sizes="(max-width: 1024px) 100vw, 380px"
                className="object-cover object-center filter contrast-[1.1] brightness-[0.88] group-hover:scale-105 transition-transform duration-700"
              />
              {/* Layered Vignette and Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#050506] via-transparent to-[#0A0B10]/60" />
              <div className="absolute inset-0 bg-radial-vignette opacity-50" />

              <div className="absolute bottom-4 flex items-center gap-2 px-3 py-1 rounded-full bg-[#050506]/90 border border-[#790009]/50 text-[11px] font-oswald uppercase text-[#F2EEE9] tracking-wider shadow-lg">
                <Skull className="w-3.5 h-3.5 text-[#F00018] animate-pulse" />
                <span>Sector Perimeter Under Watch</span>
              </div>
            </div>

            {/* Bottom Guidance Info */}
            <div className="p-4 border-t border-[#790009]/25 bg-[#050506]/90 text-[11px] text-[#92929A] space-y-1">
              <div className="flex justify-between">
                <span>Intake Standard:</span>
                <span className="font-mono text-[#F2EEE9]">VIG-OP-2026</span>
              </div>
              <div className="flex justify-between">
                <span>Sensor Beacon State:</span>
                <span className="font-mono text-[#F00018] font-bold">ACTIVE FIX</span>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </GothicAtmosphere>
  );
}
