"use client";

import React from "react";
import {
  Clock,
  MapPin,
  HeartPulse,
  Flame,
  Shield,
  Users,
  UserX,
  AlertCircle,
} from "lucide-react";
import { Incident, IncidentSeverity, IncidentStatus } from "@/types/incident";
import { cn } from "@/lib/utils";

interface IncidentDataTableProps {
  incidents: Incident[];
  selectedIncidentId: string | null;
  onSelectIncident: (incident: Incident) => void;
  checkedIds: string[];
  onToggleCheck: (id: string) => void;
  onToggleCheckAll: () => void;
  onClearFilters?: () => void;
}

function getCategoryIcon(category: string) {
  switch (category.toLowerCase()) {
    case "medical emergency":
    case "medical":
      return <HeartPulse className="w-3.5 h-3.5 text-pink-400" />;
    case "fire & hazard":
    case "infrastructure":
      return <Flame className="w-3.5 h-3.5 text-orange-400" />;
    case "security & safety":
    case "security":
      return <Shield className="w-3.5 h-3.5 text-cyan-400" />;
    case "crowd disturbance":
    case "crowd":
      return <Users className="w-3.5 h-3.5 text-amber-400" />;
    case "lost person / minor":
    case "missing person":
      return <UserX className="w-3.5 h-3.5 text-violet-400" />;
    default:
      return <AlertCircle className="w-3.5 h-3.5 text-zinc-400" />;
  }
}

function formatCategoryShort(category: string): string {
  if (category.toLowerCase().includes("medical")) return "Medical";
  if (category.toLowerCase().includes("fire") || category.toLowerCase().includes("infra")) return "Infrastructure";
  if (category.toLowerCase().includes("security")) return "Security";
  if (category.toLowerCase().includes("crowd")) return "Crowd";
  if (category.toLowerCase().includes("lost") || category.toLowerCase().includes("person")) return "Missing Person";
  return category;
}

function renderSeverityBadge(severity: IncidentSeverity) {
  switch (severity) {
    case "Critical":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-oswald uppercase tracking-wider font-bold bg-[#790009]/35 text-[#F00018] border border-[#C00012]/60 shadow-[0_0_8px_rgba(240,0,24,0.3)] animate-critical-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F00018] animate-critical-pulse" />
          <span>Critical</span>
        </span>
      );
    case "High":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-oswald uppercase tracking-wider font-bold bg-[#7A1F0D]/30 text-[#FF7700] border border-[#FF7700]/50">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF7700]" />
          <span>High</span>
        </span>
      );
    case "Medium":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-oswald uppercase tracking-wider font-bold bg-[#5C3B0D]/30 text-[#FFCC00] border border-[#FFCC00]/45">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FFCC00]" />
          <span>Medium</span>
        </span>
      );
    case "Low":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-oswald uppercase tracking-wider font-bold bg-[#041a0d]/40 text-[#00CC66] border border-[#00CC66]/40">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00CC66]" />
          <span>Low</span>
        </span>
      );
  }
}

function renderStatusBadge(status: IncidentStatus | string) {
  switch (status) {
    case "Responding":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-oswald uppercase tracking-wider font-semibold bg-[#7A1F0D]/30 text-[#FB923C] border border-[#EA580C]/50 shadow-[0_0_8px_rgba(234,88,12,0.2)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FB923C] animate-active-pulse" />
          <span>Responding</span>
        </span>
      );
    case "Assigned":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-oswald uppercase tracking-wider font-semibold bg-[#3B0764]/40 text-[#C084FC] border border-[#A855F7]/40">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C084FC]" />
          <span>Assigned</span>
        </span>
      );
    case "Under review":
    case "Under Review":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-oswald uppercase tracking-wider font-semibold bg-[#1E1B4B]/35 text-[#818CF8] border border-[#6366F1]/40">
          <span className="w-1.5 h-1.5 rounded-full bg-[#818CF8]" />
          <span>Under Review</span>
        </span>
      );
    case "Resolved":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-oswald uppercase tracking-wider font-semibold bg-[#052E16]/40 text-[#4ADE80] border border-[#22C55E]/40">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80]" />
          <span>Resolved</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-oswald uppercase tracking-wider font-semibold bg-[#111A29] text-[#92929A] border border-[#92929A]/30">
          <span className="w-1.5 h-1.5 rounded-full bg-[#92929A]" />
          <span>Reported</span>
        </span>
      );
  }
}

function formatReportedTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return "12:00:00 PM";
  }
}

export function IncidentDataTable({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  checkedIds,
  onToggleCheck,
  onToggleCheckAll,
  onClearFilters,
}: IncidentDataTableProps) {
  const allChecked =
    incidents.length > 0 && checkedIds.length === incidents.length;

  return (
    <div className="w-full rounded-md bg-[#0A0B10] border border-[#790009]/35 shadow-2xl overflow-hidden">
      {/* Desktop / Tablet High-Density 9-Column Table (>= md) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          {/* Header Row */}
          <thead>
            <tr className="border-b border-[#790009]/30 bg-[#111A29]/80 text-[#92929A] font-oswald uppercase tracking-wider text-[11px]">
              <th className="py-3 px-3.5 w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={onToggleCheckAll}
                  className="rounded border-[#790009]/50 bg-[#050506] text-[#C00012] focus:ring-0 focus:outline-none cursor-pointer"
                />
              </th>
              <th className="py-3 px-3 font-semibold">
                Incident ID
              </th>
              <th className="py-3 px-3 font-semibold">
                Incident
              </th>
              <th className="py-3 px-3 font-semibold">
                Category
              </th>
              <th className="py-3 px-3 font-semibold">
                Severity
              </th>
              <th className="py-3 px-3 font-semibold">
                First Reported
              </th>
              <th className="py-3 px-3 font-semibold">
                Location
              </th>
              <th className="py-3 px-3 font-semibold">
                Team
              </th>
              <th className="py-3 px-3 font-semibold">
                Status
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-[#790009]/20 text-[#F2EEE9]">
            {incidents.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="text-sm font-oswald uppercase text-[#92929A] tracking-wider font-semibold">
                      No incidents match current filter criteria
                    </p>
                    {onClearFilters && (
                      <button
                        type="button"
                        onClick={onClearFilters}
                        className="btn-gothic-crimson px-4 py-1.5 rounded-md text-xs font-oswald uppercase tracking-wider mt-1 cursor-pointer"
                      >
                        Clear All Filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              incidents.map((incident) => {
              const isSelected = incident.id === selectedIncidentId;
              const isChecked = checkedIds.includes(incident.id);

              return (
                <tr
                  key={incident.id}
                  onClick={() => onSelectIncident(incident)}
                  className={cn(
                    "cursor-pointer transition-colors duration-150 group font-mono-plex",
                    isSelected
                      ? "bg-[#790009]/20 border-l-2 border-[#C00012]"
                      : "hover:bg-[#111A29]/50"
                  )}
                >
                  {/* Checkbox */}
                  <td
                    className="py-3 px-3.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCheck(incident.id);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="rounded border-[#790009]/50 bg-[#050506] text-[#C00012] focus:ring-0 focus:outline-none cursor-pointer"
                    />
                  </td>

                  {/* Incident ID */}
                  <td className="py-3 px-3 font-mono font-bold text-xs text-[#F2EEE9] whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span>{incident.id}</span>
                      {incident.isCustomReported && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#790009]/35 text-[#F00018] border border-[#F00018]/40">
                          LOCAL
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Incident Title */}
                  <td className="py-3 px-3 max-w-xs font-sans">
                    <span
                      className="font-medium text-[#F2EEE9] truncate block group-hover:text-white transition-colors"
                      title={incident.title}
                    >
                      {incident.title}
                    </span>
                  </td>

                  {/* Category */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-[#92929A] font-oswald uppercase text-[11px]">
                      {getCategoryIcon(incident.category)}
                      <span>{formatCategoryShort(incident.category)}</span>
                    </div>
                  </td>

                  {/* Severity */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    {renderSeverityBadge(incident.severity)}
                  </td>

                  {/* First Reported */}
                  <td className="py-3 px-3 whitespace-nowrap text-[#92929A] font-mono text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#92929A]" />
                      <span>{formatReportedTime(incident.reportedAt)}</span>
                    </div>
                  </td>

                  {/* Location */}
                  <td className="py-3 px-3 whitespace-nowrap text-[#92929A] font-sans">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#790009]" />
                      <span>{incident.location.building || incident.location.zone}</span>
                    </div>
                  </td>

                  {/* Team */}
                  <td className="py-3 px-3 whitespace-nowrap text-[#F2EEE9] text-[11px] font-mono">
                    {incident.assignedResponder || "—"}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    {renderStatusBadge(incident.status)}
                  </td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>

      {/* Mobile High-Density Incident Cards (< md) */}
      <div className="block md:hidden divide-y divide-[#790009]/20">
        {/* Mobile Batch Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#111A29]/80 border-b border-[#790009]/30 text-xs text-[#92929A]">
          <label className="flex items-center gap-2 cursor-pointer select-none font-oswald uppercase text-[11px]">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={onToggleCheckAll}
              className="rounded border-[#790009]/50 bg-[#050506] text-[#C00012] focus:ring-0 focus:outline-none cursor-pointer w-4 h-4"
            />
            <span>Select All ({incidents.length})</span>
          </label>
          <span className="font-mono text-[10px] text-[#92929A]">
            {checkedIds.length} checked
          </span>
        </div>

        {/* Mobile Incident Cards List */}
        {incidents.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-2 bg-[#0A0B10]">
            <p className="text-xs font-oswald uppercase text-[#92929A] tracking-wider font-semibold">
              No incidents match current filter criteria
            </p>
            {onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="btn-gothic-crimson px-4 py-1.5 rounded-md text-xs font-oswald uppercase tracking-wider mt-1 cursor-pointer"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          incidents.map((incident) => {
            const isSelected = incident.id === selectedIncidentId;
            const isChecked = checkedIds.includes(incident.id);

            return (
              <div
                key={`mobile-${incident.id}`}
                onClick={() => onSelectIncident(incident)}
                className={cn(
                  "p-3.5 space-y-2 cursor-pointer transition-colors duration-150 relative font-mono-plex",
                  isSelected
                    ? "bg-[#790009]/20 border-l-4 border-[#C00012]"
                    : "hover:bg-[#111A29]/50 bg-[#0A0B10]"
                )}
              >
                {/* Card Header: Checkbox + ID + Badges */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCheck(incident.id);
                      }}
                      className="p-1 -m-1 cursor-pointer flex items-center justify-center shrink-0"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="rounded border-[#790009]/50 bg-[#050506] text-[#C00012] focus:ring-0 focus:outline-none cursor-pointer w-4 h-4"
                      />
                    </div>
                    <span className="font-mono font-bold text-xs text-[#F2EEE9]">
                      {incident.id}
                    </span>
                    {incident.isCustomReported && (
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-[#790009]/35 text-[#F00018] border border-[#F00018]/40">
                        LOCAL
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {renderSeverityBadge(incident.severity)}
                    {renderStatusBadge(incident.status)}
                  </div>
                </div>

                {/* Card Title */}
                <h4 className="font-semibold text-xs text-[#F2EEE9] line-clamp-2 leading-relaxed font-sans">
                  {incident.title}
                </h4>

                {/* Card Metadata Footer */}
                <div className="flex flex-wrap items-center justify-between gap-y-1 text-[11px] text-[#92929A] pt-1 border-t border-[#790009]/15">
                  <div className="flex items-center gap-1.5 font-sans">
                    <MapPin className="w-3 h-3 text-[#790009] shrink-0" />
                    <span className="truncate max-w-[150px]">
                      {incident.location.building || incident.location.zone}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {getCategoryIcon(incident.category)}
                      <span>{formatCategoryShort(incident.category)}</span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1 font-mono text-[10px]">
                      <Clock className="w-3 h-3 text-[#92929A]" />
                      <span>{formatReportedTime(incident.reportedAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
