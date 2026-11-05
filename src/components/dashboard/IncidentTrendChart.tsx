"use client";

import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";

interface TrendPoint {
  date: string;
  count: number;
  isPeak?: boolean;
}

const TREND_DATA: TrendPoint[] = [
  { date: "03/15", count: 78 },
  { date: "03/16", count: 64 },
  { date: "03/17", count: 46 },
  { date: "03/18", count: 41 },
  { date: "03/19", count: 57, isPeak: true },
  { date: "03/20", count: 61 },
  { date: "03/21", count: 73 },
];

export function IncidentTrendChart() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(4); // Default highlighted on 03/19

  // ViewBox dimensions
  const svgWidth = 800;
  const svgHeight = 220;
  const paddingLeft = 40;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 30;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;
  const maxVal = 100;

  // Calculate coordinates
  const points = TREND_DATA.map((pt, index) => {
    const x = paddingLeft + (index / (TREND_DATA.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (pt.count / maxVal) * chartHeight;
    return { ...pt, x, y };
  });

  // Build SVG path
  const pathD = points.reduce((acc, pt, index) => {
    if (index === 0) return `M ${pt.x} ${pt.y}`;
    const prev = points[index - 1];
    const cpX1 = prev.x + (pt.x - prev.x) / 2;
    const cpY1 = prev.y;
    const cpX2 = prev.x + (pt.x - prev.x) / 2;
    const cpY2 = pt.y;
    return `${acc} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${pt.x} ${pt.y}`;
  }, "");

  // Area path closing at the bottom
  const areaD = `${pathD} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;

  // Grid lines
  const yTicks = [100, 80, 60, 40, 20, 0];

  const activePoint = hoveredIndex !== null ? points[hoveredIndex] : points[4];

  return (
    <div className="w-full rounded-md bg-[#0A0B10] border border-[#790009]/35 p-4 sm:p-5 relative overflow-hidden shadow-2xl">
      {/* Header Label */}
      <div className="flex items-center justify-between mb-3 border-b border-[#790009]/25 pb-2">
        <h3 className="text-xs sm:text-sm font-oswald uppercase tracking-wider font-bold text-[#F2EEE9]">
          INCIDENT TREND <span className="text-[#92929A] text-xs font-normal">(Last 7 Days)</span>
        </h3>
        <span className="text-[11px] font-mono text-[#F00018]">PEAK: 57 CASUALTIES</span>
      </div>

      {/* Background subtle crimson ambient lighting */}
      <div className="absolute top-0 right-1/4 w-80 h-32 bg-[#790009]/12 rounded-full blur-3xl pointer-events-none" />

      {/* SVG Canvas */}
      <div className="relative w-full h-48 sm:h-56">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-full overflow-visible select-none"
        >
          <defs>
            {/* Luminous Crimson Glow Area Gradient */}
            <linearGradient id="gothicAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C00012" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#790009" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#0A0B10" stopOpacity="0" />
            </linearGradient>

            {/* Glowing Neon Crimson Line Gradient */}
            <linearGradient id="gothicLineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F00018" />
              <stop offset="50%" stopColor="#C00012" />
              <stop offset="100%" stopColor="#790009" />
            </linearGradient>

            {/* Filter for neon red glow */}
            <filter id="crimsonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Horizontal Grid lines and Y-axis labels */}
          {yTicks.map((val) => {
            const y = paddingTop + chartHeight - (val / maxVal) * chartHeight;
            return (
              <g key={val}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="rgba(121, 0, 9, 0.2)"
                  strokeDasharray={val === 0 ? undefined : "3 3"}
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 3.5}
                  textAnchor="end"
                  className="text-[10px] fill-[#92929A] font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Shaded Area Under Curve */}
          <path d={areaD} fill="url(#gothicAreaGradient)" />

          {/* The Glowing Trend Line */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#gothicLineGradient)"
            strokeWidth="2.5"
            filter="url(#crimsonGlow)"
            strokeLinecap="round"
          />

          {/* Interactive Dashed Guide Line for Active Point */}
          {activePoint && (
            <line
              x1={activePoint.x}
              y1={paddingTop}
              x2={activePoint.x}
              y2={paddingTop + chartHeight}
              stroke="#F00018"
              strokeDasharray="4 4"
              strokeWidth="1.5"
              strokeOpacity="0.85"
            />
          )}

          {/* Data Points */}
          {points.map((pt, i) => {
            const isSelected = i === (hoveredIndex ?? 4);
            return (
              <g
                key={pt.date}
                className="cursor-pointer group"
                onMouseEnter={() => setHoveredIndex(i)}
              >
                {/* Invisible larger hover target */}
                <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" />

                {isSelected ? (
                  <>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="7"
                      fill="#F00018"
                      className="animate-ping opacity-75"
                    />
                    <circle cx={pt.x} cy={pt.y} r="5" fill="#F00018" />
                    <circle cx={pt.x} cy={pt.y} r="2" fill="#ffffff" />
                  </>
                ) : (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="3.5"
                    fill="#790009"
                    stroke="#F00018"
                    strokeWidth="1"
                    className="opacity-70 group-hover:opacity-100 transition-opacity"
                  />
                )}
              </g>
            );
          })}

          {/* X-axis date labels */}
          {points.map((pt) => (
            <text
              key={pt.date}
              x={pt.x}
              y={svgHeight - 8}
              textAnchor="middle"
              className="text-[10px] fill-[#92929A] font-mono"
            >
              {pt.date}
            </text>
          ))}
        </svg>

        {/* Floating Callout Badge at Active Point */}
        {activePoint && (
          <div
            className="absolute -translate-x-1/2 -translate-y-full pointer-events-none transition-all duration-150"
            style={{
              left: `${(activePoint.x / svgWidth) * 100}%`,
              top: `${(activePoint.y / svgHeight) * 100}%`,
              marginTop: "-10px",
            }}
          >
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#180306] border border-[#C00012] shadow-[0_0_16px_rgba(192,0,18,0.5)]">
              <AlertTriangle className="w-3.5 h-3.5 text-[#F00018] fill-[#F00018]/20" />
              <span className="text-xs font-bold font-mono text-white tracking-wide">
                {activePoint.count} ▲
              </span>
            </div>
            {/* Small triangle pointer */}
            <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#C00012] mx-auto" />
          </div>
        )}
      </div>
    </div>
  );
}
