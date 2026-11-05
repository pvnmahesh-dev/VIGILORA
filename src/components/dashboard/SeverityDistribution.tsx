"use client";

import React, { useMemo } from "react";
import { ShieldAlert, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { DemoBadge } from "@/components/ui/DemoBanner";
import { useIncidents } from "@/context/IncidentContext";
import { IncidentSeverity } from "@/types/incident";

export function SeverityDistribution() {
  const { incidents } = useIncidents();

  const iconMap = {
    Critical: ShieldAlert,
    High: AlertTriangle,
    Medium: AlertCircle,
    Low: Info,
  };

  const distribution = useMemo(() => {
    const counts: Record<IncidentSeverity, number> = {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0,
    };
    incidents.forEach((i) => {
      if (counts[i.severity] !== undefined) {
        counts[i.severity]++;
      }
    });
    const total = incidents.length || 1;
    return [
      {
        severity: "Critical" as IncidentSeverity,
        count: counts.Critical,
        percentage: Math.round((counts.Critical / total) * 100),
        color: "#F01420",
        barColor: "bg-[#F01420] shadow-[0_0_8px_rgba(240,20,32,0.6)]",
      },
      {
        severity: "High" as IncidentSeverity,
        count: counts.High,
        percentage: Math.round((counts.High / total) * 100),
        color: "#C90012",
        barColor: "bg-[#C90012]",
      },
      {
        severity: "Medium" as IncidentSeverity,
        count: counts.Medium,
        percentage: Math.round((counts.Medium / total) * 100),
        color: "#87000A",
        barColor: "bg-[#87000A]",
      },
      {
        severity: "Low" as IncidentSeverity,
        count: counts.Low,
        percentage: Math.round((counts.Low / total) * 100),
        color: "#85858B",
        barColor: "bg-[#27272A]",
      },
    ];
  }, [incidents]);

  return (
    <div className="rounded-xl bg-[#080D13] border border-[#87000A]/30 p-4 sm:p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#87000A]/20">
        <div>
          <h3 className="text-sm font-semibold text-[#E8E5E2] font-oswald uppercase tracking-wider">
            Incident Severity Distribution
          </h3>
          <p className="text-xs text-[#85858B]">
            Current live severity breakdown across all active campus sectors
          </p>
        </div>
        <DemoBadge />
      </div>

      {/* Segmented Progress Bar */}
      <div className="w-full h-3 rounded-full bg-[#050506] overflow-hidden flex mb-4 p-0.5 border border-[#87000A]/30">
        {distribution.map((item) => (
          <div
            key={item.severity}
            style={{ width: `${item.percentage}%` }}
            className={`h-full first:rounded-l-full last:rounded-r-full transition-all duration-300 ${item.barColor}`}
            title={`${item.severity}: ${item.count} (${item.percentage}%)`}
          />
        ))}
      </div>

      {/* Legend / Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {distribution.map((item) => {
          const Icon = iconMap[item.severity];

          return (
            <div
              key={item.severity}
              className="p-3 rounded-lg bg-[#0c1219] border border-[#87000A]/20 hover:border-[#C90012]/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs font-oswald uppercase tracking-wider text-[#E8E5E2]">
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: item.color }} />
                  <span>{item.severity}</span>
                </div>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold font-mono text-[#E8E5E2]">
                  {item.count}
                </span>
                <span className="text-[11px] font-mono text-[#85858B]">
                  ({item.percentage}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
