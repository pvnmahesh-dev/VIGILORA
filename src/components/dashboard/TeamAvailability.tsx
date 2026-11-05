"use client";

import React from "react";
import { Users2, BatteryCharging, MapPin, ChevronRight } from "lucide-react";
import { DemoBadge } from "@/components/ui/DemoBanner";
import { useIncidents } from "@/context/IncidentContext";
import Link from "next/link";

export function TeamAvailability() {
  const { teams } = useIncidents();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Available":
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
      case "En Route":
        return "bg-[#87000A]/30 text-[#F01420] border-[#C90012]/40";
      case "On Scene":
        return "bg-[#F01420]/25 text-[#F01420] border-[#F01420]/50";
      case "Busy":
        return "bg-[#111722] text-[#85858B] border-[#87000A]/30";
      default:
        return "bg-[#0c1219] text-[#85858B] border-white/10";
    }
  };

  return (
    <div className="rounded-xl bg-[#080D13] border border-[#87000A]/30 p-4 sm:p-5 flex flex-col h-full shadow-xl">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#87000A]/20">
        <div className="flex items-center gap-2">
          <Users2 className="w-4 h-4 text-[#F01420]" />
          <h3 className="text-sm font-semibold text-[#E8E5E2] font-oswald uppercase tracking-wider">
            Response Team Availability
          </h3>
        </div>
        <DemoBadge />
      </div>

      <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
        {teams.map((team) => (
          <div
            key={team.id}
            className="p-3 rounded-lg bg-[#0c1219] border border-[#87000A]/20 hover:border-[#C90012]/50 hover:bg-[#111A29]/60 hover:-translate-y-0.5 transition-all duration-200 card-interactive cursor-default"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#E8E5E2] font-oswald uppercase tracking-wider">
                    {team.name}
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-[#050506] text-[#F01420] border border-[#87000A]/30">
                    {team.callsign}
                  </span>
                </div>
                <p className="text-[11px] text-[#85858B]">{team.specialty}</p>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border transition-colors ${getStatusColor(
                  team.status
                )}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    team.status === "Available"
                      ? "bg-emerald-400"
                      : team.status === "On Scene"
                      ? "bg-[#F01420]"
                      : team.status === "En Route"
                      ? "bg-[#FF7700]"
                      : "bg-[#85858B]"
                  }`}
                />
                <span>{team.status}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-y-1 text-[11px] text-[#85858B] pt-2 border-t border-[#87000A]/15">
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[#F01420] shrink-0" />
                <span className="truncate max-w-[140px] text-[#E8E5E2]">{team.currentZone}</span>
              </div>

              <div className="flex items-center gap-3">
                {team.batteryStatus && (
                  <span className="flex items-center gap-1 font-mono text-[10px] text-[#85858B]">
                    <BatteryCharging className="w-3 h-3 text-emerald-400" />
                    {team.batteryStatus}%
                  </span>
                )}
                <span className="text-[10px] font-mono text-[#85858B]">
                  {team.membersCount} crew
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 mt-3 border-t border-[#87000A]/20 flex items-center justify-between text-xs">
        <span className="text-[#85858B] text-[11px] font-mono">{teams.length} Units registered on roster</span>
        <Link
          href="/teams"
          className="text-[#F01420] hover:text-[#ff3b45] font-semibold inline-flex items-center gap-1 font-oswald uppercase tracking-wider"
        >
          <span>Manage Teams</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
