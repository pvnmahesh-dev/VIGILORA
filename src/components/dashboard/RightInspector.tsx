"use client";

import React from "react";
import Link from "next/link";
import {
  Filter,
  Search,
  Calendar,
  FileText,
  MapPin,
  Clock,
  User,
  ArrowRight,
  ChevronDown,
  Check,
} from "lucide-react";
import { Incident, IncidentSeverity } from "@/types/incident";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { EvidenceViewer } from "@/components/evidence/EvidenceViewer";

interface RightInspectorProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedSeverities: IncidentSeverity[];
  onToggleSeverity: (severity: IncidentSeverity) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  selectedStatus: string;
  onSelectStatus: (status: string) => void;
  dateRange: string;
  onResetFilters: () => void;
  onApplyFilters: () => void;
  selectedIncident: Incident | null;
  className?: string;
  idPrefix?: string;
}

export function RightInspector({
  searchQuery,
  onSearchChange,
  selectedSeverities,
  onToggleSeverity,
  selectedCategory,
  onSelectCategory,
  selectedStatus,
  onSelectStatus,
  dateRange,
  onResetFilters,
  onApplyFilters,
  selectedIncident,
  className = "",
  idPrefix = "",
}: RightInspectorProps) {
  const categories = [
    "All Categories",
    "Medical",
    "Security",
    "Fire and Hazard",
    "Crowd Management",
    "Suspicious Activity",
    "Infrastructure",
    "Missing Person",
  ];

  const statuses = [
    "All Statuses",
    "Reported",
    "Under Review",
    "Assigned",
    "Responding",
    "Resolved",
  ];

  return (
    <aside
      className={`w-full lg:w-80 flex flex-col gap-5 p-4 sm:p-5 rounded-md bg-[#0A0B10] border border-[#790009]/35 shadow-2xl text-xs text-[#F2EEE9] ${className}`}
    >
      {/* 1. Header: Filters */}
      <div className="flex items-center gap-2 pb-3 border-b border-[#790009]/25">
        <Filter className="w-4 h-4 text-[#F00018]" />
        <h3 className="text-sm font-oswald uppercase tracking-wider font-bold text-[#F2EEE9]">
          Filters
        </h3>
      </div>

      {/* 2. Search Input */}
      <div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#92929A] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by ID, title or location..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-md bg-[#050506] border border-[#790009]/30 text-[#F2EEE9] placeholder-[#92929A] text-xs font-mono-plex focus:outline-none focus:border-[#C00012] transition-colors"
          />
        </div>
      </div>

      {/* 3. Severity Checkbox Grid (2x2 matching reference) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-[11px] font-oswald uppercase tracking-wider font-semibold text-[#92929A]">
            Severity
          </label>
          {selectedSeverities.length > 0 && (
            <button
              type="button"
              onClick={() => {
                selectedSeverities.forEach((s) => onToggleSeverity(s));
              }}
              className="text-[10px] font-oswald uppercase text-[#F00018] hover:text-white transition-colors cursor-pointer"
              title="Clear severity selection"
            >
              Clear ({selectedSeverities.length})
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 font-oswald uppercase text-xs" role="group" aria-label="Filter by Severity">
          {(
            [
              { id: "Critical" as const, label: "Critical", dotColor: "bg-[#C00012]" },
              { id: "High" as const, label: "High", dotColor: "bg-[#FF7700]" },
              { id: "Medium" as const, label: "Medium", dotColor: "bg-[#FFCC00]" },
              { id: "Low" as const, label: "Low", dotColor: "bg-[#00CC66]" },
            ]
          ).map(({ id, label, dotColor }) => {
            const isChecked = selectedSeverities.includes(id);
            const inputId = `${idPrefix}severity-filter-${id.toLowerCase()}`;
            return (
              <label
                key={id}
                htmlFor={inputId}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-md border transition-all cursor-pointer select-none ${
                  isChecked
                    ? "bg-[#790009]/35 border-[#C00012]/70 text-white shadow-[0_0_10px_rgba(192,0,18,0.25)]"
                    : "bg-[#050506] border-[#790009]/35 text-[#92929A] hover:text-[#F2EEE9] hover:border-[#790009]/80"
                }`}
              >
                <div className="relative flex items-center justify-center shrink-0">
                  <input
                    type="checkbox"
                    id={inputId}
                    name="severity"
                    value={id}
                    checked={isChecked}
                    onChange={() => onToggleSeverity(id)}
                    className="w-4 h-4 rounded appearance-none border transition-all cursor-pointer bg-[#050506] border-[#790009]/60 checked:bg-[#790009] checked:border-[#C00012] focus:outline-none focus:ring-1 focus:ring-[#C00012]"
                  />
                  {isChecked && (
                    <Check className="w-3 h-3 text-white stroke-[3] absolute pointer-events-none" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                  <span className={`truncate ${isChecked ? "font-bold text-white" : "font-medium"}`}>
                    {label}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* 4. Category Selector Dropdown */}
      <div>
        <label className="block text-[11px] font-oswald uppercase tracking-wider font-semibold text-[#92929A] mb-1.5">
          Category
        </label>
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => onSelectCategory(e.target.value)}
            className="w-full appearance-none px-3 py-2 rounded-md bg-[#050506] border border-[#790009]/30 text-[#F2EEE9] text-xs focus:outline-none focus:border-[#C00012] cursor-pointer pr-8 font-oswald uppercase"
          >
            {categories.map((c) => (
              <option key={c} value={c} className="bg-[#0A0B10] text-[#F2EEE9]">
                {c}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-[#92929A] absolute right-3 top-2.5 pointer-events-none" />
        </div>
      </div>

      {/* 5. Status Selector Dropdown */}
      <div>
        <label className="block text-[11px] font-oswald uppercase tracking-wider font-semibold text-[#92929A] mb-1.5">
          Status
        </label>
        <div className="relative">
          <select
            value={selectedStatus}
            onChange={(e) => onSelectStatus(e.target.value)}
            className="w-full appearance-none px-3 py-2 rounded-md bg-[#050506] border border-[#790009]/30 text-[#F2EEE9] text-xs focus:outline-none focus:border-[#C00012] cursor-pointer pr-8 font-oswald uppercase"
          >
            {statuses.map((s) => (
              <option key={s} value={s} className="bg-[#0A0B10] text-[#F2EEE9]">
                {s}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-[#92929A] absolute right-3 top-2.5 pointer-events-none" />
        </div>
      </div>

      {/* 6. Date Range Picker */}
      <div>
        <label className="block text-[11px] font-oswald uppercase tracking-wider font-semibold text-[#92929A] mb-1.5">
          Date Range
        </label>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#050506] border border-[#790009]/30 text-[#F2EEE9] text-xs">
          <Calendar className="w-3.5 h-3.5 text-[#92929A]" />
          <span className="font-mono text-[11px]">{dateRange}</span>
        </div>
      </div>

      {/* 7. Action Buttons [ Clear All Filters ] & [ Apply Filters ] */}
      <div className="grid grid-cols-2 gap-2.5 pt-1">
        <button
          type="button"
          onClick={onResetFilters}
          className="btn-gothic-charcoal py-2 text-xs font-oswald uppercase tracking-wider"
          title="Reset all filters to default"
          id="inspector-clear-filters-btn"
        >
          Clear All Filters
        </button>
        <button
          type="button"
          onClick={onApplyFilters}
          className="btn-gothic-crimson py-2 text-xs font-oswald uppercase tracking-wider"
        >
          Apply Filters
        </button>
      </div>

      {/* 8. Selected Incident Card */}
      {selectedIncident && (
        <div
          key={selectedIncident.id}
          className="mt-2 p-3.5 rounded-md bg-[#111A29]/70 border border-[#790009]/40 space-y-3 relative overflow-hidden shadow-lg animate-page-enter card-interactive"
        >
          <div className="flex items-center justify-between pb-2 border-b border-[#790009]/25">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-[#F00018]" />
              <span className="text-[11px] font-oswald uppercase tracking-wider font-bold text-[#F2EEE9]">
                Selected Incident
              </span>
            </div>
            <PriorityBadge severity={selectedIncident.severity} size="sm" showIcon={false} />
          </div>

          <div>
            <div className="font-mono font-bold text-xs text-white">
              {selectedIncident.id}
            </div>
            <div className="font-medium text-xs text-[#F2EEE9] mt-1 line-clamp-2">
              {selectedIncident.title}
            </div>
          </div>

          <div className="space-y-1.5 text-[11px] text-[#92929A]">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-[#790009] shrink-0" />
              <span className="truncate">
                {selectedIncident.location.zone} • {selectedIncident.location.building}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#92929A] shrink-0" />
              <span>
                {selectedIncident.reportedAt
                  ? new Date(selectedIncident.reportedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Just now"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-[#92929A] shrink-0" />
              <span className="truncate">
                {selectedIncident.assignedResponder || "Dispatch Queue"}
              </span>
            </div>
          </div>

          {/* In-Context Evidence Photographic Preview */}
          {selectedIncident.hasPhoto && (selectedIncident.photoUrl || (selectedIncident.photoUrls && selectedIncident.photoUrls.length > 0)) && (
            <div className="pt-1">
              <EvidenceViewer
                photoUrl={selectedIncident.photoUrl}
                photoUrls={selectedIncident.photoUrls}
                incidentId={selectedIncident.id}
                incidentTitle={selectedIncident.title}
                incidentDate={selectedIncident.reportedAt}
                title={selectedIncident.title}
                variant="compact"
              />
            </div>
          )}

          <Link
            href={`/incidents`}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-md border border-[#790009]/40 hover:border-[#C00012] bg-[#790009]/20 hover:bg-[#790009]/40 text-[#F2EEE9] font-oswald uppercase tracking-wider font-semibold text-xs transition-all"
          >
            <span>View Full Details</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </aside>
  );
}
