"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { User, X, Filter, ArrowRight, Radio, LayoutList, Crosshair } from "lucide-react";
import { IncidentSeverity } from "@/types/incident";
import { IncidentTrendChart } from "@/components/dashboard/IncidentTrendChart";
import { IncidentActivityHeatmap } from "@/components/dashboard/IncidentActivityHeatmap";
import { IncidentDataTable } from "@/components/dashboard/IncidentDataTable";
import { TacticalMap } from "@/components/dashboard/TacticalMap";
import { RightInspector } from "@/components/dashboard/RightInspector";
import { GothicAtmosphere } from "@/components/ui/GothicAtmosphere";
import { useIncidents } from "@/context/IncidentContext";
import { useAuth } from "@/context/AuthContext";
import { getRolePresentation } from "@/lib/role-utils";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { incidents, metrics } = useIncidents();
  const { user } = useAuth();
  const rolePresentation = getRolePresentation(user?.role);

  // Filters & State (Default: All severities shown, search empty, all categories & statuses)
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverities, setSelectedSeverities] = useState<IncidentSeverity[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedStatus, setSelectedStatus] = useState("All Statuses");
  const [activeUserFilter, setActiveUserFilter] = useState<string | null>(null);

  // Reset filters to pristine default state on fresh login or user session change
  useEffect(() => {
    setSearchQuery("");
    setSelectedSeverities([]);
    setSelectedCategory("All Categories");
    setSelectedStatus("All Statuses");
    setActiveUserFilter(null);
  }, [user?.email]);

  // Derive date range dynamically from live incident telemetry
  const dateRange = useMemo(() => {
    if (!incidents || incidents.length === 0) {
      return "No Telemetry Recorded";
    }
    const timestamps = incidents
      .map((i) => (i.reportedAt ? new Date(i.reportedAt).getTime() : NaN))
      .filter((t) => !isNaN(t));

    if (timestamps.length === 0) {
      return "Current Dispatch Session";
    }

    const minDate = new Date(Math.min(...timestamps));
    const maxDate = new Date(Math.max(...timestamps));

    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

    return fmt(minDate) === fmt(maxDate)
      ? `${fmt(minDate)} (Active Session)`
      : `${fmt(minDate)} – ${fmt(maxDate)}`;
  }, [incidents]);

  // Dynamic filter label chip
  const statusChipLabel = useMemo(() => {
    if (selectedSeverities.length > 0) {
      return `Severity: ${selectedSeverities.join(", ")}`;
    }
    if (selectedStatus !== "All Statuses") {
      return `Status: ${selectedStatus}`;
    }
    return null;
  }, [selectedSeverities, selectedStatus]);

  // Determine if any non-default filter is currently active
  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim().length > 0 ||
      selectedSeverities.length > 0 ||
      selectedCategory !== "All Categories" ||
      selectedStatus !== "All Statuses" ||
      activeUserFilter !== null
    );
  }, [searchQuery, selectedSeverities, selectedCategory, selectedStatus, activeUserFilter]);

  const [viewMode, setViewMode] = useState<"queue" | "map">("queue");

  // Selection state
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const selectedIncident = useMemo(() => {
    if (selectedIncidentId) {
      return incidents.find((i) => i.id === selectedIncidentId) || incidents[0] || null;
    }
    return incidents[0] || null;
  }, [incidents, selectedIncidentId]);

  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [inspectorOpenMobile, setInspectorOpenMobile] = useState(false);

  // Filtered incident list for table
  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = inc.id.toLowerCase().includes(q);
        const matchesTitle = inc.title.toLowerCase().includes(q);
        const matchesLoc =
          inc.location.zone.toLowerCase().includes(q) ||
          (inc.location.building ? inc.location.building.toLowerCase().includes(q) : false);
        if (!matchesId && !matchesTitle && !matchesLoc) return false;
      }

      // Severity checkboxes (if any selected)
      if (selectedSeverities.length > 0) {
        if (!selectedSeverities.includes(inc.severity)) return false;
      }

      // Category dropdown
      if (selectedCategory !== "All Categories") {
        if (!inc.category.toLowerCase().includes(selectedCategory.toLowerCase())) {
          return false;
        }
      }

      // Status dropdown
      if (selectedStatus !== "All Statuses") {
        if (!inc.status.toLowerCase().includes(selectedStatus.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [incidents, searchQuery, selectedSeverities, selectedCategory, selectedStatus]);

  const handleToggleSeverity = useCallback((severity: IncidentSeverity) => {
    setSelectedSeverities((prev) =>
      prev.includes(severity)
        ? prev.filter((s) => s !== severity)
        : [...prev, severity]
    );
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedSeverities([]);
    setSelectedCategory("All Categories");
    setSelectedStatus("All Statuses");
    setActiveUserFilter(null);
  }, []);

  const handleApplyFilters = () => {
    // Applied automatically via reactive state
    setInspectorOpenMobile(false);
  };

  const handleToggleCheck = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleCheckAll = () => {
    if (checkedIds.length === filteredIncidents.length) {
      setCheckedIds([]);
    } else {
      setCheckedIds(filteredIncidents.map((i) => i.id));
    }
  };

  return (
    <GothicAtmosphere variant="dashboard">
      <div className="space-y-6">
        {/* Master Reference Feature: THE INCIDENT COMMAND Hero Banner */}
        <div className="relative rounded-lg overflow-hidden border border-[#790009]/45 bg-[#0A0B10]/95 backdrop-blur-md shadow-2xl p-5 sm:p-6 group">
          {/* Subtle Artwork Underlay for the banner */}
          <div className="absolute inset-0 pointer-events-none opacity-25 overflow-hidden">
            <Image
              src="/artwork/gothic/haunted-cemetery-trees.webp"
              alt="Haunted Gothic Cemetery Landscape"
              fill
              className="object-cover object-center group-hover:scale-105 transition-transform duration-1000"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0A0B10] via-[#0A0B10]/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0B10] via-transparent to-transparent" />
          </div>

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#F00018] animate-pulse" />
                <span className="text-[11px] font-oswald uppercase tracking-widest text-[#F00018] font-bold">
                  Nocturnal Surveillance Active • Central Grid
                </span>
              </div>
              <h1 className="font-bodoni text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-wide leading-tight uppercase">
                <span className="text-[#F2EEE9] text-distressed-ivory">THE INCIDENT </span>
                <span className="text-[#C00012] text-distressed-crimson">COMMAND</span>
              </h1>
              <p className="font-oswald text-xs sm:text-sm uppercase tracking-wider text-[#92929A] font-medium mt-1 max-w-xl">
                Real-time campus incident monitoring and emergency response coordination
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/report"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("vigilora:new-report"));
                  }
                }}
                className="btn-gothic-crimson px-5 py-2.5 rounded-md text-xs flex items-center gap-2 hover:scale-[1.02] transition-transform shadow-lg shadow-black/60 cursor-pointer"
              >
                <span>Report Incident</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/incidents"
                className="btn-gothic-charcoal px-5 py-2.5 rounded-md text-xs flex items-center gap-2 cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 text-[#F00018]" />
                <span>View Live Incidents</span>
              </Link>
            </div>
          </div>
        </div>

        {/* 1. Header Section: COMMAND CENTRE / Active Filter Tags */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1 border-b border-[#790009]/25">
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <h2 className="font-bodoni text-xl sm:text-2xl font-bold tracking-wider text-distressed-ivory uppercase">
                COMMAND CENTRE
              </h2>
              {user && (
                <div
                  id="command-centre-role-indicator"
                  title={`${rolePresentation.label}: ${rolePresentation.description}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] sm:text-[11px] font-mono tracking-wider uppercase font-bold transition-all",
                    rolePresentation.badgeStyle.bg,
                    rolePresentation.badgeStyle.text,
                    rolePresentation.badgeStyle.border,
                    rolePresentation.badgeStyle.glow
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current" />
                  <span>{rolePresentation.badgeText}</span>
                  <span className="hidden md:inline text-[#92929A] font-normal normal-case font-oswald text-xs">
                    • {rolePresentation.description}
                  </span>
                </div>
              )}
            </div>
            <p className="font-oswald text-xs uppercase tracking-widest text-[#92929A] font-semibold mt-0.5">
              Incident Intelligence • Central Campus Sector
            </p>
          </div>

          {/* Top Active Filter Tags, View Switcher & Mobile Inspector Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Quick Switcher */}
            <div className="inline-flex items-center bg-[#0A0B10] p-1 rounded-md border border-[#790009]/40 shadow-inner">
              <button
                type="button"
                onClick={() => setViewMode("queue")}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-oswald uppercase tracking-wider transition-all cursor-pointer ${
                  viewMode === "queue"
                    ? "bg-gradient-to-r from-[#C00012] to-[#790009] text-white border border-[#F00018]/50 shadow-[0_0_10px_rgba(192,0,18,0.4)] font-bold"
                    : "text-[#92929A] hover:text-[#F2EEE9]"
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Queue</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-oswald uppercase tracking-wider transition-all cursor-pointer ${
                  viewMode === "map"
                    ? "bg-gradient-to-r from-[#C00012] to-[#790009] text-white border border-[#F00018]/50 shadow-[0_0_10px_rgba(192,0,18,0.4)] font-bold"
                    : "text-[#92929A] hover:text-[#F2EEE9]"
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Tactical Map</span>
              </button>
            </div>

            {/* Tag: Operator Name */}
            {activeUserFilter && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0A0B10] border border-[#790009]/40 text-xs text-[#F2EEE9] font-oswald uppercase shadow-md">
                <User className="w-3 h-3 text-[#92929A]" />
                <span>Operator: {activeUserFilter}</span>
                <button
                  type="button"
                  onClick={() => setActiveUserFilter(null)}
                  className="text-[#92929A] hover:text-white ml-0.5 cursor-pointer"
                  title="Clear operator filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Tag: Dynamic Severity / Status Chip */}
            {statusChipLabel && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#180306] border border-[#F00018]/50 text-xs text-[#F00018] font-oswald uppercase font-semibold shadow-[0_0_10px_rgba(240,0,24,0.2)]">
                <span>{statusChipLabel}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSeverities([]);
                    setSelectedStatus("All Statuses");
                  }}
                  className="text-[#F00018] hover:text-white ml-0.5 cursor-pointer"
                  title="Clear filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Tag: Clear All Filters action */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#790009]/30 border border-[#F00018]/60 text-xs text-[#F00018] hover:text-white hover:bg-[#790009]/50 font-oswald uppercase font-semibold cursor-pointer transition-all shadow-[0_0_10px_rgba(240,0,24,0.2)]"
                title="Clear all active filters"
                id="clear-all-filters-btn"
              >
                <X className="w-3 h-3" />
                <span>Clear All Filters</span>
              </button>
            )}

            {/* Mobile Filter Inspector Toggle Button */}
            <button
              type="button"
              onClick={() => setInspectorOpenMobile(!inspectorOpenMobile)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#0A0B10] border border-[#790009]/40 text-xs text-[#F00018] hover:text-white font-oswald uppercase cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
            </button>
          </div>
        </div>

        {/* KPI Strip matching master visual reference */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          <div className="p-3 sm:p-3.5 rounded-md bg-[#0A0B10] border border-[#790009]/35 flex flex-col justify-between shadow-xl hover:border-[#C00012]/40 transition-colors">
            <div className="text-xl sm:text-3xl font-extrabold font-mono text-[#F2EEE9] tracking-tight">
              {metrics.totalIncidents}
            </div>
            <div className="text-[10px] sm:text-[11px] font-oswald uppercase tracking-wider text-[#92929A] font-medium mt-1">
              Total Incidents
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-md bg-[#0A0B10] border border-[#790009]/35 flex flex-col justify-between shadow-xl hover:border-[#C00012]/40 transition-colors">
            <div className="text-xl sm:text-3xl font-extrabold font-mono text-[#F2EEE9] tracking-tight">
              {metrics.activeIncidents}
            </div>
            <div className="text-[10px] sm:text-[11px] font-oswald uppercase tracking-wider text-[#92929A] font-medium mt-1">
              Active
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-md bg-[#180306] border border-[#F00018]/60 shadow-[0_0_18px_rgba(240,0,24,0.3)] flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-[#F00018] animate-pulse" />
            <div className="text-xl sm:text-3xl font-extrabold font-mono text-[#F00018] tracking-tight">
              {metrics.criticalIncidents}
            </div>
            <div className="text-[10px] sm:text-[11px] font-oswald uppercase tracking-wider text-[#F00018] font-bold mt-1">
              Critical
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-md bg-[#0A0B10] border border-[#790009]/35 flex flex-col justify-between shadow-xl hover:border-[#C00012]/40 transition-colors">
            <div className="text-xl sm:text-3xl font-extrabold font-mono text-[#F2EEE9] tracking-tight">
              {metrics.resolvedIncidents}
            </div>
            <div className="text-[10px] sm:text-[11px] font-oswald uppercase tracking-wider text-[#92929A] font-medium mt-1">
              Resolved
            </div>
          </div>

          <div
            className="col-span-2 sm:col-span-1 p-3 sm:p-3.5 rounded-md bg-[#0A0B10] border border-[#790009]/35 flex flex-col justify-between shadow-xl hover:border-[#C00012]/40 transition-colors"
            title={metrics.responseTelemetryExplanation || "Average time from incident reporting to the first verified dispatch, calculated from genuine persisted incident records only."}
          >
            <div>
              <div className="text-xl sm:text-3xl font-extrabold font-mono text-[#F2EEE9] tracking-tight">
                {metrics.avgResponseTimeMinutes !== null ? `${metrics.avgResponseTimeMinutes}m` : "--"}
              </div>
              <div className="text-[10px] sm:text-[11px] font-oswald uppercase tracking-wider text-[#92929A] font-medium mt-1">
                Avg Response
              </div>
            </div>
            {metrics.avgResponseTimeMinutes !== null ? (
              <div className="mt-1 text-[9px] font-mono text-emerald-400">
                {metrics.eligibleCount} verified incident{metrics.eligibleCount === 1 ? "" : "s"}
              </div>
            ) : (
              <div className="mt-1 flex flex-col gap-0.5">
                <span className="text-[8px] sm:text-[9px] font-mono text-[#F00018] font-semibold tracking-wider leading-tight">
                  INSUFFICIENT VERIFIED RESPONSE DATA
                </span>
                <span className="text-[8px] sm:text-[9px] font-mono text-[#92929A]">
                  0 eligible incidents
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Main 2-Column Responsive Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Central Workspace: Large Trend Chart + Heatmap + Data Table (8-9 Cols on large desktop) */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-5 min-w-0">
            {/* Chart 1: Large Incident Trend Chart */}
            <section aria-label="Incident Trend Over Time">
              <IncidentTrendChart />
            </section>

            {/* Chart 2: Incident Activity Heatmap (Incident Status Distribution) */}
            <section aria-label="Incident Activity Heatmap">
              <IncidentActivityHeatmap />
            </section>

            {/* Section 3: High-Density Incident Data Table OR Campus Tactical Map */}
            <section
              aria-label={viewMode === "queue" ? "Incident Data Table" : "Campus Tactical Map"}
              className="space-y-3"
            >
              {/* View Mode Header Bar with Toggle Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-1">
                <div>
                  <h3 className="font-bodoni text-lg font-bold text-distressed-ivory tracking-wider uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#F00018] animate-pulse" />
                    {viewMode === "queue" ? "INCIDENT DISPATCH QUEUE" : "CAMPUS TACTICAL MAP"}
                  </h3>
                  <p className="font-oswald text-xs uppercase tracking-wider text-[#92929A]">
                    {viewMode === "queue"
                      ? "High-density incident register • Active criteria filtered"
                      : "Interactive spatial schematic • Live beacon telemetry"}
                  </p>
                </div>

                {/* View Switcher Toggle */}
                <div className="inline-flex items-center bg-[#0A0B10] p-1 rounded-md border border-[#790009]/40 shadow-inner shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewMode("queue")}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-md text-xs font-oswald uppercase tracking-wider transition-all cursor-pointer ${
                      viewMode === "queue"
                        ? "bg-gradient-to-r from-[#C00012] to-[#790009] text-white border border-[#F00018]/50 shadow-[0_0_10px_rgba(192,0,18,0.4)] font-bold"
                        : "text-[#92929A] hover:text-[#F2EEE9]"
                    }`}
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Queue View</span>
                    <span className="inline xs:hidden">Queue</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("map")}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-md text-xs font-oswald uppercase tracking-wider transition-all cursor-pointer ${
                      viewMode === "map"
                        ? "bg-gradient-to-r from-[#C00012] to-[#790009] text-white border border-[#F00018]/50 shadow-[0_0_10px_rgba(192,0,18,0.4)] font-bold"
                        : "text-[#92929A] hover:text-[#F2EEE9]"
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Tactical Map View</span>
                    <span className="inline xs:hidden">Map</span>
                  </button>
                </div>
              </div>

              {/* View Mode Content */}
              {viewMode === "queue" ? (
                <IncidentDataTable
                  incidents={filteredIncidents}
                  selectedIncidentId={selectedIncident?.id ?? null}
                  onSelectIncident={(inc) => setSelectedIncidentId(inc.id)}
                  checkedIds={checkedIds}
                  onToggleCheck={handleToggleCheck}
                  onToggleCheckAll={handleToggleCheckAll}
                  onClearFilters={handleResetFilters}
                />
              ) : (
                <TacticalMap
                  incidents={filteredIncidents}
                  selectedIncidentId={selectedIncident?.id ?? null}
                  onSelectIncident={(inc) => setSelectedIncidentId(inc.id)}
                />
              )}
            </section>
          </div>

          {/* Right Inspector Drawer (Mobile: Slide-Over Modal with Backdrop) */}
          {inspectorOpenMobile && (
            <div
              className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm lg:hidden transition-opacity flex justify-end"
              onClick={() => setInspectorOpenMobile(false)}
            >
              <div
                className="relative w-full max-w-sm h-full bg-[#0A0B10] border-l border-[#790009]/50 shadow-2xl p-4 overflow-y-auto space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-2 border-b border-[#790009]/30">
                  <span className="text-xs font-oswald uppercase tracking-wider font-bold text-[#F2EEE9]">
                    Incident Inspector Terminal
                  </span>
                  <button
                    type="button"
                    onClick={() => setInspectorOpenMobile(false)}
                    className="p-1 rounded-md text-[#92929A] hover:text-white hover:bg-white/5"
                    aria-label="Close Inspector"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <RightInspector
                  idPrefix="mobile-"
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  selectedSeverities={selectedSeverities}
                  onToggleSeverity={handleToggleSeverity}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  selectedStatus={selectedStatus}
                  onSelectStatus={setSelectedStatus}
                  dateRange={dateRange}
                  onResetFilters={handleResetFilters}
                  onApplyFilters={handleApplyFilters}
                  selectedIncident={selectedIncident}
                />
              </div>
            </div>
          )}

          {/* Desktop Inspector Column (3-4 Cols on large desktop) */}
          <div className="hidden lg:block lg:col-span-4 xl:col-span-3">
            <div className="sticky top-20">
              <RightInspector
                idPrefix="desktop-"
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedSeverities={selectedSeverities}
                onToggleSeverity={handleToggleSeverity}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                selectedStatus={selectedStatus}
                onSelectStatus={setSelectedStatus}
                dateRange={dateRange}
                onResetFilters={handleResetFilters}
                onApplyFilters={handleApplyFilters}
                selectedIncident={selectedIncident}
              />
            </div>
          </div>
        </div>
      </div>
    </GothicAtmosphere>
  );
}
