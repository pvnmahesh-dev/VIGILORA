"use client";

import React from "react";
import {
  AlertTriangle,
  Radio,
  Flame,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { useIncidents } from "@/context/IncidentContext";

export function DashboardStats() {
  const { metrics } = useIncidents();

  const resolutionRatePercent =
    metrics.totalIncidents > 0
      ? Math.round((metrics.resolvedIncidents / metrics.totalIncidents) * 100)
      : 0;

  const stats = [
    {
      title: "Total Incidents",
      value: metrics.totalIncidents,
      subtitle: "Past 24 hours",
      change: "Live Session",
      changeType: "neutral",
      icon: Radio,
      color: "text-[#E8E5E2]",
      accentBg: "bg-[#87000A]/20",
      borderColor: "border-[#87000A]/30",
    },
    {
      title: "Active Incidents",
      value: metrics.activeIncidents,
      subtitle: "In progress / review",
      change: `${metrics.underReviewIncidents} under review`,
      changeType: "warning",
      icon: AlertTriangle,
      color: "text-[#F01420]",
      accentBg: "bg-[#87000A]/30",
      borderColor: "border-[#87000A]/40",
    },
    {
      title: "Critical Incidents",
      value: metrics.criticalIncidents,
      subtitle: "Immediate action",
      change: metrics.criticalIncidents > 0 ? "Requires Dispatch" : "All clear",
      changeType: "critical",
      icon: Flame,
      color: "text-[#F01420]",
      accentBg: "bg-[#F01420]/20",
      borderColor: metrics.criticalIncidents > 0 ? "border-[#F01420]/70" : "border-[#87000A]/30",
      pulse: metrics.criticalIncidents > 0,
    },
    {
      title: "Resolved Incidents",
      value: metrics.resolvedIncidents,
      subtitle: `${resolutionRatePercent}% resolution rate`,
      change: "Stand down complete",
      changeType: "success",
      icon: CheckCircle2,
      color: "text-emerald-400",
      accentBg: "bg-emerald-500/10",
      borderColor: "border-[#87000A]/30",
    },
    {
      title: "Avg Response Time",
      value: `${metrics.avgResponseTimeMinutes}m`,
      subtitle: "Target: < 5.0m",
      change: "Telemetry active",
      changeType: "success",
      icon: Clock,
      color: "text-[#85858B]",
      accentBg: "bg-[#111722]",
      borderColor: "border-[#87000A]/30",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;

        return (
          <div
            key={idx}
            className={`relative rounded-xl bg-[#080D13] border p-4 transition-all duration-200 hover:border-[#C90012]/50 hover:shadow-[0_0_15px_rgba(201,0,18,0.2)] ${stat.borderColor} ${
              stat.pulse ? "shadow-[0_0_20px_rgba(240,20,32,0.3)] animate-pulse" : ""
            }`}
          >
            {/* Top row: Label and Icon */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-oswald uppercase tracking-wider text-[#85858B]">
                {stat.title}
              </span>
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-lg ${stat.accentBg} ${stat.color} border border-[#87000A]/40`}
              >
                <Icon className={`w-4 h-4 ${stat.pulse ? "animate-pulse text-[#F01420]" : ""}`} />
              </div>
            </div>

            {/* Metric Value */}
            <div className="text-2xl sm:text-3xl font-bold font-mono text-[#E8E5E2] mb-1">
              {stat.value}
            </div>

            {/* Footer row: subtitle & dynamic change indicator */}
            <div className="flex items-center justify-between text-[11px] pt-2 border-t border-[#87000A]/20">
              <span className="text-[#85858B] truncate">{stat.subtitle}</span>
              <span
                className={`font-mono text-[10px] font-semibold px-1.5 py-0.2 rounded shrink-0 ${
                  stat.changeType === "critical"
                    ? "text-[#F01420] bg-[#87000A]/25 border border-[#F01420]/40"
                    : stat.changeType === "warning"
                    ? "text-orange-400 bg-orange-950/30"
                    : stat.changeType === "success"
                    ? "text-emerald-400 bg-emerald-950/30"
                    : "text-[#85858B] bg-white/5"
                }`}
              >
                {stat.change}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
