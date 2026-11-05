"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const ZONES = ["North", "Central", "East", "West", "Arena"];
const DAYS = [
  { label: "Mar 15", count: 4 },
  { label: "Mar 16", count: 4 },
  { label: "Mar 17", count: 4 },
  { label: "Mar 18", count: 4 },
  { label: "Mar 19", count: 4 },
  { label: "Mar 20", count: 4 },
  { label: "Mar 21", count: 4 },
];

// Pre-computed realistic activity values matching the reference heatmap
const HEATMAP_MATRIX: Record<string, number[]> = {
  North: [
    12, 18, 35, 75, 88, 62, 28, 14, 18, 42, 70, 85, 30, 22, 15, 68, 82, 34,
    18, 15, 25, 45, 18, 12, 15, 20, 25, 18,
  ],
  Central: [
    22, 45, 82, 95, 90, 72, 30, 20, 35, 65, 80, 40, 25, 18, 30, 75, 88, 92,
    80, 50, 35, 60, 75, 40, 20, 25, 35, 20,
  ],
  East: [
    15, 22, 40, 60, 55, 38, 20, 15, 22, 35, 60, 48, 22, 18, 25, 45, 60, 48,
    30, 22, 28, 40, 50, 32, 18, 22, 28, 15,
  ],
  West: [
    10, 15, 25, 40, 75, 82, 45, 18, 12, 20, 35, 55, 80, 85, 40, 20, 25, 38,
    65, 82, 40, 25, 35, 45, 20, 15, 20, 15,
  ],
  Arena: [
    28, 60, 85, 98, 92, 78, 45, 25, 40, 70, 88, 95, 85, 45, 30, 65, 85, 96,
    90, 70, 45, 65, 80, 60, 30, 35, 42, 25,
  ],
};

function getHeatmapColor(val: number): string {
  if (val >= 85) return "#F00018"; // Highlight Red
  if (val >= 65) return "#C00012"; // Primary Crimson
  if (val >= 45) return "#790009"; // Deep Crimson
  if (val >= 30) return "#4A0307"; // Dark Crimson Red
  if (val >= 18) return "#230306"; // Very Deep Wine
  return "#0D0508"; // Near-black charcoal
}

export function IncidentActivityHeatmap() {
  const [selectedRange, setSelectedRange] = useState("Last 7 Days");
  const [rangeDropdownOpen, setRangeDropdownOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ zone: string; val: number; index: number } | null>(null);

  const ranges = ["Last 24 Hours", "Last 7 Days", "Last 30 Days", "Month to Date"];

  return (
    <div className="w-full rounded-md bg-[#0A0B10] border border-[#790009]/35 p-4 sm:p-5 shadow-2xl relative overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#790009]/25">
        <h3 className="text-xs sm:text-sm font-oswald uppercase tracking-wider font-bold text-[#F2EEE9]">
          INCIDENT ACTIVITY HEATMAP
        </h3>

        {/* Timeframe dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setRangeDropdownOpen(!rangeDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#050506] border border-[#790009]/30 text-xs font-oswald uppercase text-[#F2EEE9] hover:border-[#C00012]/60 transition-colors"
          >
            <span>{selectedRange}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#92929A]" />
          </button>

          {rangeDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-36 rounded-md bg-[#0A0B10] border border-[#790009]/40 shadow-2xl z-40 p-1">
              {ranges.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setSelectedRange(r);
                    setRangeDropdownOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-oswald uppercase tracking-wider transition-colors ${
                    selectedRange === r
                      ? "bg-[#790009]/35 text-[#F00018] font-semibold"
                      : "text-[#92929A] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Heatmap Grid & Legend Layout */}
      <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto pb-1">
        {/* Main Heatmap Matrix */}
        <div className="flex-1 min-w-[520px]">
          <div className="space-y-2">
            {ZONES.map((zone) => {
              const values = HEATMAP_MATRIX[zone] || [];
              return (
                <div key={zone} className="flex items-center gap-3">
                  {/* Zone label */}
                  <span className="w-14 text-right text-xs font-oswald uppercase font-medium text-[#92929A] shrink-0">
                    {zone}
                  </span>

                  {/* Dot row */}
                  <div className="flex items-center justify-between flex-1 gap-1">
                    {values.map((val, idx) => {
                      const color = getHeatmapColor(val);
                      const isHovered =
                        hoveredCell?.zone === zone && hoveredCell?.index === idx;
                      return (
                        <div
                          key={idx}
                          onMouseEnter={() => setHoveredCell({ zone, val, index: idx })}
                          onMouseLeave={() => setHoveredCell(null)}
                          className="relative flex items-center justify-center cursor-pointer group"
                        >
                          <div
                            className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-transform duration-150 ${
                              isHovered ? "scale-150 z-10 ring-2 ring-white/70" : "group-hover:scale-125"
                            }`}
                            style={{
                              backgroundColor: color,
                              boxShadow:
                                val >= 65
                                  ? `0 0 8px ${color}`
                                  : undefined,
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-axis Day labels below matrix */}
          <div className="flex items-center gap-3 pt-3 mt-1 border-t border-[#790009]/15">
            <span className="w-14 shrink-0" />
            <div className="flex items-center justify-between flex-1 text-[10px] font-mono text-[#92929A]">
              {DAYS.map((d) => (
                <span key={d.label}>{d.label}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Vertical Color Legend Bar */}
        <div className="flex flex-col items-center justify-between h-32 pl-2 border-l border-[#790009]/20 shrink-0 select-none">
          <span className="text-[10px] font-mono font-bold text-[#F00018]">100</span>
          <div className="w-2.5 h-20 rounded-full bg-gradient-to-b from-[#F00018] via-[#C00012] via-[#790009] to-[#0D0508] border border-[#790009]/40 shadow-sm my-1" />
          <span className="text-[10px] font-mono text-[#92929A]">0</span>
        </div>
      </div>
    </div>
  );
}
