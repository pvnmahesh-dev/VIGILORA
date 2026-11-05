"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Menu,
  Bell,
  Plus,
  Clock,
  ChevronDown,
  X,
  ExternalLink,
  User,
} from "lucide-react";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { VigiloraLogo } from "@/components/ui/VigiloraLogo";
import { useIncidents } from "@/context/IncidentContext";
import { useAuth } from "@/context/AuthContext";
import { getRolePresentation } from "@/lib/role-utils";
import { cn } from "@/lib/utils";

interface TopNavigationProps {
  onToggleSidebar: () => void;
  isSidebarOpen?: boolean;
}

export function TopNavigation({
  onToggleSidebar,
  isSidebarOpen = false,
}: TopNavigationProps) {
  const [currentTime, setCurrentTime] = useState<string>("11:29:51");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedSector, setSelectedSector] = useState("Central Campus Sector");
  const [sectorDropdownOpen, setSectorDropdownOpen] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const { user } = useAuth();
  const rolePresentation = getRolePresentation(user?.role);
  const { incidents } = useIncidents();
  const criticalIncidents = incidents.filter(
    (i) => i.severity === "Critical" && i.status !== "Resolved"
  );

  const campusSectors = [
    "Central Campus Sector",
    "North STEM Quad",
    "East Sports Complex",
    "West Arts District",
    "South Event Perimeter",
  ];

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-2.5 sm:px-4 md:px-6 bg-[#050506]/95 backdrop-blur-md border-b border-[#790009]/35 shadow-lg shadow-black/80">
      {/* Left: Single Dedicated Sidebar Toggle, Logo, Workspace Scope, Sector & Demo Tag */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
        <button
          id="vigilora-sidebar-toggle-btn"
          type="button"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? "Close navigation sidebar" : "Open navigation sidebar"}
          aria-expanded={isSidebarOpen}
          title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
          className={cn(
            "p-2 -ml-1 rounded-md transition-colors duration-150 focus:outline-none shrink-0 border",
            isSidebarOpen
              ? "text-[#F00018] bg-[#790009]/25 border-[#790009]/60"
              : "text-[#92929A] hover:text-[#F2EEE9] hover:bg-white/5 border-transparent hover:border-[#790009]/40"
          )}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Sector Scope Bar */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1.5 rounded-md bg-[#0A0B10] border border-[#790009]/30 text-xs min-w-0">
            <VigiloraLogo variant="icon" size="xs" glow="none" />
            <span className="font-oswald uppercase tracking-wider font-bold text-[#F2EEE9] hidden sm:inline">
              VIGILORA OPS
            </span>
            <span className="text-zinc-600 hidden sm:inline">|</span>

            {/* Sector Selector Dropdown */}
            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => setSectorDropdownOpen(!sectorDropdownOpen)}
                className="flex items-center gap-1 text-[#92929A] hover:text-[#F2EEE9] transition-colors font-medium text-xs focus:outline-none min-w-0"
              >
                <span className="max-w-[75px] xs:max-w-[110px] sm:max-w-none truncate">{selectedSector}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#92929A] shrink-0" />
              </button>

              {sectorDropdownOpen && (
                <div className="absolute left-0 mt-2 w-52 rounded-lg bg-[#0A0B10] border border-[#790009]/50 shadow-2xl z-50 p-1.5 animate-in fade-in zoom-in-95">
                  <div className="px-2 py-1 text-[10px] font-oswald uppercase tracking-wider text-[#92929A]">
                    Select Campus Sector
                  </div>
                  {campusSectors.map((sector) => (
                    <button
                      key={sector}
                      onClick={() => {
                        setSelectedSector(sector);
                        setSectorDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono-plex transition-colors ${
                        selectedSector === sector
                          ? "bg-[#790009]/35 text-[#F00018] font-semibold"
                          : "text-[#92929A] hover:bg-[#111A29] hover:text-[#F2EEE9]"
                      }`}
                    >
                      {sector}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* DEMO Tag matching reference aesthetic */}
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#160305] border border-[#790009]/60 text-[11px] font-bold font-mono tracking-wider text-[#F00018] shadow-sm shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#F00018] animate-pulse" />
            <span>DEMO</span>
          </div>
        </div>
      </div>

      {/* Right: User Role Indicator, System Status, UTC Clock, Alerts, + Report Incident Button */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Authenticated User Role Badge & Name Indicator */}
        {user ? (
          <div
            id="top-nav-user-role-indicator"
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded-md bg-[#0A0B10] border border-[#790009]/30 text-xs transition-all hover:border-[#790009]/60 shrink-0"
            title={`${user.name || "Operator"} (${rolePresentation.label}) — ${rolePresentation.description}`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="w-3.5 h-3.5 text-[#92929A] shrink-0" />
              <span className="text-xs font-oswald uppercase tracking-wider font-semibold text-[#F2EEE9] truncate max-w-[70px] xs:max-w-[110px] md:max-w-[150px]">
                {user.name || "Operator"}
              </span>
            </div>
            <span
              id="top-nav-role-badge"
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border shrink-0",
                rolePresentation.badgeStyle.bg,
                rolePresentation.badgeStyle.text,
                rolePresentation.badgeStyle.border,
                rolePresentation.badgeStyle.glow
              )}
            >
              {rolePresentation.label}
            </span>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0A0B10] border border-[#790009]/30 text-xs font-oswald uppercase tracking-wider text-[#92929A] hover:text-[#F2EEE9] hover:border-[#790009]/60 transition-colors"
          >
            <User className="w-3.5 h-3.5 text-[#92929A]" />
            <span className="hidden xs:inline">Sign In</span>
          </Link>
        )}

        {/* Application Availability Status Badge */}
        <div
          title="VIGILORA Terminal Online — Application operational"
          className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-oswald uppercase tracking-wider bg-[#041a0d] border border-emerald-500/35 text-emerald-400 transition-colors shadow-[0_0_8px_rgba(16,185,129,0.15)]"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-operational-pulse inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <span>ONLINE</span>
        </div>

        {/* Live Clock with UTC */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#0A0B10] border border-[#790009]/30 text-xs font-mono text-[#F2EEE9]">
          <Clock className="w-3.5 h-3.5 text-[#92929A]" />
          <span>{currentTime} UTC</span>
        </div>

        {/* Notifications Popover Toggle */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2 rounded-md text-[#92929A] hover:text-[#F2EEE9] hover:bg-white/5 transition-all duration-200 border border-transparent hover:border-[#790009]/40 active:scale-[0.95]"
            aria-label="Alerts"
          >
            <Bell className="w-4 h-4" />
            {criticalIncidents.length > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                <span className="animate-critical-pulse inline-flex rounded-full h-2 w-2 bg-[#F00018]" />
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] sm:w-80 max-w-sm rounded-lg bg-[#0A0B10] border border-[#790009]/50 shadow-2xl z-50 p-3 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#790009]/30">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-oswald uppercase font-bold tracking-wider text-[#F2EEE9]">
                    Emergency Alerts
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#790009]/30 text-[#F00018] border border-[#790009]/50">
                    {criticalIncidents.length} Critical
                  </span>
                </div>
                <button
                  onClick={() => setNotificationsOpen(false)}
                  className="text-[#92929A] hover:text-[#F2EEE9] p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {criticalIncidents.map((incident) => (
                  <Link
                    key={incident.id}
                    href="/incidents"
                    onClick={() => setNotificationsOpen(false)}
                    className="block p-2.5 rounded-md bg-[#050506] hover:bg-[#111A29] border border-[#790009]/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-[#F2EEE9] line-clamp-1">
                        {incident.title}
                      </span>
                      <PriorityBadge severity={incident.severity} size="sm" showIcon={false} />
                    </div>
                    <div className="text-[11px] text-[#92929A] flex items-center justify-between">
                      <span>{incident.location.zone}</span>
                      <span className="font-mono text-[#92929A]">{incident.id}</span>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="mt-3 pt-2 border-t border-[#790009]/30 flex items-center justify-between text-xs font-oswald uppercase">
                <span className="text-[#92929A] text-[11px]">Live Grid Feed</span>
                <Link
                  href="/incidents"
                  onClick={() => setNotificationsOpen(false)}
                  className="text-[#F00018] hover:text-red-400 font-semibold inline-flex items-center gap-1"
                >
                  <span>View All Live</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Primary + Report Incident Button - Responsive on narrow mobile screens */}
        <Link
          href="/report"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("vigilora:new-report"));
            }
          }}
          className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-md bg-gradient-to-r from-[#F00018] via-[#C00012] to-[#790009] hover:from-[#ff1a26] hover:to-[#8e000b] text-white text-xs font-oswald uppercase tracking-wider font-bold shadow-lg shadow-black/60 border border-red-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="hidden sm:inline">+ Report Incident</span>
          <span className="inline sm:hidden">Report</span>
        </Link>
      </div>
    </header>
  );
}
