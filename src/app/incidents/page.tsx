"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Search,
  PlusCircle,
  MapPin,
  Clock,
  X,
  Bot,
  Shield,
  ArrowUpDown,
  History,
  AlertTriangle,
  CheckCircle2,
  Users2,
} from "lucide-react";
import { IncidentStatus, IncidentSeverity } from "@/types/incident";
import { IncidentCard } from "@/components/incidents/IncidentCard";
import { EvidenceViewer } from "@/components/evidence/EvidenceViewer";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DemoBadge } from "@/components/ui/DemoBanner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GothicAtmosphere } from "@/components/ui/GothicAtmosphere";
import { formatTimeAgo } from "@/lib/utils";
import { useIncidents } from "@/context/IncidentContext";
import { useAuth } from "@/context/AuthContext";

const SEVERITY_WEIGHT: Record<IncidentSeverity, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

export default function LiveIncidentsPage() {
  const { user } = useAuth();
  const {
    incidents,
    teams,
    activities,
    updateIncidentStatus,
    assignTeam,
    unassignTeam,
    refreshAll,
  } = useIncidents();

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "priority" | "oldest">("newest");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  // Sync selected incident with live state
  const selectedIncident = useMemo(() => {
    if (!selectedIncidentId) return null;
    return incidents.find((i) => i.id === selectedIncidentId) || null;
  }, [selectedIncidentId, incidents]);

  // Activity events for selected incident
  const incidentActivities = useMemo(() => {
    if (!selectedIncident) return [];
    return activities.filter((a) => a.incidentId === selectedIncident.id);
  }, [selectedIncident, activities]);

  // Categories list
  const categories = [
    { label: "All Categories", value: "all" },
    { label: "Medical", value: "Medical" },
    { label: "Security", value: "Security" },
    { label: "Fire and Hazard", value: "Fire" },
    { label: "Crowd Management", value: "Crowd" },
    { label: "Suspicious Activity", value: "Suspicious" },
    { label: "Infrastructure", value: "Infrastructure" },
    { label: "Missing Person", value: "Missing" },
  ];

  const severities = [
    { label: "All Severities", value: "all" },
    { label: "Critical", value: "Critical" },
    { label: "High", value: "High" },
    { label: "Medium", value: "Medium" },
    { label: "Low", value: "Low" },
  ];

  const statuses: { label: string; value: string }[] = [
    { label: "All Incidents", value: "all" },
    { label: "Reported", value: "Reported" },
    { label: "Under review", value: "Under review" },
    { label: "Assigned", value: "Assigned" },
    { label: "Responding", value: "Responding" },
    { label: "Resolved", value: "Resolved" },
  ];

  // Filter & Sort
  const filteredIncidents = useMemo(() => {
    return incidents
      .filter((incident) => {
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          incident.title.toLowerCase().includes(q) ||
          incident.id.toLowerCase().includes(q) ||
          incident.location.zone.toLowerCase().includes(q) ||
          (incident.location.building && incident.location.building.toLowerCase().includes(q)) ||
          incident.category.toLowerCase().includes(q);

        const matchesStatus =
          statusFilter === "all" || incident.status === statusFilter;

        const matchesSeverity =
          severityFilter === "all" || incident.severity === severityFilter;

        const matchesCategory =
          categoryFilter === "all" ||
          incident.category.toLowerCase().includes(categoryFilter.toLowerCase());

        return matchesSearch && matchesStatus && matchesSeverity && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === "priority") {
          const diff = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
          if (diff !== 0) return diff;
          return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
        }
        if (sortBy === "oldest") {
          return new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime();
        }
        // Default "newest"
        return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
      });
  }, [incidents, searchQuery, statusFilter, severityFilter, categoryFilter, sortBy]);

  const [notice, setNotice] = useState<{ type: "error" | "warning" | "success"; text: string } | null>(null);
  const [reassignModal, setReassignModal] = useState<{
    teamId: string;
    teamName: string;
    currentIncidentId: string;
    targetIncidentId: string;
  } | null>(null);

  const showNotice = (type: "error" | "warning" | "success", text: string) => {
    setNotice({ type, text });
    setTimeout(() => {
      setNotice((prev) => (prev?.text === text ? null : prev));
    }, 6000);
  };

  const handleUpdateStatus = async (newStatus: IncidentStatus) => {
    if (!selectedIncident) return;
    if (selectedIncident.status === "Resolved" && newStatus === "Reported") {
      showNotice("warning", "A resolved incident cannot be moved directly to 'Reported'. Reopen as 'Under review' if ongoing.");
      return;
    }
    if ((newStatus === "Assigned" || newStatus === "Responding") && !selectedIncident.assignedTeamId) {
      showNotice(
        "warning",
        `Cannot transition incident to "${newStatus}" without an assigned tactical unit. Please dispatch a unit from the roster below.`
      );
      return;
    }
    const success = await updateIncidentStatus(selectedIncident.id, newStatus);
    if (!success) {
      showNotice("error", "Status transition was rejected by dispatch server. Please verify operational state permissions.");
    } else {
      showNotice("success", `Incident status transitioned to "${newStatus}".`);
    }
  };

  const handleAssignTeam = async (teamId: string) => {
    if (!selectedIncident) return;
    if (user?.role === "Responder") {
      showNotice("error", "Unauthorized: Field Responders are not permitted to assign tactical units.");
      return;
    }
    const targetTeam = teams.find((t) => t.id === teamId);
    if (!targetTeam) return;

    if (
      targetTeam.activeIncidentId &&
      targetTeam.activeIncidentId !== selectedIncident.id &&
      targetTeam.status !== "Available"
    ) {
      setReassignModal({
        teamId: targetTeam.id,
        teamName: targetTeam.name,
        currentIncidentId: targetTeam.activeIncidentId,
        targetIncidentId: selectedIncident.id,
      });
      return;
    }

    const success = await assignTeam(selectedIncident.id, teamId);
    if (!success) {
      showNotice("error", "Tactical assignment rejected. Unit may be busy on an unresolved incident or you lack Dispatcher authority.");
    } else {
      showNotice("success", `Tactical unit ${targetTeam.name} successfully deployed to ${selectedIncident.id}.`);
    }
  };

  const handleConfirmReassign = async () => {
    if (!reassignModal) return;
    const { targetIncidentId, teamId, teamName } = reassignModal;
    setReassignModal(null);
    const success = await assignTeam(targetIncidentId, teamId);
    if (!success) {
      showNotice("error", `Failed to reassign ${teamName}. Please verify dispatcher authorization.`);
    } else {
      showNotice("success", `Tactical unit ${teamName} successfully reassigned to ${targetIncidentId}.`);
    }
  };

  const handleUnassignTeam = async () => {
    if (!selectedIncident) return;
    if (user?.role === "Responder") {
      showNotice("error", "Unauthorized: Field Responders are not permitted to unassign tactical units.");
      return;
    }
    const success = await unassignTeam(selectedIncident.id);
    if (!success) {
      showNotice("error", "Unit unassignment rejected by server.");
    } else {
      showNotice("success", "Tactical unit unassigned and returned to available standing roster.");
    }
  };

  return (
    <GothicAtmosphere variant="incidents">
      <div className="space-y-6">
        {/* Mysterious Investigator / Crime Scene Thematic Header */}
        <div className="relative rounded-md overflow-hidden border border-[#790009]/45 bg-[#0A0B10]/95 backdrop-blur-md shadow-2xl p-5 sm:p-6 group">
          <div className="absolute inset-0 pointer-events-none opacity-30 overflow-hidden">
            <Image
              src="/artwork/gothic/haunted-cemetery-trees.webp"
              alt="Haunted Cemetery Landscape"
              fill
              className="object-cover object-[center_35%] group-hover:scale-105 transition-transform duration-1000"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0A0B10] via-[#0A0B10]/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0B10] via-transparent to-transparent" />
          </div>

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#F00018] animate-pulse" />
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#F00018] font-bold">
                  TACTICAL SURVEILLANCE & INVESTIGATION BOARD
                </span>
                <DemoBadge isCustom={true} />
              </div>
              <h1 className="font-bodoni text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-wide leading-tight uppercase">
                <span className="text-[#F2EEE9] text-distressed-ivory">LIVE </span>
                <span className="text-[#C00012] text-distressed-crimson">INCIDENTS</span>
              </h1>
              <p className="font-oswald text-xs sm:text-sm uppercase tracking-wider text-[#92929A] font-medium mt-1">
                Victorian Crime Scene Intelligence • Tactical Responder Routing & Resolution Matrix
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/report"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("vigilora:new-report"));
                  }
                }}
                className="btn-gothic-crimson px-4 py-2 rounded-md text-xs flex items-center gap-2 hover:scale-[1.02] transition-transform shadow-lg shadow-black/60 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Report Incident</span>
              </Link>
            </div>
          </div>
        </div>

        {/* In-App Status / Warning / Error Notice Banner */}
        {notice && (
          <div
            role="alert"
            className={`flex items-center justify-between gap-3 p-3.5 rounded-md border text-xs font-mono shadow-xl animate-fadeIn ${
              notice.type === "error"
                ? "bg-red-950/80 border-[#F00018]/70 text-red-200"
                : notice.type === "warning"
                ? "bg-amber-950/80 border-amber-500/70 text-amber-200"
                : "bg-emerald-950/80 border-emerald-500/70 text-emerald-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {notice.type === "error" ? (
                <AlertTriangle className="w-4 h-4 text-[#F00018] shrink-0" />
              ) : notice.type === "warning" ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{notice.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-[#92929A] hover:text-white p-1 shrink-0"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Filter and Search Bar matching master reference */}
        <div className="p-4 rounded-md bg-[#0A0B10] border border-[#790009]/30 space-y-3 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Box (5 cols) */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#92929A]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, title, zone, or keyword..."
              className="w-full pl-10 pr-4 py-2 rounded-md bg-[#050506] border border-[#790009]/30 text-[#F2EEE9] placeholder-[#92929A] text-xs sm:text-sm font-mono-plex focus:outline-none focus:border-[#C00012]"
            />
          </div>

          {/* Category Dropdown (3 cols) */}
          <div className="md:col-span-3">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#050506] border border-[#790009]/30 text-xs text-[#F2EEE9] font-oswald uppercase focus:outline-none focus:border-[#C00012]"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value} className="bg-[#0A0B10] text-[#F2EEE9]">
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Severity Dropdown (2 cols) */}
          <div className="md:col-span-2">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#050506] border border-[#790009]/30 text-xs text-[#F2EEE9] font-oswald uppercase focus:outline-none focus:border-[#C00012]"
            >
              {severities.map((sev) => (
                <option key={sev.value} value={sev.value} className="bg-[#0A0B10] text-[#F2EEE9]">
                  {sev.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By Dropdown (2 cols) */}
          <div className="md:col-span-2 flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#92929A] shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "newest" | "priority" | "oldest")}
              className="w-full px-2.5 py-2 rounded-md bg-[#050506] border border-[#790009]/30 text-xs text-[#F2EEE9] font-oswald uppercase focus:outline-none focus:border-[#C00012]"
            >
              <option value="newest" className="bg-[#0A0B10]">Sort: Newest</option>
              <option value="priority" className="bg-[#0A0B10]">Sort: Highest Severity</option>
              <option value="oldest" className="bg-[#0A0B10]">Sort: Oldest</option>
            </select>
          </div>
        </div>

        {/* Status Pill Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-2 border-t border-[#790009]/20 scrollbar-none font-oswald uppercase">
          {statuses.map((tab) => {
            const isSelected = statusFilter === tab.value;
            const count =
              tab.value === "all"
                ? incidents.length
                : incidents.filter((i) => i.status === tab.value).length;

            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? "bg-[#790009]/35 text-[#F00018] border border-[#C00012]/50 shadow-[0_0_12px_rgba(240,0,24,0.25)]"
                    : "text-[#92929A] hover:text-[#F2EEE9] hover:bg-[#790009]/15 border border-transparent"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isSelected ? "bg-[#F00018]/30 text-white" : "bg-white/5 text-[#92929A]"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Incident Grid or Empty State */}
      {filteredIncidents.length === 0 ? (
        <EmptyState
          title="No incidents match current criteria"
          description="Try resetting your keyword query or adjusting status / severity filters."
          actionLabel="Clear All Filters"
          onAction={() => {
            setSearchQuery("");
            setStatusFilter("all");
            setSeverityFilter("all");
            setCategoryFilter("all");
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIncidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              onSelect={(inc) => setSelectedIncidentId(inc.id)}
            />
          ))}
        </div>
      )}

      {/* Incident Detail & Dispatch Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-3xl max-h-[92dvh] overflow-y-auto rounded-md bg-[#0A0B10] border border-[#790009]/45 shadow-2xl p-4 sm:p-6 space-y-4 sm:space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#790009]/25 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono text-xs font-bold text-[#F00018] bg-[#790009]/20 px-2 py-0.5 rounded border border-[#790009]/40">
                    {selectedIncident.id}
                  </span>
                  <PriorityBadge severity={selectedIncident.severity} size="sm" />
                  <StatusBadge status={selectedIncident.status} size="sm" />
                  <DemoBadge isCustom={selectedIncident.isCustomReported} />
                </div>
                <h3 className="font-bodoni text-lg sm:text-xl font-bold text-[#F2EEE9]">
                  {selectedIncident.title}
                </h3>
              </div>

              <button
                onClick={() => setSelectedIncidentId(null)}
                className="p-1 rounded-md text-[#92929A] hover:text-white hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Description & Narrative */}
            <div className="space-y-4">
              <div>
                <span className="text-xs font-oswald uppercase tracking-wider font-semibold text-[#92929A]">
                  Incident Narrative
                </span>
                <p className="text-sm text-[#F2EEE9] mt-1 leading-relaxed bg-[#050506] p-3.5 rounded-md border border-[#790009]/25 font-sans">
                  {selectedIncident.description}
                </p>
              </div>

              {/* Photo Evidence if present */}
              {selectedIncident.hasPhoto && (selectedIncident.photoUrl || (selectedIncident.photoUrls && selectedIncident.photoUrls.length > 0)) && (
                <EvidenceViewer
                  photoUrl={selectedIncident.photoUrl}
                  photoUrls={selectedIncident.photoUrls}
                  incidentId={selectedIncident.id}
                  incidentTitle={selectedIncident.title}
                  incidentDate={selectedIncident.reportedAt}
                  title={selectedIncident.title}
                  variant="standard"
                />
              )}

              {/* Location & Timestamps Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-md bg-[#050506] border border-[#790009]/25 space-y-1">
                  <div className="text-[#92929A] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#F00018]" />
                    <span className="font-oswald uppercase text-[10px] tracking-wider font-semibold text-[#F2EEE9]">
                      Location Details
                    </span>
                  </div>
                  <div className="font-bold text-white font-oswald uppercase text-xs">
                    {selectedIncident.location.zone}
                  </div>
                  <div className="text-[#92929A]">
                    Building: <span className="text-[#F2EEE9]">{selectedIncident.location.building}</span>
                  </div>
                  {selectedIncident.location.landmark && (
                    <div className="text-[#92929A] text-[11px]">
                      Landmark: <span className="text-[#F2EEE9]">{selectedIncident.location.landmark}</span>
                    </div>
                  )}
                  {selectedIncident.location.coordinates ? (
                    <div className="text-[#F00018] text-[10px] font-mono">
                      Schematic Coordinates: ({selectedIncident.location.coordinates.xPercent}%, {selectedIncident.location.coordinates.yPercent}%)
                    </div>
                  ) : (
                    <div className="text-amber-400 text-[10px] font-mono">
                      Grid Coordinates: Pending Sensor Triangulation
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-md bg-[#050506] border border-[#790009]/25 space-y-1">
                  <div className="text-[#92929A] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#92929A]" />
                    <span className="font-oswald uppercase text-[10px] tracking-wider font-semibold text-[#F2EEE9]">
                      Timestamps & Origin
                    </span>
                  </div>
                  <div className="text-[#F2EEE9]">
                    Reported: {new Date(selectedIncident.reportedAt).toLocaleString()} ({formatTimeAgo(selectedIncident.reportedAt)})
                  </div>
                  <div className="text-[#92929A] text-[11px]">
                    Updated: {new Date(selectedIncident.updatedAt).toLocaleString()}
                  </div>
                  <div className="text-[#92929A] text-[11px]">
                    Reporter: {selectedIncident.reporterContact || "Anonymous Field User"}
                  </div>
                </div>
              </div>

              {/* AI Triage Confidence Score */}
              {selectedIncident.aiClassificationScore && (
                <div className="p-3 rounded-md bg-[#180306] border border-[#790009]/40 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#F2EEE9]">
                    <Bot className="w-4 h-4 text-[#F00018]" />
                    <span>AI Urgency Confidence:</span>
                    <strong className="text-white font-mono">
                      {Math.round(selectedIncident.aiClassificationScore * 100)}%
                    </strong>
                  </div>
                  <span className="text-[10px] text-[#F00018] uppercase tracking-wider font-mono">
                    GROQ LLAMA-3.3 TRIAGE READY
                  </span>
                </div>
              )}
            </div>

            {/* Tactical Actions: Change Status & Assign Team */}
            <div className="pt-4 border-t border-[#790009]/25 space-y-5">
              {/* Status Selector */}
              <div>
                <span className="block text-xs font-oswald uppercase tracking-wider font-semibold text-[#92929A] mb-2">
                  Update Operational Status
                </span>
                <div className="flex flex-wrap gap-2 font-oswald uppercase">
                  {(["Reported", "Under review", "Assigned", "Responding", "Resolved"] as IncidentStatus[]).map(
                    (st) => {
                      const isCurrent = selectedIncident.status === st;
                      return (
                        <button
                          key={st}
                          onClick={() => handleUpdateStatus(st)}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wider transition-all ${
                            isCurrent
                              ? "bg-[#790009]/35 text-[#F00018] border border-[#C00012]/60 ring-1 ring-[#C00012]/40 font-bold shadow-md"
                              : "bg-[#050506] text-[#92929A] border border-[#790009]/30 hover:border-[#C00012]/50 hover:text-white"
                          }`}
                        >
                          {st}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Response Team Assignment */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="block text-xs font-oswald uppercase tracking-wider font-semibold text-[#92929A]">
                    Response Unit Assignment
                  </span>
                  {user?.role !== "Responder" && selectedIncident.assignedTeamId && (
                    <button
                      type="button"
                      onClick={handleUnassignTeam}
                      className="text-xs text-[#F00018] hover:text-red-400 font-oswald uppercase font-semibold underline"
                    >
                      Unassign Unit
                    </button>
                  )}
                </div>

                {user?.role === "Responder" ? (
                  <div className="p-3 rounded-md border border-[#790009]/30 bg-[#0A0B10] text-xs">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-white flex items-center gap-1.5 font-oswald uppercase">
                        <Shield className="w-3.5 h-3.5 text-[#F00018]" />
                        <span>{selectedIncident.assignedResponder || "Assigned Tactical Unit"}</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#041a0d] text-[#00CC66] border border-[#00CC66]/40 font-bold">
                        {selectedIncident.assignedTeamId || "MED-01"}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#92929A] mt-1.5 font-oswald uppercase tracking-wider">
                      Unit reassignment and roster management restricted to Dispatcher and Administrator.
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                    {teams.map((team) => {
                      const isAssignedToThis = selectedIncident.assignedTeamId === team.id;
                      const isBusyWithOther =
                        team.activeIncidentId && team.activeIncidentId !== selectedIncident.id;

                      return (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => handleAssignTeam(team.id)}
                          className={`p-3 rounded-md border text-left text-xs transition-all flex items-center justify-between ${
                            isAssignedToThis
                              ? "bg-[#041a0d]/60 border-emerald-500/50 text-[#00CC66] ring-1 ring-emerald-500/40"
                              : "bg-[#050506] border-[#790009]/30 text-[#92929A] hover:border-[#C00012]/50 hover:text-[#F2EEE9]"
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold text-white flex items-center gap-1.5 truncate font-oswald uppercase">
                              <Shield className="w-3.5 h-3.5 text-[#F00018]" />
                              <span className="truncate">{team.name}</span>
                            </div>
                            <div className="text-[10px] text-[#92929A] truncate font-mono">
                              {team.callsign} • {team.currentZone}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {isAssignedToThis ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#041a0d] text-[#00CC66] border border-[#00CC66]/40 font-bold block">
                                ASSIGNED
                              </span>
                            ) : isBusyWithOther ? (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#7A1F0D]/40 text-[#FB923C] border border-[#EA580C]/40 block">
                                BUSY ({team.activeIncidentId})
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#111A29] text-[#92929A] block border border-[#790009]/30">
                                {team.status}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Activity History for This Incident */}
              <div className="pt-3 border-t border-[#790009]/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-oswald uppercase tracking-wider font-semibold text-[#F2EEE9]">
                  <History className="w-4 h-4 text-[#F00018]" />
                  <span>Incident Audit & Dispatch History</span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {incidentActivities.length === 0 ? (
                    <div className="text-xs text-[#92929A] italic p-2 bg-[#050506] rounded-md">
                      No activity events logged yet for this incident.
                    </div>
                  ) : (
                    incidentActivities.map((act) => (
                      <div
                        key={act.id}
                        className="p-2.5 rounded-md bg-[#050506] border border-[#790009]/25 text-xs space-y-1 font-mono-plex"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-[#F2EEE9]">
                            {act.action}
                          </span>
                          <span className="text-[#92929A] font-mono text-[10px]">
                            {act.timestamp}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[#92929A]">
                          <span>Actor: {act.actor}</span>
                          <span>•</span>
                          <span className="font-mono text-[#F00018]">
                            {act.actorRole}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-[#790009]/20 flex items-center justify-between">
              <span className="text-[11px] text-[#92929A] font-mono">
                AWS DynamoDB & S3 Secure Dispatch Grid
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedIncidentId(null)}
              >
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Reassign Tactical Unit Confirmation Modal */}
      {reassignModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reassign-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
        >
          <div className="w-full max-w-md p-5 rounded-md bg-[#0A0B10] border border-[#790009]/60 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#790009]/30">
              <div className="flex items-center gap-2">
                <Users2 className="w-4 h-4 text-[#F00018]" />
                <h3 id="reassign-dialog-title" className="text-sm font-oswald uppercase font-bold tracking-wider text-[#F2EEE9]">
                  Confirm Tactical Reassignment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReassignModal(null)}
                className="text-[#92929A] hover:text-white p-1"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#92929A] leading-relaxed">
              <strong className="text-white">{reassignModal.teamName}</strong> is currently engaged with incident{" "}
              <strong className="text-[#F00018] font-mono">{reassignModal.currentIncidentId}</strong>.
              <br /><br />
              Are you sure you want to redirect this tactical unit to incident{" "}
              <strong className="text-[#F00018] font-mono">{reassignModal.targetIncidentId}</strong>?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setReassignModal(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleConfirmReassign}
              >
                Reassign Unit
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </GothicAtmosphere>
  );
}
