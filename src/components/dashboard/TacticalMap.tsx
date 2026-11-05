"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Incident } from "@/types/incident";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { DemoBadge } from "@/components/ui/DemoBanner";
import { useIncidents } from "@/context/IncidentContext";
import { getIncidentCoordinates } from "@/lib/campus-coordinates";
import {
  MapPin,
  Crosshair,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  Info,
  Compass,
  Radio,
  Building,
} from "lucide-react";
import Link from "next/link";

export interface TacticalMapProps {
  selectedIncidentId?: string | null;
  onSelectIncident?: (incident: Incident) => void;
  incidents?: Incident[];
}

export function TacticalMap({
  selectedIncidentId,
  onSelectIncident,
  incidents: propIncidents,
}: TacticalMapProps = {}) {
  const { incidents: contextIncidents } = useIncidents();
  const incidents = propIncidents ?? contextIncidents;

  const [localSelectedIncident, setLocalSelectedIncident] = useState<Incident | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showUnmappedDrawer, setShowUnmappedDrawer] = useState<boolean>(true);

  // Sync with incoming selectedIncidentId prop if provided
  useEffect(() => {
    if (selectedIncidentId) {
      const match = incidents.find((i) => i.id === selectedIncidentId);
      if (match) {
        setLocalSelectedIncident(match);
        setDismissedId(null);
      }
    }
  }, [selectedIncidentId, incidents]);

  const activeIncident =
    localSelectedIncident && localSelectedIncident.id !== dismissedId
      ? localSelectedIncident
      : null;

  // Filter incidents by sector zone
  const filteredIncidents = useMemo(() => {
    if (selectedZone === "all") return incidents;
    return incidents.filter((inc) =>
      inc.location.zone.toLowerCase().includes(selectedZone.toLowerCase())
    );
  }, [incidents, selectedZone]);

  // Deterministically partition incidents into mapped and unmapped
  const { mappedIncidents, unmappedIncidents } = useMemo(() => {
    const mapped: Array<{
      incident: Incident;
      coords: { xPercent: number; yPercent: number; isDerived?: boolean; locationName?: string };
    }> = [];
    const unmapped: Incident[] = [];

    for (const inc of filteredIncidents) {
      const coords = getIncidentCoordinates(inc);
      if (coords) {
        mapped.push({ incident: inc, coords });
      } else {
        unmapped.push(inc);
      }
    }

    return { mappedIncidents: mapped, unmappedIncidents: unmapped };
  }, [filteredIncidents]);

  const activeIncidentCoords = useMemo(() => {
    return activeIncident ? getIncidentCoordinates(activeIncident) : null;
  }, [activeIncident]);

  const handleSelectIncident = (incident: Incident) => {
    setLocalSelectedIncident(incident);
    setDismissedId(null);
    onSelectIncident?.(incident);
  };

  const handleCloseOverlay = () => {
    if (activeIncident) {
      setDismissedId(activeIncident.id);
    }
    setLocalSelectedIncident(null);
  };

  return (
    <div className="rounded-md bg-[#0A0B10] border border-[#790009]/35 overflow-hidden flex flex-col h-full shadow-2xl">
      {/* Map Header */}
      <div className="p-3.5 sm:p-4 border-b border-[#790009]/30 flex flex-wrap items-center justify-between gap-3 bg-[#111A29]/80">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[#790009]/25 text-[#F00018] border border-[#790009]/50 shadow-[0_0_10px_rgba(240,0,24,0.25)]">
            <Crosshair className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#F2EEE9] font-oswald uppercase tracking-wider">
                CAMPUS TACTICAL SCHEMATIC GRID
              </h3>
              <DemoBadge />
            </div>
            <p className="text-[11px] text-[#92929A] font-mono">
              Vector schematic map • Architectural footprints & beacon telemetry
            </p>
          </div>
        </div>

        {/* Map Controls & Zone Filter */}
        <div className="flex items-center gap-2">
          {/* Mobile Sector Dropdown (< sm) */}
          <div className="flex sm:hidden">
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="px-2.5 py-1.5 rounded-md bg-[#050506] border border-[#790009]/40 text-[#F2EEE9] text-[11px] font-oswald uppercase focus:outline-none cursor-pointer"
              aria-label="Filter sector on tactical map"
            >
              <option value="all">All Sectors</option>
              <option value="North">North Quad (STEM)</option>
              <option value="Central">Central Plaza</option>
              <option value="East">East Sports & Auditorium</option>
              <option value="West">West Arts District</option>
              <option value="South">South Perimeter</option>
            </select>
          </div>

          {/* Desktop / Tablet Sector Filter Chips (>= sm) */}
          <div className="hidden sm:flex items-center gap-1 bg-[#050506] p-1 rounded-md border border-[#790009]/30 text-xs">
            {[
              { id: "all", label: "All Sectors" },
              { id: "North", label: "North" },
              { id: "Central", label: "Central" },
              { id: "East", label: "East" },
              { id: "West", label: "West" },
              { id: "South", label: "South" },
            ].map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setSelectedZone(zone.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-oswald uppercase tracking-wider transition-colors cursor-pointer ${
                  selectedZone === zone.id
                    ? "bg-gradient-to-r from-[#C00012] to-[#790009] text-white border border-[#F00018]/50 shadow-[0_0_8px_rgba(192,0,18,0.4)] font-bold"
                    : "text-[#92929A] hover:text-[#F2EEE9]"
                }`}
              >
                {zone.label}
              </button>
            ))}
          </div>

          {/* Zoom and Reset Controls */}
          <div className="flex items-center gap-1 bg-[#050506] p-1 rounded-md border border-[#790009]/30">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(z + 10, 140))}
              aria-label="Zoom in"
              title="Zoom in"
              className="p-1 text-[#92929A] hover:text-white rounded cursor-pointer transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(z - 10, 80))}
              aria-label="Zoom out"
              title="Zoom out"
              className="p-1 text-[#92929A] hover:text-white rounded cursor-pointer transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            {zoomLevel !== 100 && (
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                aria-label="Reset zoom"
                title="Reset zoom to 100%"
                className="p-1 text-[#92929A] hover:text-[#F00018] rounded cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Map Tactical Canvas Container */}
      <div className="relative flex-1 min-h-[460px] sm:min-h-[520px] lg:min-h-[580px] bg-[#050506] overflow-hidden select-none">
        <div
          style={{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: "center center",
          }}
          className="absolute inset-0 transition-transform duration-200"
        >
          {/* ================================================================= */}
          {/* VECTOR SCHEMATIC CAMPUS MAP (SVG LAYER 0-1000 Coordinate System) */}
          {/* ================================================================= */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              {/* Tactical architectural grid pattern */}
              <pattern id="campusGrid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#790009" strokeWidth="0.75" opacity="0.14" />
              </pattern>

              {/* Diagonal roof hatch for building footprints */}
              <pattern id="roofHatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="8" stroke="#1F2A38" strokeWidth="1.5" />
              </pattern>

              {/* Subtle building gradients */}
              <linearGradient id="auditoriumGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#141E2C" />
                <stop offset="100%" stopColor="#0B1019" />
              </linearGradient>

              <linearGradient id="sportsGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#162232" />
                <stop offset="100%" stopColor="#0B1019" />
              </linearGradient>

              <linearGradient id="stemGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#131C28" />
                <stop offset="100%" stopColor="#090E16" />
              </linearGradient>

              <linearGradient id="hallBGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#152130" />
                <stop offset="100%" stopColor="#0A0E17" />
              </linearGradient>
            </defs>

            {/* Base Coordinate Grid */}
            <rect width="1000" height="1000" fill="url(#campusGrid)" />

            {/* Tactical Compass & Range Rings */}
            <g id="range-rings" stroke="#790009" strokeWidth="1" strokeDasharray="4 6" opacity="0.22" fill="none">
              <circle cx="500" cy="500" r="180" />
              <circle cx="500" cy="500" r="320" />
              <circle cx="500" cy="500" r="440" />
              <line x1="500" y1="60" x2="500" y2="940" strokeWidth="0.5" strokeDasharray="2 4" />
              <line x1="60" y1="500" x2="940" y2="500" strokeWidth="0.5" strokeDasharray="2 4" />
            </g>

            {/* Campus Roadways & Primary Walkways */}
            <g id="roadways" stroke="#1A2433" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.8">
              {/* Perimeter Ring Road */}
              <rect x="70" y="70" width="860" height="860" rx="30" strokeWidth="18" stroke="#141D29" />
              {/* North-South Spine */}
              <line x1="500" y1="80" x2="500" y2="920" strokeWidth="26" />
              {/* East-West Cross Arterial */}
              <line x1="80" y1="500" x2="920" y2="500" strokeWidth="26" />
              {/* Diagonal Connector Roads */}
              <path d="M 220 220 L 500 500 L 780 220" strokeWidth="14" />
              <path d="M 220 780 L 500 500 L 780 780" strokeWidth="14" />
            </g>

            {/* =============================================================== */}
            {/* BUILDINGS & STRUCTURES (Explicit Architectural Footprints)       */}
            {/* =============================================================== */}

            {/* 1. Memorial Arena (East Sports Complex) [x: 720, y: 320] */}
            <g id="building-memorial-arena">
              <ellipse cx="720" cy="320" rx="90" ry="70" fill="url(#sportsGrad)" stroke="#2C3B4E" strokeWidth="2" />
              <ellipse cx="720" cy="320" rx="72" ry="54" fill="#0A0F17" stroke="#3D5066" strokeWidth="1.5" strokeDasharray="3 3" />
              <ellipse cx="720" cy="320" rx="36" ry="24" fill="#141E2C" stroke="#790009" strokeWidth="1" opacity="0.6" />
              <text x="720" y="316" fill="#F2EEE9" fontSize="11" fontFamily="var(--font-oswald), sans-serif" fontWeight="bold" textAnchor="middle" letterSpacing="0.08em">
                MEMORIAL ARENA
              </text>
              <text x="720" y="332" fill="#92929A" fontSize="9" fontFamily="var(--font-mono), monospace" textAnchor="middle">
                East Athletics Perimeter
              </text>
            </g>

            {/* 2. Engineering Hall B (North STEM Quad) [x: 320, y: 190] */}
            <g id="building-engineering-hall-b">
              <polygon points="260,140 380,140 380,240 320,240 320,200 260,200" fill="url(#hallBGrad)" stroke="#2C3B4E" strokeWidth="2" />
              <rect x="270" y="150" width="100" height="40" fill="url(#roofHatch)" opacity="0.35" />
              <text x="320" y="172" fill="#F2EEE9" fontSize="11" fontFamily="var(--font-oswald), sans-serif" fontWeight="bold" textAnchor="middle" letterSpacing="0.08em">
                ENGINEERING HALL B
              </text>
              <text x="320" y="188" fill="#92929A" fontSize="9" fontFamily="var(--font-mono), monospace" textAnchor="middle">
                STEM Sector • Lab Wing
              </text>
            </g>

            {/* 3. Sports Complex / Gymnasium [x: 750, y: 180] */}
            <g id="building-sports-complex">
              <rect x="680" y="130" width="140" height="90" rx="6" fill="url(#sportsGrad)" stroke="#2C3B4E" strokeWidth="2" />
              <line x1="750" y1="130" x2="750" y2="220" stroke="#1F2A38" strokeWidth="2" strokeDasharray="4 4" />
              <text x="750" y="170" fill="#F2EEE9" fontSize="11" fontFamily="var(--font-oswald), sans-serif" fontWeight="bold" textAnchor="middle" letterSpacing="0.08em">
                SPORTS COMPLEX
              </text>
              <text x="750" y="186" fill="#92929A" fontSize="9" fontFamily="var(--font-mono), monospace" textAnchor="middle">
                Fieldhouse &amp; Courts
              </text>
            </g>

            {/* 4. Main University Auditorium [x: 640, y: 220] */}
            <g id="building-auditorium">
              <polygon points="590,170 690,170 710,240 570,240" fill="url(#auditoriumGrad)" stroke="#2C3B4E" strokeWidth="2" />
              <text x="640" y="210" fill="#F2EEE9" fontSize="10" fontFamily="var(--font-oswald), sans-serif" fontWeight="bold" textAnchor="middle" letterSpacing="0.08em">
                MAIN AUDITORIUM
              </text>
            </g>

            {/* 5. Central Campus Plaza & Fountain [x: 500, y: 500] */}
            <g id="building-central-plaza">
              <circle cx="500" cy="500" r="65" fill="#0E1622" stroke="#2C3B4E" strokeWidth="2" />
              <circle cx="500" cy="500" r="45" fill="#141E2C" stroke="#790009" strokeWidth="1.5" opacity="0.7" />
              <circle cx="500" cy="500" r="18" fill="#1A283A" stroke="#3D5066" strokeWidth="1" />
              <text x="500" y="496" fill="#F2EEE9" fontSize="11" fontFamily="var(--font-oswald), sans-serif" fontWeight="bold" textAnchor="middle" letterSpacing="0.08em">
                CENTRAL PLAZA
              </text>
              <text x="500" y="512" fill="#92929A" fontSize="9" fontFamily="var(--font-mono), monospace" textAnchor="middle">
                Fountain Commons
              </text>
            </g>

            {/* 6. Science Complex / Science Hall [x: 220, y: 190] */}
            <g id="building-science-complex">
              <rect x="160" y="140" width="100" height="90" rx="4" fill="url(#stemGrad)" stroke="#2C3B4E" strokeWidth="2" />
              <text x="210" y="180" fill="#F2EEE9" fontSize="10" fontFamily="var(--font-oswald), sans-serif" fontWeight="bold" textAnchor="middle">
                SCIENCE HALL
              </text>
              <text x="210" y="196" fill="#92929A" fontSize="9" fontFamily="var(--font-mono), monospace" textAnchor="middle">
                Research Labs
              </text>
            </g>

            {/* 7. Student Union Building [x: 420, y: 430] */}
            <g id="building-student-union">
              <rect x="360" y="390" width="100" height="70" rx="4" fill="#111B27" stroke="#2C3B4E" strokeWidth="2" />
              <text x="410" y="425" fill="#F2EEE9" fontSize="10" fontFamily="var(--font-oswald), sans-serif" fontWeight="bold" textAnchor="middle">
                STUDENT UNION
              </text>
              <text x="410" y="440" fill="#92929A" fontSize="8.5" fontFamily="var(--font-mono), monospace" textAnchor="middle">
                Dining &amp; Services
              </text>
            </g>

            {/* 8. West Campus Arts Center [x: 180, y: 460] */}
            <g id="building-arts-center">
              <polygon points="130,420 230,420 220,500 140,500" fill="#121A26" stroke="#2C3B4E" strokeWidth="2" />
              <text x="180" y="460" fill="#F2EEE9" fontSize="10" fontFamily="var(--font-oswald), sans-serif" fontWeight="bold" textAnchor="middle">
                ARTS CENTER
              </text>
              <text x="180" y="474" fill="#92929A" fontSize="8.5" fontFamily="var(--font-mono), monospace" textAnchor="middle">
                Gallery &amp; Studios
              </text>
            </g>

            {/* 9. South Residential Quad [x: 350, y: 760] */}
            <g id="building-res-quad">
              <rect x="290" y="710" width="120" height="90" rx="4" fill="#101722" stroke="#2C3B4E" strokeWidth="2" />
              <text x="350" y="750" fill="#F2EEE9" fontSize="10" fontFamily="var(--font-oswald), sans-serif" fontWeight="bold" textAnchor="middle">
                RESIDENCE HALLS
              </text>
              <text x="350" y="766" fill="#92929A" fontSize="9" fontFamily="var(--font-mono), monospace" textAnchor="middle">
                South Housing Block
              </text>
            </g>

            {/* 10. South Parking Structure [x: 590, y: 760] */}
            <g id="building-parking-structure">
              <rect x="530" y="720" width="120" height="70" rx="4" fill="#0D131C" stroke="#2C3B4E" strokeWidth="2" />
              <line x1="530" y1="745" x2="650" y2="745" stroke="#1A2433" strokeWidth="1" strokeDasharray="3 3" />
              <text x="590" y="756" fill="#F2EEE9" fontSize="10" fontFamily="var(--font-oswald), sans-serif" fontWeight="bold" textAnchor="middle">
                PARKING GARAGE S
              </text>
              <text x="590" y="772" fill="#92929A" fontSize="9" fontFamily="var(--font-mono), monospace" textAnchor="middle">
                Fleet &amp; Facilities Station
              </text>
            </g>

            {/* Sector Designation Banners */}
            <g id="sector-labels" opacity="0.65" fontFamily="var(--font-mono), monospace" fontSize="10" fill="#790009">
              <text x="95" y="85">SEC-N // NORTH STEM QUAD</text>
              <text x="535" y="85">SEC-E // EAST SPORTS &amp; AUDITORIUM</text>
              <text x="315" y="365">SEC-C // CENTRAL SECTOR</text>
              <text x="75" y="405">SEC-W // WEST ARTS</text>
              <text x="435" y="675">SEC-S // SOUTH PERIMETER</text>
            </g>
          </svg>

          {/* Compass Watermark Badge */}
          <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] font-mono text-[#92929A] bg-[#0A0B10]/90 px-2.5 py-1.5 rounded-md border border-[#790009]/35 pointer-events-none shadow-lg">
            <Compass className="w-3.5 h-3.5 text-[#F00018]" />
            <span>GRID METROPOLIS // 42.3601° N, 71.0942° W</span>
          </div>

          {/* Severity Legend */}
          <div className="absolute top-4 left-4 z-10 hidden md:flex items-center gap-3 bg-[#0A0B10]/95 backdrop-blur-md px-3 py-1.5 rounded-md border border-[#790009]/35 text-[10px] font-mono text-[#92929A] pointer-events-none shadow-lg">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C00012] shadow-[0_0_8px_#C00012]" />
              <span className="text-[#F2EEE9] font-semibold">Critical</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF7700] shadow-[0_0_6px_#FF7700]" />
              <span className="text-[#F2EEE9] font-semibold">High</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFCC00]" />
              <span className="text-[#F2EEE9] font-semibold">Medium</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00CC66] shadow-[0_0_6px_#00CC66]" />
              <span className="text-[#F2EEE9] font-semibold">Low</span>
            </div>
          </div>

          {/* Demonstration Schematic Watermark Notice */}
          <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 bg-[#0A0B10]/95 backdrop-blur-md border border-[#790009]/40 px-3 py-1.5 rounded-md text-xs text-[#F2EEE9] pointer-events-none shadow-xl">
            <span className="w-2 h-2 rounded-full bg-[#F00018] animate-pulse" />
            <span className="font-oswald uppercase tracking-wider text-[#F00018] font-bold">
              DEMONSTRATION SCHEMATIC
            </span>
            <span className="text-[#92929A] text-[11px] font-mono">
              • {mappedIncidents.length} Plotted | {unmappedIncidents.length} Pending Sensor Fix
            </span>
          </div>

          {/* ================================================================= */}
          {/* INCIDENT BEACONS & INTERACTIVE PINS (Only Valid Coordinates Plotted) */}
          {/* ================================================================= */}
          {mappedIncidents.map(({ incident, coords }) => {
            const isSelected = activeIncident?.id === incident.id;
            const isCritical = incident.severity === "Critical";
            const isHigh = incident.severity === "High";
            const isMedium = incident.severity === "Medium";
            const isLow = incident.severity === "Low";

            let pinBg = "bg-[#00CC66] border-emerald-400 text-white shadow-[0_0_8px_rgba(0,204,102,0.6)]";
            let PinIcon = Info;
            let wave = null;

            if (isCritical) {
              pinBg = "bg-[#C00012] border-white text-white shadow-[0_0_16px_rgba(192,0,18,0.9)]";
              PinIcon = ShieldAlert;
              wave = (
                <>
                  <span className="absolute -inset-3 rounded-full border border-[#C00012]/60 bg-[#C00012]/20 animate-radar-ring pointer-events-none" />
                  <span className="absolute -inset-1 rounded-full bg-[#C00012]/25 animate-critical-pulse pointer-events-none" />
                </>
              );
            } else if (isHigh) {
              pinBg = "bg-[#FF7700] border-black text-white shadow-[0_0_12px_rgba(255,119,0,0.7)]";
              PinIcon = AlertTriangle;
              wave = (
                <span className="absolute -inset-1.5 rounded-full bg-[#FF7700]/25 animate-active-pulse pointer-events-none" />
              );
            } else if (isMedium) {
              pinBg = "bg-[#FFCC00] border-black text-black shadow-[0_0_10px_rgba(255,204,0,0.6)]";
              PinIcon = AlertCircle;
            } else if (isLow) {
              pinBg = "bg-[#00CC66] border-emerald-400 text-white shadow-[0_0_8px_rgba(0,204,102,0.6)]";
              PinIcon = Info;
            }

            return (
              <div
                key={incident.id}
                onClick={() => handleSelectIncident(incident)}
                style={{
                  left: `${coords.xPercent}%`,
                  top: `${coords.yPercent}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 group min-w-[48px] min-h-[48px] flex items-center justify-center transition-all"
                role="button"
                tabIndex={0}
                aria-label={`${incident.severity} incident ${incident.id}: ${incident.title}`}
              >
                {/* Wave / Pulse animation for Critical & High */}
                {wave}

                {/* Reticle targeting ring when selected */}
                {isSelected && (
                  <div className="absolute -inset-2 rounded-full border border-[#C00012] animate-spin-slow pointer-events-none opacity-80" />
                )}

                {/* Pin Body */}
                <div
                  className={`relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-transform duration-200 ${
                    isSelected
                      ? "scale-125 ring-2 ring-[#C00012] ring-offset-2 ring-offset-[#0A0B10] z-30"
                      : "group-hover:scale-115"
                  } ${pinBg}`}
                >
                  <PinIcon className="w-4 h-4" />
                </div>

                {/* Hover Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center pointer-events-none whitespace-nowrap z-40 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 rounded-md bg-[#0A0B10]/95 border border-[#790009]/60 text-[11px] font-mono text-[#F2EEE9] shadow-2xl flex items-center gap-2">
                    <span className="font-bold text-[#F00018]">{incident.id}</span>
                    <span>•</span>
                    <span className="max-w-[200px] truncate font-sans text-xs">{incident.title}</span>
                    <span className="text-[10px] uppercase font-bold text-[#FF7700]">[{incident.severity}]</span>
                  </div>
                  <div className="w-2 h-2 bg-[#0A0B10] border-r border-b border-[#790009]/60 rotate-45 -mt-1" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Incident Inspector Overlay Card */}
        {activeIncident && (
          <div className="absolute top-2 left-2 right-2 sm:right-auto sm:top-4 sm:left-4 z-30 sm:w-88 max-w-sm rounded-md bg-[#0A0B10]/95 backdrop-blur-md border border-[#C00012]/50 p-4 shadow-2xl animate-in fade-in zoom-in-95 max-h-[65vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2 mb-2">
              <PriorityBadge severity={activeIncident.severity} size="sm" />
              <button
                type="button"
                onClick={handleCloseOverlay}
                className="text-[#92929A] hover:text-white text-xs p-2 -m-1 rounded hover:bg-[#790009]/20 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center transition-colors"
                aria-label="Close inspector"
              >
                ✕
              </button>
            </div>

            <div className="font-mono text-xs font-bold text-[#F00018] mb-0.5">
              {activeIncident.id}
            </div>

            <h4 className="text-sm font-bold text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1 line-clamp-1">
              {activeIncident.title}
            </h4>
            <p className="text-[11px] text-[#92929A] line-clamp-2 mb-3 leading-relaxed">
              {activeIncident.description}
            </p>

            <div className="space-y-1.5 text-[11px] mb-3 bg-[#111A29]/70 p-2.5 rounded-md border border-[#790009]/20">
              <div className="flex items-center gap-1.5 text-[#F00018]">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="font-oswald uppercase text-xs font-semibold">{activeIncident.location.zone}</span>
              </div>
              {activeIncident.location.building && (
                <div className="flex items-center gap-1.5 text-[#92929A] pl-5">
                  <Building className="w-3 h-3 shrink-0" />
                  <span className="truncate">{activeIncident.location.building}</span>
                </div>
              )}
              {activeIncident.location.landmark && (
                <div className="text-[10px] text-[#92929A] pl-5 font-mono">
                  Landmark: {activeIncident.location.landmark}
                </div>
              )}
              {activeIncidentCoords && (
                <div className="text-[10px] text-[#92929A] pl-5 font-mono">
                  Schematic Coordinates: {activeIncidentCoords.xPercent}%, {activeIncidentCoords.yPercent}%
                  {activeIncidentCoords.isDerived ? " (Verified Schematic Grid)" : ""}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#790009]/25 flex items-center justify-between text-[11px]">
              <span className="text-[#92929A]">
                Status:{" "}
                <strong className="text-[#F2EEE9] font-mono font-medium">
                  {activeIncident.status}
                </strong>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[#92929A]">
                  Unit:{" "}
                  <strong className="text-[#F2EEE9] font-mono">
                    {activeIncident.assignedResponder || "Pending"}
                  </strong>
                </span>
                <Link
                  href="/incidents"
                  className="text-[#F00018] hover:text-[#ff3b45] font-semibold text-[11px] underline"
                >
                  Inspect →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Unmapped Queue / Pending Sensor Triangulation Tray */}
        {unmappedIncidents.length > 0 && (
          <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-30 w-[calc(100%-1.5rem)] sm:w-84 max-w-sm rounded-md bg-[#0A0B10]/95 backdrop-blur-md border border-[#790009]/40 p-3.5 shadow-2xl">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#F2EEE9]">
                <Radio className="w-4 h-4 animate-pulse text-[#F00018]" />
                <span className="font-oswald uppercase tracking-wider">
                  Pending Sensor Triangulation
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#790009]/35 text-[#F00018] font-mono font-bold border border-[#790009]/50">
                  {unmappedIncidents.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowUnmappedDrawer(!showUnmappedDrawer)}
                className="text-[#92929A] hover:text-white text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#111A29] border border-[#790009]/30 cursor-pointer"
              >
                {showUnmappedDrawer ? "Collapse" : "Expand"}
              </button>
            </div>

            {showUnmappedDrawer && (
              <div className="mt-2.5 space-y-2 max-h-40 overflow-y-auto pr-1">
                <p className="text-[10px] text-[#92929A] leading-tight">
                  Reports awaiting coordinate fix. Unmapped reports are quarantined from the schematic map to prevent approximate placement errors.
                </p>
                {unmappedIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => handleSelectIncident(inc)}
                    className="flex items-center justify-between p-2 rounded-md bg-[#111A29]/60 border border-[#790009]/20 text-[11px] cursor-pointer hover:border-[#C00012]/50 hover:bg-[#111A29] transition-all"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-mono text-[#F2EEE9] font-semibold truncate flex items-center gap-1.5">
                        <span className="text-[#F00018]">{inc.id}</span>
                        <span>•</span>
                        <span className="truncate">{inc.title}</span>
                      </div>
                      <div className="text-[10px] text-[#92929A] truncate mt-0.5">
                        {inc.location.zone} {inc.location.building ? `(${inc.location.building})` : ""}
                      </div>
                    </div>
                    <PriorityBadge severity={inc.severity} size="sm" showIcon={false} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
