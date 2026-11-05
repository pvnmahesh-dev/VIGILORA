"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import {
  BarChart3,
  TrendingDown,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DemoBadge } from "@/components/ui/DemoBanner";
import { GothicAtmosphere } from "@/components/ui/GothicAtmosphere";
import { useIncidents } from "@/context/IncidentContext";
import { useAuth } from "@/context/AuthContext";
import { downloadIncidentSummaryPdf, PDF_FILENAME } from "@/lib/pdf-export";
import { calculateHourlyDistribution } from "@/lib/telemetry";

export default function AnalyticsPage() {
  const { metrics, incidents, teams, activities, emergencySettings } = useIncidents();
  const { user } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const resolutionRatePercent =
    metrics.totalIncidents > 0
      ? Math.round((metrics.resolvedIncidents / metrics.totalIncidents) * 100)
      : 0;

  const handleExport = async () => {
    setDownloading(true);
    setExportError(null);
    setExportSuccess(null);

    try {
      const result = await downloadIncidentSummaryPdf({
        incidents,
        teams,
        activities,
        campusName: emergencySettings?.campusName || "Metropolis Campus",
        operator: user
          ? {
              name: user.name,
              email: user.email,
              role: user.role,
            }
          : undefined,
      });

      if (result.success) {
        setExportSuccess(`Report downloaded: ${PDF_FILENAME}`);
        setTimeout(() => setExportSuccess(null), 6000);
      } else {
        setExportError(result.error || "Failed to generate PDF report.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error during PDF generation.";
      setExportError(msg);
    } finally {
      setDownloading(false);
    }
  };

  const hourlyDistribution = useMemo(() => {
    return calculateHourlyDistribution(incidents);
  }, [incidents]);

  const categoryDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((i) => {
      counts[i.category] = (counts[i.category] || 0) + 1;
    });
    const total = incidents.length || 1;
    const colors: Record<string, string> = {
      "Medical Emergency": "bg-[#F00018]",
      "Medical": "bg-[#F00018]",
      "Security & Safety": "bg-[#C00012]",
      "Security": "bg-[#C00012]",
      "Facilities & Power": "bg-[#790009]",
      "Infrastructure": "bg-[#790009]",
      "Fire and Hazard": "bg-[#FF7700]",
      "Crowd Management": "bg-[#FFCC00]",
      "Crowd Disturbance": "bg-[#FFCC00]",
      "Suspicious Activity": "bg-purple-700",
      "Missing Person": "bg-emerald-600",
    };

    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / total) * 100),
      color: colors[name] || "bg-[#92929A]",
    }));
  }, [incidents]);

  const zoneDensity = useMemo(() => {
    if (incidents.length === 0) {
      return [
        { zone: "No Sector Telemetry Available", count: 0, risk: "No Reports", percentage: 0 },
      ];
    }
    const counts: Record<string, number> = {};
    incidents.forEach((i) => {
      const z = i.location?.zone || "Unspecified Zone";
      counts[z] = (counts[z] || 0) + 1;
    });
    const total = incidents.length || 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([zone, count]) => {
        const percentage = Math.round((count / total) * 100);
        const risk = count >= 3 ? "Elevated" : count >= 2 ? "Moderate" : "Nominal";
        return {
          zone,
          count,
          risk,
          percentage,
        };
      });
  }, [incidents]);

  return (
    <GothicAtmosphere variant="analytics">
      <div className="space-y-6">
        {/* Subtle Haunted Skyline Analytics Thematic Banner */}
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

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#F00018] animate-pulse" />
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#F00018] font-bold">
                  HISTORICAL CHRONOLOGY & HAZARD DENSITY
                </span>
                <DemoBadge />
              </div>
              <h1 className="font-bodoni text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-wide leading-tight uppercase">
                <span className="text-[#F2EEE9] text-distressed-ivory">INCIDENT RESOLUTION </span>
                <span className="text-[#C00012] text-distressed-crimson">& ANALYTICS</span>
              </h1>
              <p className="font-oswald text-xs sm:text-sm uppercase tracking-wider text-[#92929A] font-medium mt-1 max-w-xl">
                Longitudinal campus incident telemetry, responder dispatch velocity, and spatial risk distribution.
              </p>
            </div>

            <div className="flex flex-col sm:items-end gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                isLoading={downloading}
                onClick={handleExport}
                leftIcon={<Download className="w-4 h-4 text-[#F00018]" />}
                className="self-start sm:self-auto shadow-lg"
              >
                {downloading ? "Compiling PDF..." : "Export Summary Report"}
              </Button>

              {exportSuccess && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-950/70 border border-emerald-500/50 text-[11px] text-emerald-300 font-mono shadow-md animate-fadeIn"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{exportSuccess}</span>
                </div>
              )}

              {exportError && (
                <div
                  role="alert"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-950/80 border border-[#F00018]/70 text-[11px] text-red-300 font-mono shadow-md animate-fadeIn"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F00018] shrink-0" />
                  <span>{exportError}</span>
                </div>
              )}
            </div>
          </div>
        </div>

      {/* Top Level Metric KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-md bg-[#0A0B10] border border-[#790009]/35 hover:border-[#C00012]/50 hover:shadow-[0_0_15px_rgba(192,0,18,0.2)] transition-all">
          <div className="flex items-center justify-between text-xs font-oswald uppercase tracking-wider text-[#92929A] mb-1">
            <span>Resolution Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#F2EEE9] mb-1">
            {resolutionRatePercent}%
          </div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Live Session Dynamic</span>
          </div>
        </div>

        <div
          className="p-4 rounded-md bg-[#0A0B10] border border-[#790009]/35 hover:border-[#C00012]/50 hover:shadow-[0_0_15px_rgba(192,0,18,0.2)] transition-all flex flex-col justify-between"
          title={metrics.responseTelemetryExplanation || "Average time from incident reporting to the first verified dispatch, calculated from genuine persisted incident records only."}
        >
          <div>
            <div className="flex items-center justify-between text-xs font-oswald uppercase tracking-wider text-[#92929A] mb-1">
              <span>Mean Response Time</span>
              <Clock className="w-4 h-4 text-[#F00018]" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#F2EEE9] mb-1">
              {metrics.avgResponseTimeMinutes !== null ? `${metrics.avgResponseTimeMinutes}m` : "--"}
            </div>
          </div>
          <div className="text-[11px] font-mono">
            {metrics.avgResponseTimeMinutes !== null ? (
              <div className="flex items-center gap-1 text-emerald-400">
                <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
                <span>Target: &lt; 5.0m ({metrics.eligibleCount} verified incident{metrics.eligibleCount === 1 ? "" : "s"})</span>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-[#F00018] font-semibold tracking-wider">
                  INSUFFICIENT VERIFIED RESPONSE DATA
                </span>
                <span className="text-[10px] text-[#92929A]">
                  0 eligible incidents
                </span>
                <span className="text-[9px] text-[#92929A] leading-tight mt-0.5">
                  Average time from incident reporting to the first verified dispatch, calculated from genuine persisted incident records only.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className={`p-4 rounded-md bg-[#0A0B10] border transition-all ${
          metrics.criticalIncidents > 0
            ? "border-[#F00018]/70 shadow-[0_0_20px_rgba(240,0,24,0.3)] bg-[#180306]"
            : "border-[#790009]/35 hover:border-[#C00012]/50 hover:shadow-[0_0_15px_rgba(192,0,18,0.2)]"
        }`}>
          <div className="flex items-center justify-between text-xs font-oswald uppercase tracking-wider text-[#92929A] mb-1">
            <span>Critical Incidents Active</span>
            <AlertTriangle className="w-4 h-4 text-[#F00018] animate-pulse" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#F00018] mb-1">
            {metrics.criticalIncidents}
          </div>
          <div className="text-[11px] text-[#92929A] font-mono">
            {metrics.criticalIncidents > 0 ? "Requires Immediate Action" : "All critical cleared"}
          </div>
        </div>

        <div className="p-4 rounded-md bg-[#0A0B10] border border-[#790009]/35 hover:border-[#C00012]/50 hover:shadow-[0_0_15px_rgba(192,0,18,0.2)] transition-all">
          <div className="flex items-center justify-between text-xs font-oswald uppercase tracking-wider text-[#92929A] mb-1">
            <span>Total Logged Reports</span>
            <BarChart3 className="w-4 h-4 text-[#92929A]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#F2EEE9] mb-1">
            {metrics.totalIncidents}
          </div>
          <div className="text-[11px] text-[#92929A] font-mono">
            Across campus sectors
          </div>
        </div>
      </div>

      {/* Hourly Incident Density Chart */}
      <div className="p-5 rounded-md bg-[#0A0B10] border border-[#790009]/30 space-y-4 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-[#790009]/20">
          <div>
            <h3 className="text-sm font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
              Hourly Incident Distribution (24-Hour Cycle)
            </h3>
            <p className="text-xs text-[#92929A]">
              {hourlyDistribution.totalValid > 0
                ? `Derived from ${hourlyDistribution.totalValid} verified incident report${hourlyDistribution.totalValid === 1 ? "" : "s"}${hourlyDistribution.peakHour ? ` • Peak density observed around ${hourlyDistribution.peakHour} (${hourlyDistribution.peakCount} report${hourlyDistribution.peakCount === 1 ? "" : "s"})` : ""}`
                : "No incidents logged in the active session. Awaiting longitudinal campus telemetry."}
            </p>
          </div>
          <DemoBadge />
        </div>

        {/* Visual Bar Graph with Crimson Glow */}
        <div className="pt-6 pb-2">
          <div className="flex items-end justify-between gap-2 h-44 border-b border-[#790009]/30 px-2 bg-[#050506]/60 rounded-t-md">
            {hourlyDistribution.buckets.map((bar) => (
              <div
                key={bar.hour}
                className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end"
              >
                <div
                  className={`text-[10px] font-mono transition-opacity ${
                    bar.count > 0
                      ? "text-[#F00018] opacity-100 font-bold"
                      : "text-[#92929A] opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {bar.count}
                </div>
                <div
                  style={{ height: bar.height }}
                  className={`w-full max-w-[28px] rounded-t-sm transition-all duration-200 ${
                    bar.count > 0
                      ? "bg-gradient-to-t from-[#790009] via-[#C00012] to-[#F00018] group-hover:from-[#C00012] group-hover:to-[#ff2a36] shadow-md shadow-black/60 group-hover:shadow-[0_0_12px_rgba(240,0,24,0.6)]"
                      : "bg-[#790009]/10 border-t border-[#790009]/20"
                  }`}
                />
                <span className="text-[10px] font-mono text-[#92929A] group-hover:text-[#F2EEE9] transition-colors">
                  {bar.hour}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two Column Section: Category Distribution & Zone Density */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="p-5 rounded-md bg-[#0A0B10] border border-[#790009]/30 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#790009]/20">
            <h3 className="text-sm font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
              Incidents by Category
            </h3>
            <DemoBadge />
          </div>

          <div className="space-y-3">
            {categoryDistribution.map((cat) => (
              <div key={cat.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#F2EEE9] font-medium font-oswald uppercase tracking-wider">
                    {cat.name}
                  </span>
                  <span className="font-mono text-[#92929A]">
                    {cat.count} ({cat.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#050506] border border-[#790009]/20 overflow-hidden">
                  <div
                    style={{ width: `${cat.percentage}%` }}
                    className={`h-full rounded-full ${cat.color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* High Density Zones */}
        <div className="p-5 rounded-md bg-[#0A0B10] border border-[#790009]/30 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#790009]/20">
            <h3 className="text-sm font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
              High Density Campus Sectors
            </h3>
            <DemoBadge />
          </div>

          <div className="space-y-3">
            {zoneDensity.map((zone) => (
              <div key={zone.zone} className="p-3 rounded-md bg-[#111A29]/70 border border-[#790009]/20 space-y-2 hover:border-[#C00012]/40 transition-colors">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider">
                    {zone.zone}
                  </span>
                  <span className="font-mono text-[#F00018] font-bold">
                    {zone.count} reports
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#050506] border border-[#790009]/20 overflow-hidden">
                  <div
                    style={{ width: `${Math.max(zone.percentage, zone.count > 0 ? 8 : 0)}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-[#790009] to-[#F00018] transition-all duration-500"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[#92929A] font-mono">
                  <span>Relative Hazard Load</span>
                  <span className={zone.risk === "High Density" ? "text-[#F00018] font-bold" : ""}>
                    {zone.risk}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </GothicAtmosphere>
  );
}
