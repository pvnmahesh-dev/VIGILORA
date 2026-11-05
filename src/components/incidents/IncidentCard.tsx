"use client";

import React from "react";
import { Incident } from "@/types/incident";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DemoBadge } from "@/components/ui/DemoBanner";
import {
  MapPin,
  Clock,
  UserCheck,
  Camera,
  Bot,
  ChevronRight,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";

interface IncidentCardProps {
  incident: Incident;
  onSelect?: (incident: Incident) => void;
  compact?: boolean;
}

export function IncidentCard({
  incident,
  onSelect,
  compact = false,
}: IncidentCardProps) {
  const isCritical = incident.severity === "Critical";

  return (
    <div
      onClick={() => onSelect?.(incident)}
      className={`group relative rounded-md bg-[#0A0B10] border p-4 transition-all duration-200 cursor-pointer shadow-lg ${
        isCritical
          ? "border-[#C00012]/60 hover:border-[#F00018] shadow-[0_0_18px_rgba(192,0,18,0.25)]"
          : "border-[#790009]/30 hover:border-[#C00012]/60 hover:shadow-black/60"
      }`}
    >
      {/* Top Bar: Badges & ID */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <PriorityBadge severity={incident.severity} size="sm" />
          <StatusBadge status={incident.status} size="sm" />
          <DemoBadge isCustom={incident.isCustomReported} />
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-[#92929A]">
          <span>{incident.id}</span>
        </div>
      </div>

      {/* Incident Title */}
      <h4 className="text-sm font-semibold text-[#F2EEE9] group-hover:text-[#F00018] transition-colors line-clamp-1 mb-1.5 font-oswald uppercase tracking-wider">
        {incident.title}
      </h4>

      {/* Description */}
      {!compact && (
        <p className="text-xs text-[#92929A] line-clamp-2 mb-3 leading-relaxed font-sans">
          {incident.description}
        </p>
      )}

      {/* Location & Time */}
      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-[#92929A] mb-3 pt-2 border-t border-[#790009]/20 font-mono-plex">
        <div className="flex items-center gap-1 text-[#F2EEE9]">
          <MapPin className="w-3.5 h-3.5 text-[#790009] shrink-0" />
          <span className="line-clamp-1 font-mono text-[11px]">
            {incident.location.zone}
            {incident.location.building ? ` • ${incident.location.building}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[#92929A]">
          <Clock className="w-3.5 h-3.5 text-[#92929A] shrink-0" />
          <span className="font-mono text-[11px]">{formatTimeAgo(incident.reportedAt)}</span>
        </div>
      </div>

      {/* Footer Info: Assigned responder & AI score */}
      <div className="flex items-center justify-between pt-2 border-t border-[#790009]/20 text-xs">
        <div className="flex items-center gap-1.5 text-[#F2EEE9]">
          <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-mono truncate max-w-[150px]">
            {incident.assignedResponder || "Unassigned Unit"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {incident.hasPhoto && (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-[#92929A] bg-white/5 px-1.5 py-0.5 rounded border border-white/5 font-mono"
              title="Photograph attached"
            >
              <Camera className="w-3 h-3 text-[#F00018]" />
              <span>Photo</span>
            </span>
          )}

          {incident.aiClassificationScore && (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-[#F00018] bg-[#790009]/20 px-1.5 py-0.5 rounded border border-[#790009]/40 font-mono"
              title="AI Classification Confidence"
            >
              <Bot className="w-3 h-3 text-[#F00018]" />
              <span>{Math.round(incident.aiClassificationScore * 100)}%</span>
            </span>
          )}

          <ChevronRight className="w-4 h-4 text-[#92929A] group-hover:text-[#F00018] group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </div>
  );
}
