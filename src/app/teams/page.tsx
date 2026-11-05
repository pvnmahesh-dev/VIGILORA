"use client";

import React, { useState } from "react";
import { TeamStatus } from "@/types/team";
import { Button } from "@/components/ui/Button";
import { DemoBadge } from "@/components/ui/DemoBanner";
import { GothicAtmosphere } from "@/components/ui/GothicAtmosphere";
import {
  Radio,
  BatteryCharging,
  Search,
  AlertTriangle,
  X,
} from "lucide-react";
import Link from "next/link";
import { useIncidents } from "@/context/IncidentContext";

export default function ResponseTeamsPage() {
  const { teams, updateTeamStatus, metrics } = useIncidents();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const filteredTeams = teams.filter((t) => {
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.callsign.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.currentZone.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusColor = (status: TeamStatus) => {
    switch (status) {
      case "Available":
        return "bg-[#041a0d]/40 text-[#00CC66] border-[#00CC66]/40";
      case "En Route":
        return "bg-[#7A1F0D]/30 text-[#FB923C] border-[#EA580C]/50";
      case "On Scene":
        return "bg-[#790009]/40 text-[#F00018] border-[#C00012]/60 shadow-[0_0_8px_rgba(240,0,24,0.3)]";
      case "Busy":
        return "bg-[#5C3B0D]/30 text-[#FFCC00] border-[#FFCC00]/40";
      default:
        return "bg-[#111A29] text-[#92929A] border-white/10";
    }
  };

  return (
    <GothicAtmosphere variant="teams">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-[#790009]/25">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="font-bodoni text-2xl sm:text-3xl font-bold tracking-wide uppercase">
                <span className="text-[#F2EEE9] text-distressed-ivory">RESPONSE </span>
                <span className="text-[#C00012] text-distressed-crimson">TEAMS</span>
              </h1>
              <DemoBadge />
            </div>
            <p className="font-oswald text-xs uppercase tracking-widest text-[#92929A] font-semibold">
              Tactical Unit Roster • Radio Telemetry & Incident Deployment
            </p>
          </div>

        <Link href="/incidents">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Radio className="w-4 h-4" />}
          >
            Live Incidents
          </Button>
        </Link>
      </div>

      {/* In-App Status Notification Banner */}
      {statusNotice && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 p-3.5 rounded-md bg-red-950/80 border border-[#F00018]/70 text-red-200 text-xs font-mono shadow-xl animate-fadeIn"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#F00018] shrink-0" />
            <span>{statusNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-[#92929A] hover:text-white p-1 shrink-0"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Metrics Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-md bg-[#0A0B10] border border-[#790009]/30 shadow-lg">
          <div className="text-xs font-oswald uppercase text-[#92929A] mb-1">Total Teams Active</div>
          <div className="text-2xl font-bold font-mono text-white">
            {teams.length} Units
          </div>
          <div className="text-[11px] text-[#92929A]">Tactical roster</div>
        </div>

        <div className="p-3.5 rounded-md bg-[#0A0B10] border border-[#00CC66]/30 shadow-lg">
          <div className="text-xs font-oswald uppercase text-[#00CC66] mb-1">Available for Dispatch</div>
          <div className="text-2xl font-bold font-mono text-white">
            {teams.filter((t) => t.status === "Available").length} Units
          </div>
          <div className="text-[11px] text-[#92929A]">Ready on stand-by</div>
        </div>

        <div className="p-3.5 rounded-md bg-[#180306] border border-[#F00018]/40 shadow-[0_0_12px_rgba(240,0,24,0.2)]">
          <div className="text-xs font-oswald uppercase text-[#F00018] mb-1 font-bold">Engaged / On Scene</div>
          <div className="text-2xl font-bold font-mono text-[#F00018]">
            {metrics.activeRespondersCount} Units
          </div>
          <div className="text-[11px] text-[#92929A]">Assigned incidents</div>
        </div>

        <div className="p-3.5 rounded-md bg-[#0A0B10] border border-[#790009]/30 shadow-lg">
          <div className="text-xs font-oswald uppercase text-[#F2EEE9] mb-1">Comms Health</div>
          <div className="text-2xl font-bold font-mono text-white">100%</div>
          <div className="text-[11px] text-[#92929A]">Radio relays active</div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-md bg-[#0A0B10] border border-[#790009]/30 shadow-lg">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#92929A]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search teams by callsign, name, or zone..."
            className="w-full pl-10 pr-4 py-2 rounded-md bg-[#050506] border border-[#790009]/30 text-[#F2EEE9] placeholder-[#92929A] text-xs sm:text-sm font-mono-plex focus:outline-none focus:border-[#C00012]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 font-oswald uppercase">
          {["all", "Available", "En Route", "On Scene", "Busy"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all duration-200 active:scale-[0.98] ${
                statusFilter === st
                  ? "bg-[#790009]/35 text-[#F00018] border border-[#C00012]/50 font-bold"
                  : "text-[#92929A] hover:text-[#F2EEE9] hover:bg-[#790009]/15 border border-transparent"
              }`}
            >
              {st === "all" ? "All Units" : st}
            </button>
          ))}
        </div>
      </div>

      {/* Team Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTeams.map((team) => (
          <div
            key={team.id}
            className="rounded-md bg-[#0A0B10] border border-[#790009]/30 p-5 space-y-4 hover:border-[#C00012]/50 hover:-translate-y-0.5 transition-all duration-200 shadow-xl flex flex-col justify-between card-interactive"
          >
            <div>
              {/* Unit Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-oswald uppercase tracking-wider text-sm font-bold text-white">
                      {team.name}
                    </h3>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#050506] text-[#F2EEE9] border border-[#790009]/40">
                      {team.callsign}
                    </span>
                  </div>
                  <p className="text-xs text-[#F00018] font-medium font-oswald uppercase">
                    {team.specialty}
                  </p>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-oswald uppercase tracking-wider font-semibold border ${getStatusColor(
                    team.status
                  )}`}
                >
                  {team.status}
                </span>
              </div>

              {/* Lead and Crew */}
              <div className="p-3 rounded-md bg-[#050506] border border-[#790009]/25 space-y-1.5 text-xs text-[#F2EEE9] mb-3 font-mono-plex">
                <div className="flex justify-between">
                  <span className="text-[#92929A] font-oswald uppercase text-[11px]">Team Lead:</span>
                  <span className="font-semibold text-white">
                    {team.leadResponder}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#92929A] font-oswald uppercase text-[11px]">Assigned Zone:</span>
                  <span className="text-[#F2EEE9] font-mono">{team.currentZone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#92929A] font-oswald uppercase text-[11px]">Tactical Comms:</span>
                  <span className="font-mono text-[11px] text-[#F00018]">
                    {team.contactChannel}
                  </span>
                </div>
              </div>

              {/* Active Incident assignment */}
              {team.activeIncidentTitle && (
                <Link
                  href="/incidents"
                  className="block p-2.5 rounded-md bg-[#180306] border border-[#C00012]/30 text-xs mb-3 hover:border-[#C00012]/60 transition-colors"
                >
                  <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#F00018] mb-0.5 flex items-center justify-between">
                    <span>Assigned: {team.activeIncidentId}</span>
                    <span className="underline">View Live →</span>
                  </div>
                  <div className="text-[#F2EEE9] line-clamp-1 font-medium font-sans">
                    {team.activeIncidentTitle}
                  </div>
                </Link>
              )}
            </div>

            {/* Telemetry & Quick Status Switch */}
            <div className="space-y-3 pt-3 border-t border-[#790009]/20">
              <div className="flex items-center justify-between text-xs text-[#92929A] font-mono">
                <span className="flex items-center gap-1.5">
                  <BatteryCharging className="w-4 h-4 text-emerald-400" />
                  <span>{team.batteryStatus}% Batt</span>
                </span>
                <span>Check-in: {team.lastCheckIn}</span>
              </div>

              <div className="flex items-center gap-1.5 pt-1 font-oswald uppercase">
                {(["Available", "En Route", "On Scene"] as TeamStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={async () => {
                      const success = await updateTeamStatus(team.id, st);
                      if (!success) {
                        setStatusNotice(
                          `Operational constraint: Cannot set "${team.name}" to "${st}". Active incident assignments must be resolved or unassigned before returning unit to stand-by.`
                        );
                        setTimeout(() => setStatusNotice(null), 6000);
                      }
                    }}
                    className={`flex-1 py-1 rounded text-[10px] font-semibold tracking-wider transition-all duration-200 active:scale-[0.98] border cursor-pointer ${
                      team.status === st
                        ? "bg-[#790009]/40 text-[#F00018] border-[#C00012]/50 font-bold"
                        : "bg-[#050506] text-[#92929A] border-[#790009]/30 hover:bg-[#790009]/15 hover:text-white"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
    </GothicAtmosphere>
  );
}
