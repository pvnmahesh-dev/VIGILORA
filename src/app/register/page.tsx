"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Users2,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Info,
} from "lucide-react";
import { VigiloraLogo } from "@/components/ui/VigiloraLogo";
import { Button } from "@/components/ui/Button";
import { HauntedCampusSilhouette } from "@/components/ui/HauntedCampusSilhouette";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [callSign, setCallSign] = useState("");
  const [sector, setSector] = useState("Alpha Sector – North Campus");
  const [authKey, setAuthKey] = useState("VGL-DISPATCH-9911");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setNotice(
        "Enrollment Advisory: Operator accounts and terminal keys must be provisioned directly by your Campus Dispatch Supervisor. Public self-registration is disabled for grid security. Please sign in with credentials issued by your supervisor."
      );
    }, 400);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden bg-gothic-texture bg-[#050506]">
      {/* Background Layer 1: Atmospheric Gothic Spotlight & Supernatural Artwork */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-20">
        <Image
          src="/artwork/gothic/cinematic-spotlight-atmosphere.webp"
          alt="Gothic Cinematic Spotlights"
          fill
          priority
          sizes="100vw"
          className="object-cover object-top opacity-25 filter contrast-125 brightness-80 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050506] via-[#050506]/80 to-[#050506]/60" />
      </div>

      {/* Background Layer 2: Gothic Ambient Crimson & Moonlight Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-[#790009]/18 rounded-full blur-[140px] pointer-events-none -z-10 animate-crimson-ambient" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-[#C00012]/10 rounded-full blur-[110px] pointer-events-none -z-10" />

      {/* Background Layer 3: Edge Characters from Original Reference (Desktop Margins) */}
      <div className="absolute bottom-0 left-0 w-[300px] h-[520px] pointer-events-none select-none hidden lg:block -z-10 opacity-20 overflow-hidden">
        <Image
          src="/artwork/gothic/skeleton-sentinel-cemetery.webp"
          alt="Skeleton Sentinel"
          fill
          sizes="300px"
          className="object-contain object-bottom-left filter contrast-110 brightness-85 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#050506]" />
      </div>
      <div className="absolute top-0 right-0 w-[280px] h-[560px] pointer-events-none select-none hidden lg:block -z-10 opacity-22 overflow-hidden">
        <Image
          src="/artwork/gothic/haunted-cemetery-trees.webp"
          alt="Haunted Cemetery Trees"
          fill
          sizes="280px"
          className="object-contain object-top-right filter contrast-110 brightness-85 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#050506]" />
      </div>

      {/* Atmospheric Silhouette Ground Watermark */}
      <div className="absolute bottom-0 left-0 right-0 h-44 opacity-25 pointer-events-none overflow-hidden -z-10">
        <HauntedCampusSilhouette className="w-full h-full object-cover" />
      </div>

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Prominent Logo & Brand Lockup */}
        <div className="flex flex-col items-center text-center space-y-3">
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
          <p className="text-xs font-oswald uppercase tracking-wider text-[#92929A] max-w-xs font-medium">
            Incident Intelligence & Emergency Response Coordination
          </p>
        </div>

        {/* Registration Card */}
        <div className="p-6 sm:p-7 rounded-md bg-[#0A0B10]/95 border border-[#790009]/40 shadow-2xl backdrop-blur-xl relative">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#790009]/25">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
              <Users2 className="w-4 h-4 text-[#F00018]" />
              <span>Tactical Unit Responder Registration</span>
            </div>
            <span className="text-[10px] font-mono text-[#92929A]">RESTRICTED</span>
          </div>

          {/* Supervisor Provisioning Policy Notice */}
          <div className="mb-5 p-3.5 rounded-md bg-[#050506] border border-[#790009]/40 text-xs text-[#92929A] space-y-1.5 font-sans">
            <div className="flex items-center gap-2 text-[#F00018] font-oswald uppercase tracking-wider font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Supervisor Provisioning Required</span>
            </div>
            <p className="text-[11px] leading-relaxed text-[#92929A]">
              Operator accounts and terminal access keys are issued by Campus Dispatch Supervisors. Public self-registration is disabled for grid security.
            </p>
          </div>

          {notice && (
            <div className="mb-5 p-3 rounded-md bg-[#180306] border border-[#790009]/80 text-[#F00018] text-xs flex items-start gap-2 shadow-inner">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <span className="leading-relaxed block text-[#F2EEE9] font-sans">{notice}</span>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-[#F00018] hover:text-[#ff3b45] font-oswald uppercase tracking-wider font-bold"
                >
                  <span>Sign In to Terminal →</span>
                </Link>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Officer Alex Vance"
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#050506] border border-[#790009]/40 text-[#F2EEE9] text-xs sm:text-sm font-sans focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
                  Tactical Call Sign
                </label>
                <input
                  type="text"
                  required
                  value={callSign}
                  onChange={(e) => setCallSign(e.target.value)}
                  placeholder="ECHO-4"
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#050506] border border-[#790009]/40 text-[#F2EEE9] text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
                Primary Assigned Campus Sector
              </label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-md bg-[#050506] border border-[#790009]/40 text-[#F2EEE9] text-xs sm:text-sm font-oswald uppercase focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012]"
              >
                <option value="Alpha Sector – North Quad & Science Complex" className="bg-[#0A0B10]">
                  Alpha Sector – North Quad & Science Complex
                </option>
                <option value="Bravo Sector – Student Union & Plaza" className="bg-[#0A0B10]">
                  Bravo Sector – Student Union & Plaza
                </option>
                <option value="Charlie Sector – Athletic Arena & Stadium" className="bg-[#0A0B10]">
                  Charlie Sector – Athletic Arena & Stadium
                </option>
                <option value="Delta Sector – Residential Housing East" className="bg-[#0A0B10]">
                  Delta Sector – Residential Housing East
                </option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider">
                  Campus Authorization Token
                </label>
                <span className="text-[10px] font-mono text-[#92929A]">Provided by Dispatch</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={authKey}
                  onChange={(e) => setAuthKey(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#050506] border border-[#790009]/40 text-[#F2EEE9] text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] font-mono"
                />
                <ShieldCheck className="w-4 h-4 text-[#F00018] absolute right-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
                Create Secure Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#050506] border border-[#790009]/40 text-[#F2EEE9] text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] font-mono"
                />
                <KeyRound className="w-4 h-4 text-[#92929A] absolute right-3 top-3" />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full justify-center mt-2 shadow-lg shadow-black/60"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>Verifying Authorization...</span>
              ) : (
                <span className="flex items-center gap-2">
                  <span>Submit Unit Credentials</span>
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>

          {/* Link to Login */}
          <div className="mt-5 pt-4 border-t border-[#790009]/25 flex items-center justify-between text-xs">
            <span className="text-[#92929A] text-[11px]">Already registered?</span>
            <Link
              href="/login"
              className="text-[#F00018] hover:text-[#ff3b45] font-oswald uppercase tracking-wider font-semibold inline-flex items-center gap-1"
            >
              Sign In to Terminal →
            </Link>
          </div>
        </div>

        {/* Return to Dashboard */}
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
