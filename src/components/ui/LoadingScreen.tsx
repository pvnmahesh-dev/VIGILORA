"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  statusText?: string;
  className?: string;
  fullScreen?: boolean;
}

export function LoadingScreen({
  statusText = "INITIALIZING SECURE DISPATCH CONSOLE...",
  className,
  fullScreen = true,
}: LoadingScreenProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center bg-[#050506] text-[#E8E5E2] px-4 select-none",
        fullScreen ? "fixed inset-0 z-50 min-h-screen" : "w-full py-16",
        className
      )}
    >
      {/* Background atmospheric ambient lighting */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#87000A]/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#C90012]/10 rounded-full blur-3xl animate-pulse [animation-delay:1.5s]" />
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-sm text-center">
        {/* Animated Glow Wrapper around Logo */}
        <div className="relative flex items-center justify-center mb-6">
          {/* Subtle Outer Neon Ring with Crimson Accent */}
          <div className="absolute -inset-3 rounded-2xl bg-gradient-to-tr from-[#cb0000]/30 via-transparent to-[#f01420]/30 blur-md animate-vigilora-glow" />

          {/* Logo Frame */}
          <div className="relative w-72 sm:w-80 h-24 sm:h-28 rounded-xl overflow-hidden bg-[#000000] border border-[#303436] shadow-2xl flex items-center justify-center">
            <Image
              src="/vigilora-logo.png"
              alt="VIGILORA"
              fill
              priority
              sizes="320px"
              className="object-cover object-center pointer-events-none transition-transform"
            />
            <div className="absolute bottom-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#cb0000] to-transparent" />
          </div>
        </div>

        {/* Wordmark */}
        <div className="space-y-1 mb-5">
          <h1 className="text-2xl sm:text-3xl font-cinzel font-bold tracking-widest text-[#E8E5E2]">
            VIGILORA
          </h1>
          <p className="text-[11px] font-oswald uppercase tracking-widest text-[#85858B]">
            Incident Intelligence & Emergency Response Coordination
          </p>
        </div>

        {/* Tactical Loading Progress Bar */}
        <div className="w-48 h-1 rounded-full bg-[#111722] overflow-hidden mb-3 relative border border-[#87000A]/20">
          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#87000A] via-[#C90012] to-[#F01420] rounded-full animate-progress-slide shadow-[0_0_8px_#F01420]" />
        </div>

        {/* Status Line */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F01420] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C90012]" />
          </span>
          <span className="text-[10px] font-mono tracking-widest text-[#85858B] uppercase">
            {statusText}
          </span>
        </div>
      </div>
    </div>
  );
}
