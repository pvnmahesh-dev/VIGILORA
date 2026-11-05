"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Radio,
  ShieldAlert,
  Users2,
  BarChart3,
  Settings,
  ChevronDown,
  HelpCircle,
  Moon,
  User,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { getRolePresentation } from "@/lib/role-utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const rolePresentation = getRolePresentation(user ? user.role : undefined);
  const sidebarRef = useRef<HTMLElement>(null);

  // Close sidebar on outside click or Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const toggleBtn = document.getElementById("vigilora-sidebar-toggle-btn");
      if (toggleBtn && (toggleBtn === event.target || toggleBtn.contains(event.target as Node))) {
        return;
      }
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Close mobile drawer after selecting a navigation item
  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      onClose();
    }
  };

  const navItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      hasSubmenu: false,
    },
    {
      name: "Incident Management",
      href: "/incidents",
      icon: Radio,
      hasSubmenu: true,
    },
    {
      name: "Report Incident",
      href: "/report",
      icon: ShieldAlert,
      hasSubmenu: false,
      isSpecial: true,
    },
    {
      name: "Response Teams",
      href: "/teams",
      icon: Users2,
      hasSubmenu: false,
    },
    {
      name: "Analytics",
      href: "/analytics",
      icon: BarChart3,
      hasSubmenu: false,
    },
    {
      name: "Settings",
      href: "/settings",
      icon: Settings,
      hasSubmenu: false,
    },
  ];

  return (
    <>
      {/* Lightweight Backdrop Overlay (Desktop & Mobile) */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 top-14 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 ease-out",
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
      />

      {/* Sidebar Container - GPU Transform Overlay Architecture */}
      <aside
        ref={sidebarRef}
        id="vigilora-collapsible-sidebar"
        aria-label="Operations Navigation Sidebar"
        aria-hidden={!isOpen}
        className={cn(
          "fixed top-14 bottom-0 left-0 z-50 w-64 flex flex-col bg-[#050506] border-r border-[#790009]/35 shadow-2xl overflow-hidden",
          "transition-transform duration-200 ease-out will-change-transform",
          isOpen
            ? "translate-x-0 pointer-events-auto"
            : "-translate-x-full pointer-events-none"
        )}
      >
        {/* Inner container with stationary width to prevent text reflow */}
        <div className="w-64 min-w-[16rem] h-full flex flex-col">
          {/* Brand Header with Official Gothic Logo Banner */}
          <div className="px-3.5 pt-3.5 pb-3 border-b border-[#790009]/30 bg-[#050506]">
            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-oswald uppercase tracking-widest text-[#92929A]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F00018] animate-pulse" />
              <span>Command Navigation</span>
            </div>
            <Link
              href="/"
              onClick={handleNavClick}
              className="block group transition-transform hover:scale-[1.01]"
              title="VIGILORA Incident Intelligence Platform"
            >
              <div className="relative w-full h-14 rounded-md overflow-hidden border border-[#790009]/40 bg-[#0A0B10] shadow-lg shadow-black/80">
                <Image
                  src="/vigilora-logo.png"
                  alt="VIGILORA - Incident Intelligence Platform"
                  fill
                  priority
                  sizes="240px"
                  className="object-cover object-center group-hover:scale-[1.02] transition-transform duration-300"
                />
                <div className="absolute bottom-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#C00012] to-transparent" />
              </div>
            </Link>
          </div>

          {/* Primary Operations Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;

              // Highlighted pill for Report Incident
              if (item.isSpecial) {
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => {
                      handleNavClick();
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(new CustomEvent("vigilora:new-report"));
                      }
                    }}
                    className={cn(
                      "flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-oswald uppercase tracking-wider font-semibold transition-colors duration-150 relative overflow-hidden group",
                      isActive
                        ? "bg-gradient-to-r from-[#F00018]/30 via-[#790009]/30 to-transparent text-[#F2EEE9] border border-[#F00018]/50 shadow-lg shadow-black/60"
                        : "bg-[#0A0B10] text-[#F2EEE9] hover:text-white border border-[#790009]/40 hover:border-[#C00012]/70 hover:bg-[#111A29]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-[#F00018] group-hover:scale-110 transition-transform" />
                      <span>{item.name}</span>
                    </div>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#F00018] animate-pulse" />
                  </Link>
                );
              }

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={handleNavClick}
                  className={cn(
                    "flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-oswald uppercase tracking-wider font-medium transition-colors duration-150 group relative",
                    isActive
                      ? "bg-gradient-to-r from-[#790009]/40 via-[#790009]/20 to-transparent text-[#F2EEE9] border-l-2 border-[#C00012] font-semibold shadow-[0_0_14px_rgba(192,0,18,0.25)]"
                      : "text-[#92929A] hover:text-[#F2EEE9] hover:bg-gradient-to-r hover:from-[#790009]/25 hover:to-transparent hover:border-l-2 hover:border-[#C00012]/60"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={cn(
                        "w-4 h-4 transition-colors",
                        isActive
                          ? "text-[#F00018]"
                          : "text-[#92929A] group-hover:text-[#F00018]"
                      )}
                    />
                    <span>{item.name}</span>
                  </div>
                  {item.hasSubmenu && (
                    <ChevronDown className="w-3.5 h-3.5 text-[#92929A] group-hover:text-white transition-colors" />
                  )}
                </Link>
              );
            })}

            {/* Decorative Gothic Illustration in Lower Sidebar Section */}
            <div className="pt-3 pb-1">
              <div className="relative rounded-md overflow-hidden border border-[#790009]/45 bg-[#0A0B10] shadow-xl shadow-black/90 group">
                {/* Subtle crimson ambient backlight */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-24 bg-[#790009]/20 rounded-full blur-xl pointer-events-none" />

                <div className="relative h-36 w-full">
                  <Image
                    src="/artwork/gothic/gothic-skull-monocle.webp"
                    alt="Gothic Skull with Monocle and Crimson Hat"
                    fill
                    sizes="240px"
                    className="object-cover object-center opacity-85 group-hover:opacity-100 transition-opacity duration-500 filter contrast-[1.08]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A0B10] via-[#0A0B10]/40 to-transparent" />
                  <div className="absolute inset-0 ring-1 ring-inset ring-[#790009]/30 pointer-events-none" />

                  <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[9px] font-mono tracking-widest text-[#92929A]">
                    <span className="text-[#F00018] font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F00018] animate-pulse" />
                      NOCTURNAL VIGIL
                    </span>
                    <span>GRID-04</span>
                  </div>
                </div>
              </div>
            </div>
          </nav>

          {/* Sidebar Footer Section: Help, Operator Profile & Theme Toggle */}
          <div className="p-3 border-t border-[#790009]/25 space-y-2.5 bg-[#050506]/95">
            {/* Help & Support link */}
            <Link
              href="/settings"
              onClick={handleNavClick}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-oswald uppercase tracking-wider text-[#92929A] hover:text-[#F2EEE9] hover:bg-white/[0.04] transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-[#92929A]" />
              <span>Help & Support</span>
            </Link>

            {/* Operator Profile Card & Functional Logout */}
            {user ? (
              <div className="p-2 rounded-md bg-[#0A0B10] border border-[#790009]/30 space-y-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#790009]/35 border border-[#F00018]/40 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[#F00018]" />
                  </div>
                  <div className="truncate text-left leading-tight min-w-0 flex-1">
                    <div className="text-xs font-oswald uppercase tracking-wider font-bold text-[#F2EEE9] truncate">
                      {user.name || "Terminal Operator"}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={cn(
                          "px-1.5 py-0.2 rounded text-[9px] font-mono font-bold tracking-wider uppercase border",
                          rolePresentation.badgeStyle.bg,
                          rolePresentation.badgeStyle.text,
                          rolePresentation.badgeStyle.border
                        )}
                      >
                        {rolePresentation.label}
                      </span>
                      <span
                        className="text-[10px] text-[#92929A] truncate font-mono"
                        title={rolePresentation.description}
                      >
                        {user.callsign || rolePresentation.description}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    handleNavClick();
                    router.push("/login");
                  }}
                  className="flex items-center justify-center gap-1.5 w-full py-1.5 px-2 rounded-md text-[11px] font-oswald uppercase tracking-wider text-[#92929A] hover:text-[#F00018] hover:bg-[#790009]/20 border border-transparent hover:border-[#790009]/40 transition-colors duration-150"
                  title="Sign Out of Terminal"
                >
                  <LogOut className="w-3.5 h-3.5 text-[#F00018]" />
                  <span>Sign Out Terminal</span>
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                onClick={handleNavClick}
                className="flex items-center justify-between p-2 rounded-md bg-[#0A0B10] border border-[#790009]/30 hover:border-[#C00012]/60 transition-colors duration-150 group"
                title="Sign In to Operator Terminal"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#790009]/35 border border-[#F00018]/40 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[#F00018]" />
                  </div>
                  <div className="truncate text-left leading-tight">
                    <div className="text-xs font-oswald uppercase tracking-wider font-bold text-[#F2EEE9] truncate group-hover:text-white">
                      Sign In
                    </div>
                    <div className="text-[10px] text-[#92929A] truncate font-mono">
                      Operator Terminal
                    </div>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#92929A] shrink-0 ml-1" />
              </Link>
            )}

            {/* Tactical Atmosphere Status: Locked to Canonical Victorian Gothic Theme */}
            <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-[#0A0B10] border border-[#790009]/30 text-[11px] font-oswald uppercase tracking-wider text-[#92929A]">
              <span className="flex items-center gap-1.5 text-[#F2EEE9] font-semibold">
                <Moon className="w-3.5 h-3.5 text-[#F00018]" />
                <span>Nocturnal Dispatch</span>
              </span>
              <span className="text-[10px] font-mono text-[#F00018] bg-[#790009]/30 px-1.5 py-0.5 rounded border border-[#790009]/50 font-bold">
                ACTIVE
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
