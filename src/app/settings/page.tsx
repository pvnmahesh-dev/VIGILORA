"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  Bell,
  Cpu,
  Database,
  Cloud,
  CheckCircle2,
  MapPin,
  RotateCcw,
  ShieldAlert,
  Radio,
  AlertTriangle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DemoBadge } from "@/components/ui/DemoBanner";
import { GothicAtmosphere } from "@/components/ui/GothicAtmosphere";
import { useIncidents } from "@/context/IncidentContext";

export default function SettingsPage() {
  const { emergencySettings, updateEmergencySettings, resetDemoData } = useIncidents();

  const [campusName, setCampusName] = useState(emergencySettings.campusName);
  const [dispatchPhone, setDispatchPhone] = useState(emergencySettings.dispatchHotline);
  const [dispatchChannel, setDispatchChannel] = useState(emergencySettings.dispatchChannel || "DISPATCH-SEC-1");
  const [autoEscalateCritical, setAutoEscalateCritical] = useState(emergencySettings.autoEscalateCritical);
  const [soundAlerts, setSoundAlerts] = useState(emergencySettings.soundAlerts);
  const [aiAutoTriage, setAiAutoTriage] = useState(emergencySettings.aiAutoTriage);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  useEffect(() => {
    setCampusName(emergencySettings.campusName);
    setDispatchPhone(emergencySettings.dispatchHotline);
    setDispatchChannel(emergencySettings.dispatchChannel || "DISPATCH-SEC-1");
    setAutoEscalateCritical(emergencySettings.autoEscalateCritical);
    setSoundAlerts(emergencySettings.soundAlerts);
    setAiAutoTriage(emergencySettings.aiAutoTriage);
  }, [emergencySettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);
    const success = await updateEmergencySettings({
      campusName,
      dispatchHotline: dispatchPhone.trim(),
      dispatchChannel: dispatchChannel.trim(),
      isConfigured: Boolean(dispatchPhone.trim()),
      autoEscalateCritical,
      soundAlerts,
      aiAutoTriage,
    });
    if (success) {
      setSavedSuccess(true);
      setErrorNotice(null);
      setTimeout(() => setSavedSuccess(false), 2500);
    } else {
      setErrorNotice(
        "Authorization required: Supervisor privileges are required to modify campus emergency configuration."
      );
      setTimeout(() => setErrorNotice(null), 6000);
    }
  };

  const handleConfirmReset = () => {
    resetDemoData();
    setConfirmResetOpen(false);
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2500);
  };

  return (
    <GothicAtmosphere variant="settings">
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#790009]/30">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-xl sm:text-2xl font-bodoni font-bold tracking-wide uppercase">
                <span className="text-[#F2EEE9] text-distressed-ivory">PLATFORM CONFIGURATION </span>
                <span className="text-[#C00012] text-distressed-crimson">& SETTINGS</span>
              </h1>
              <DemoBadge />
            </div>
            <p className="text-xs sm:text-sm text-[#92929A] font-sans">
              Emergency contact protocols, responder dispatch channels, and local demo storage controls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {savedSuccess && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-medium animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Settings saved to AWS DynamoDB</span>
              </div>
            )}
            {resetDone && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#790009]/20 text-[#F00018] border border-[#F00018]/30 text-xs font-mono font-medium animate-fadeIn">
                <RotateCcw className="w-4 h-4 text-[#F00018] shrink-0" />
                <span>Cloud data refreshed</span>
              </div>
            )}
            {errorNotice && (
              <div role="alert" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-950/80 text-red-300 border border-[#F00018]/60 text-xs font-mono font-medium animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-[#F00018] shrink-0" />
                <span>{errorNotice}</span>
              </div>
            )}
          </div>
        </div>

        {/* Restrained Gothic Decorative Header Banner */}
        <div className="relative rounded-md overflow-hidden border border-[#790009]/30 bg-[#0A0B10] p-4 flex items-center justify-between shadow-xl">
          <div className="relative z-10 max-w-md">
            <span className="text-[10px] font-mono tracking-widest text-[#F00018] uppercase font-bold">
              CENTRAL DISPATCH COMMAND ARCHITECTURE
            </span>
            <h2 className="text-sm sm:text-base font-bodoni font-bold text-[#F2EEE9] mt-1 uppercase">
              Nocturnal Sector Protocols & Operational Integrity
            </h2>
            <p className="text-xs text-[#92929A] mt-0.5 font-sans">
              Configure radio triage, siren audio alarms, and browser session persistence.
            </p>
          </div>
          <div className="relative w-28 h-20 shrink-0 hidden sm:block opacity-60">
            <Image
              src="/artwork/gothic-sidebar-ornament.jpg"
              alt="Gothic Archway"
              fill
              sizes="112px"
              className="object-cover rounded-md filter contrast-125"
            />
            <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#0A0B10]/40 to-[#0A0B10]" />
          </div>
        </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Venue & Configurable Emergency Contact */}
        <div className="p-5 rounded-md bg-[#0A0B10] border border-[#790009]/30 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#790009]/20">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#F00018]" />
              <h3 className="text-sm font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
                Emergency Dispatch & Venue Contacts
              </h3>
            </div>
            {dispatchPhone.trim() ? (
              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                HOTLINE CONFIGURED (DEMO SIMULATION)
              </span>
            ) : (
              <span className="text-[10px] font-mono text-[#F00018] bg-[#790009]/20 border border-[#F00018]/30 px-2 py-0.5 rounded">
                NOT CONFIGURED
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
                Campus / Venue Sector Name
              </label>
              <input
                type="text"
                required
                value={campusName}
                onChange={(e) => setCampusName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-md bg-[#050506] border border-[#790009]/40 text-[#F2EEE9] text-xs sm:text-sm font-mono-plex focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider">
                  Campus Emergency Dispatch Hotline
                </label>
                <span className="text-[10px] font-mono text-[#92929A] uppercase">Fictional Demo 555-Exchange</span>
              </div>
              <input
                type="text"
                value={dispatchPhone}
                onChange={(e) => setDispatchPhone(e.target.value)}
                placeholder="e.g. +1 (555) 019-9911 or internal extension"
                className="w-full px-3.5 py-2 rounded-md bg-[#050506] border border-[#790009]/40 text-[#F2EEE9] text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] font-mono"
              />
              <p className="text-[10px] text-[#92929A] mt-1 font-sans">
                Fictional demonstration contact. Not an active emergency dispatch line. In real life-threatening emergencies, always dial 911.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
                Tactical Radio Frequency / Contact Channel
              </label>
              <div className="relative">
                <Radio className="w-3.5 h-3.5 text-[#92929A] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={dispatchChannel}
                  onChange={(e) => setDispatchChannel(e.target.value)}
                  placeholder="e.g. DISPATCH-SEC-1 (460.125 MHz)"
                  className="w-full pl-9 pr-3.5 py-2 rounded-md bg-[#050506] border border-[#790009]/40 text-[#F2EEE9] text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Alert Rules & Escalation */}
        <div className="p-5 rounded-md bg-[#0A0B10] border border-[#790009]/30 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 pb-3 border-b border-[#790009]/20">
            <Bell className="w-4 h-4 text-[#F00018]" />
            <h3 className="text-sm font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
              Tactical Alert & Escalation Rules
            </h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-md bg-[#111A29]/60 border border-[#790009]/20">
              <div>
                <div className="text-xs font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
                  Auto-Escalate Critical Incidents
                </div>
                <div className="text-[11px] text-[#92929A]">
                  Notify nearest available tactical unit when severity is set to Critical
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoEscalateCritical}
                onChange={(e) => setAutoEscalateCritical(e.target.checked)}
                className="w-4 h-4 rounded text-[#C00012] accent-[#C00012] bg-[#050506] border-[#790009]/40"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-md bg-[#111A29]/60 border border-[#790009]/20">
              <div>
                <div className="text-xs font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
                  Audible Dispatch Terminal Siren
                </div>
                <div className="text-[11px] text-[#92929A]">
                  Sound alerting tone on operator console when new critical incident is logged
                </div>
              </div>
              <input
                type="checkbox"
                checked={soundAlerts}
                onChange={(e) => setSoundAlerts(e.target.checked)}
                className="w-4 h-4 rounded text-[#C00012] accent-[#C00012] bg-[#050506] border-[#790009]/40"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-md bg-[#111A29]/60 border border-[#790009]/20">
              <div>
                <div className="text-xs font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
                  AI-Assisted Severity Classification
                </div>
                <div className="text-[11px] text-[#92929A]">
                  Automatically score urgency indicators from reported narrative
                </div>
              </div>
              <input
                type="checkbox"
                checked={aiAutoTriage}
                onChange={(e) => setAiAutoTriage(e.target.checked)}
                className="w-4 h-4 rounded text-[#C00012] accent-[#C00012] bg-[#050506] border-[#790009]/40"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Cloud Grid Synchronization & Refresh */}
        <div className="p-5 rounded-md bg-[#0A0B10] border border-[#790009]/40 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#790009]/20">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#F00018]" />
              <h3 className="text-sm font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
                Cloud Grid Data Synchronization
              </h3>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[#790009]/20 text-[#F00018] border border-[#790009]/40 uppercase">
              AWS DYNAMODB / S3
            </span>
          </div>

          <p className="text-xs text-[#92929A] leading-relaxed font-sans">
            All incidents, tactical unit deployments, activities, and campus emergency parameters are synchronized with AWS DynamoDB and private S3 storage. Triggering a refresh re-fetches the latest live operational state.
          </p>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-[11px] text-[#92929A] font-mono">
              Synchronize terminal state with AWS cloud:
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<RotateCcw className="w-3.5 h-3.5 text-[#F00018]" />}
              onClick={() => setConfirmResetOpen(true)}
            >
              Refresh Cloud Data
            </Button>
          </div>
        </div>

        {/* Section 4: Upcoming Architecture Notice */}
        <div className="p-5 rounded-md bg-[#0A0B10] border border-[#790009]/30 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#790009]/20">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#F00018]" />
              <h3 className="text-sm font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
                Cloud Architecture Roadmap (Upcoming Phases)
              </h3>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[#790009]/20 text-[#F00018] border border-[#790009]/40 uppercase">
              PLANNED
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="p-3.5 rounded-md bg-[#111A29]/60 border border-[#790009]/20 space-y-1.5 font-sans">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
                <Database className="w-4 h-4 text-[#F00018]" />
                <span>AWS DynamoDB</span>
              </div>
              <p className="text-[11px] text-[#92929A] leading-tight">
                Distributed persistent store replacing localStorage for multi-dispatcher multi-campus synching.
              </p>
            </div>

            <div className="p-3.5 rounded-md bg-[#111A29]/60 border border-[#790009]/20 space-y-1.5 font-sans">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
                <Cloud className="w-4 h-4 text-emerald-400" />
                <span>AWS S3</span>
              </div>
              <p className="text-[11px] text-[#92929A] leading-tight">
                Presigned URL upload pipeline for high-resolution encrypted incident photographs.
              </p>
            </div>

            <div className="p-3.5 rounded-md bg-[#111A29]/60 border border-[#790009]/20 space-y-1.5 font-sans">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
                <Cpu className="w-4 h-4 text-[#92929A]" />
                <span>Groq Llama-3.3</span>
              </div>
              <p className="text-[11px] text-[#92929A] leading-tight">
                Sub-second triage model for duplicate cluster detection and tactical responder recommendations.
              </p>
            </div>
          </div>
        </div>

        {/* Save CTA */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-[#92929A] font-mono">
            VIGILORA v2.0 (AWS Cloud Dispatch Grid)
          </span>
          <Button type="submit" variant="primary" size="md">
            Save Configuration
          </Button>
        </div>
      </form>

        {/* Modal: Confirm Telemetry Refresh */}
        {confirmResetOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="refresh-dialog-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
          >
            <div className="w-full max-w-md p-5 rounded-md bg-[#0A0B10] border border-[#790009]/60 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#790009]/30">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-[#F00018]" />
                  <h3 id="refresh-dialog-title" className="text-sm font-oswald uppercase font-bold tracking-wider text-[#F2EEE9]">
                    Confirm Cloud Telemetry Refresh
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(false)}
                  className="text-[#92929A] hover:text-white p-1"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#92929A] leading-relaxed font-sans">
                Are you sure you want to re-hydrate the terminal? This will re-fetch all active incidents, tactical response team statuses, and emergency configuration directly from verified AWS DynamoDB tables.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmResetOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                  onClick={handleConfirmReset}
                >
                  Confirm Refresh
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </GothicAtmosphere>
  );
}
