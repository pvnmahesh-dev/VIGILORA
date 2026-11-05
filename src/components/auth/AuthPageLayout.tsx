"use client";

import React from "react";
import Link from "next/link";
import { VigiloraLogo } from "@/components/ui/VigiloraLogo";

interface AuthPageLayoutProps {
  children: React.ReactNode;
}

/**
 * Shared Gothic Authentication Layout for /login and /register
 *
 * Guarantees identical visual presentation, stacking context isolation,
 * and reliable full-viewport background rendering across all viewports.
 */
export function AuthPageLayout({ children }: AuthPageLayoutProps) {
  return (
    <div className="min-h-screen w-full relative isolate flex flex-col justify-center items-center px-4 py-8 sm:py-12 overflow-x-hidden">
      {/* 1. Full-viewport Gothic Campus Background with Subtle Atmospheric Movement */}
      <div
        className="fixed inset-0 pointer-events-none z-0 bg-cover bg-center bg-no-repeat md:bg-fixed animate-auth-breathe"
        style={{
          backgroundImage: "url('/images/vigilora-auth-background.png')",
        }}
      />

      {/* 2. Separate Dark Radial Vignette Overlay: Preserves Gothic architecture, moonlight & crimson lighting */}
      <div
        className="fixed inset-0 pointer-events-none z-[1]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(5,5,8,0.45) 0%, rgba(5,5,8,0.65) 55%, rgba(5,5,8,0.85) 100%)",
        }}
      />

      {/* 3. Ambient Crimson Glow Accent */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-[#790009]/15 rounded-full blur-[140px] pointer-events-none z-[1] animate-crimson-ambient" />

      {/* 4. Page Content Container */}
      <div className="w-full max-w-xl sm:max-w-2xl relative z-10 space-y-5">
        {/* Logo & Platform Title Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <Link
            href="/"
            className="flex flex-col items-center group transition-transform hover:scale-[1.02]"
            title="VIGILORA Platform"
          >
            <VigiloraLogo
              variant="banner"
              size="xl"
              glow="pulse"
              priority={true}
            />
          </Link>
          <p className="text-[11px] font-oswald uppercase tracking-widest text-[#92929A] max-w-sm font-medium">
            Incident Intelligence & Emergency Response Coordination
          </p>
        </div>

        {/* Auth Card (Login or Register) */}
        {children}

        {/* Return to Public Feed shortcut */}
        <div className="text-center">
          <Link
            href="/"
            className="text-xs font-mono text-[#92929A] hover:text-[#F2EEE9] transition-colors inline-flex items-center gap-1.5"
          >
            <span>← Return to Public Dashboard Feed</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

