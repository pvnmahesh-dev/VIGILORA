"use client";

import React from "react";
import {
  Activity,
  Radio,
  Sparkles,
  UserCheck,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { DemoBadge } from "@/components/ui/DemoBanner";
import { useIncidents } from "@/context/IncidentContext";
import Link from "next/link";

export function ActivityTimeline() {
  const { activities } = useIncidents();

  const getEventIcon = (type: string) => {
    switch (type) {
      case "alert":
        return <Sparkles className="w-3.5 h-3.5 text-[#F01420]" />;
      case "dispatch":
        return <Radio className="w-3.5 h-3.5 text-[#C90012]" />;
      case "resolution":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case "status_change":
      default:
        return <UserCheck className="w-3.5 h-3.5 text-[#E8E5E2]" />;
    }
  };

  const getActorBadgeColor = (role: string) => {
    switch (role) {
      case "System AI":
        return "bg-[#2D062E] text-[#f59e0b] border-[#701A75]/40";
      case "Dispatcher":
        return "bg-[#87000A]/25 text-[#F01420] border-[#87000A]/50";
      case "Supervisor":
        return "bg-[#87000A]/40 text-[#F01420] border-[#C90012]/50";
      case "Field Responder":
      default:
        return "bg-[#111722] text-[#85858B] border-[#87000A]/20";
    }
  };

  return (
    <div className="rounded-xl bg-[#080D13] border border-[#87000A]/30 p-4 sm:p-5 flex flex-col h-full shadow-xl">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#87000A]/20">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#F01420]" />
          <h3 className="text-sm font-semibold text-[#E8E5E2] font-oswald uppercase tracking-wider">
            Recent Incident Activity
          </h3>
        </div>
        <DemoBadge />
      </div>

      <div className="space-y-4 overflow-y-auto pr-1 flex-1">
        {activities.map((activity, idx) => (
          <div key={activity.id} className="relative flex items-start gap-3 text-xs">
            {/* Timeline connector line */}
            {idx < activities.length - 1 && (
              <span
                className="absolute left-[13px] top-6 bottom-[-16px] w-[1px] bg-[#87000A]/30"
                aria-hidden="true"
              />
            )}

            {/* Icon Bubble */}
            <div className="relative z-10 flex items-center justify-center w-7 h-7 rounded-lg bg-[#0c1219] border border-[#87000A]/40 shrink-0 mt-0.5">
              {getEventIcon(activity.type)}
            </div>

            {/* Content Body */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                <span className="font-semibold text-[#E8E5E2] font-oswald tracking-wide">
                  {activity.action}
                </span>
                <span className="text-[11px] font-mono text-[#85858B] shrink-0">
                  {activity.timestamp}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#85858B]">
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${getActorBadgeColor(
                    activity.actorRole
                  )}`}
                >
                  {activity.actor} ({activity.actorRole})
                </span>

                <span className="text-[#85858B]">•</span>

                <Link
                  href="/incidents"
                  className="text-[#85858B] hover:text-[#F01420] transition-colors truncate max-w-[200px]"
                >
                  {activity.incidentTitle}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 mt-4 border-t border-[#87000A]/20 flex items-center justify-between text-xs text-[#85858B]">
        <span>Displaying live operational timeline</span>
        <Link
          href="/incidents"
          className="text-[#F01420] hover:text-[#ff3b45] font-semibold inline-flex items-center gap-1 font-oswald uppercase tracking-wider"
        >
          <span>All Events</span>
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
