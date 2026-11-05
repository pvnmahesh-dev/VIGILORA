"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopNavigation } from "./TopNavigation";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { IncidentProvider } from "@/context/IncidentContext";
import { useAuth } from "@/context/AuthContext";
import { VigiloraLogo } from "@/components/ui/VigiloraLogo";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isAuthPage) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, isAuthPage, router]);

  // Avoid redirect loops and UI flashing while initial session check is running
  if (isLoading && !isAuthPage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#050506] text-[#F2EEE9] relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#790009]/15 rounded-full blur-[120px] pointer-events-none -z-10" />
        <div className="flex flex-col items-center gap-3 relative z-10">
          <VigiloraLogo variant="icon" size="lg" glow="pulse" priority={true} />
          <div className="flex items-center gap-2 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F00018] animate-ping" />
            <span className="text-xs font-oswald uppercase tracking-widest text-[#92929A]">
              Verifying Terminal Authorization...
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Prevent flash of protected layout when unauthenticated
  if (!isLoading && !isAuthenticated && !isAuthPage) {
    return null;
  }

  return (
    <IncidentProvider>
      {isAuthPage ? (
        <>{children}</>
      ) : (
        <div className="flex flex-col h-screen overflow-hidden bg-[#050506] text-[#F2EEE9]">
          {/* Top Navigation - Full-width stationary header with single toggle control */}
          <TopNavigation
            isSidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          />

          <div className="flex flex-1 min-w-0 overflow-hidden relative">
            {/* Sidebar Overlay - Slides in smoothly over dashboard without layout reflow */}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main Content Area - Stationary 100% width, zero layout shift */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden w-full">
              {/* Global Demo Banner Notice */}
              <div className="px-4 md:px-6 pt-2.5">
                <DemoBanner />
              </div>

              {/* Dynamic Page Content */}
              <main className="flex-1 overflow-y-auto px-4 md:px-6 py-3 md:py-4 bg-ambient-gothic">
                <div className="w-full max-w-[1720px] mx-auto">{children}</div>
              </main>
            </div>
          </div>
        </div>
      )}
    </IncidentProvider>
  );
}
