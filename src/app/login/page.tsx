"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Shield,
  KeyRound,
  Radio,
  ArrowRight,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { VigiloraLogo } from "@/components/ui/VigiloraLogo";
import { Button } from "@/components/ui/Button";
import { HauntedCampusSilhouette } from "@/components/ui/HauntedCampusSilhouette";
import { useAuth } from "@/context/AuthContext";
import { useAwsPreflight } from "@/context/AwsPreflightContext";

export default function LoginPage() {
  const router = useRouter();
  const { login, demoLogin } = useAuth();
  const { status: awsStatus } = useAwsPreflight();

  const [operatorId, setOperatorId] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authenticatingRole, setAuthenticatingRole] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleDemoRoleLogin = async (roleName: "Dispatcher" | "Responder" | "Supervisor") => {
    if (isSubmitting || success) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    setAuthenticatingRole(roleName);

    const result = await demoLogin(roleName);

    if (!result.success) {
      setIsSubmitting(false);
      setAuthenticatingRole(null);
      setErrorMessage(result.error || `Failed to authenticate as ${roleName}.`);
      return;
    }

    setIsSubmitting(false);
    setSuccess(true);
    router.push("/");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || success) return;

    if (!operatorId.trim() || !accessCode) {
      setErrorMessage("Operator ID (email) and Security Passkey are required.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    setAuthenticatingRole(null);

    const result = await login(operatorId.trim(), accessCode);

    if (!result.success) {
      setIsSubmitting(false);
      setErrorMessage(
        result.error || "Terminal authentication rejected. Invalid operator credentials."
      );
      return;
    }

    setIsSubmitting(false);
    setSuccess(true);
    router.push("/");
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

        {/* Tactical Login Card */}
        <div className="p-6 sm:p-7 rounded-md bg-[#0A0B10]/95 border border-[#790009]/40 shadow-2xl backdrop-blur-xl relative">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#790009]/25">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F2EEE9] font-oswald uppercase tracking-wider">
              <Shield className="w-4 h-4 text-[#F00018]" />
              <span>Operator Terminal Sign In</span>
            </div>
            <span className="text-[10px] font-mono text-[#92929A]">SECTOR GRID 4.2</span>
          </div>

          {/* AWS Preflight Warning Alerts */}
          {awsStatus === "auth_expired" && (
            <div className="mb-4 p-3 rounded-md bg-[#180306] border border-[#F00018]/60 text-xs text-[#F2EEE9] space-y-1 animate-pulse">
              <div className="flex items-center gap-1.5 font-oswald uppercase text-[#F00018] font-bold">
                <AlertTriangle className="w-4 h-4 text-[#F00018] shrink-0" />
                <span>AWS Session Alert</span>
              </div>
              <p className="text-[11px] text-[#F2EEE9] font-semibold leading-snug">
                AWS SESSION EXPIRED — Run aws login in your terminal and refresh the application.
              </p>
            </div>
          )}

          {awsStatus === "service_unavailable" && (
            <div className="mb-4 p-3 rounded-md bg-[#201005] border border-amber-600/50 text-xs text-[#F2EEE9] space-y-1">
              <div className="flex items-center gap-1.5 font-oswald uppercase text-amber-400 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>AWS Cloud Preflight</span>
              </div>
              <p className="text-[11px] text-[#F2EEE9] leading-snug">
                AWS SERVICE UNAVAILABLE — Cloud resources could not be reached. Verify network connectivity.
              </p>
            </div>
          )}

          {/* Demo Role Station Quick Access Panel */}
          <div className="mb-5 p-3.5 rounded-md bg-[#050506] border border-[#790009]/35 shadow-inner space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-oswald uppercase tracking-wider text-[#F2EEE9] font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-[#F00018]" />
                <span>Demo Role Quick Access</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[9px] font-mono uppercase bg-[#790009]/30 text-[#F00018] border border-[#790009]/40 font-bold">
                Local Enclave
              </span>
            </div>
            <p className="text-[11px] text-[#92929A] leading-tight">
              One-click station authentication for hackathon evaluation. Executes genuine server session creation and RBAC.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
              {/* Lead Dispatcher */}
              <button
                type="button"
                onClick={() => handleDemoRoleLogin("Dispatcher")}
                disabled={isSubmitting || success}
                className="p-2.5 rounded-md bg-[#111A29]/70 hover:bg-[#180306] border border-[#790009]/35 hover:border-[#C00012] text-left transition-all group disabled:opacity-50 cursor-pointer shadow-sm hover:scale-[1.02]"
              >
                <div className="flex items-center justify-between mb-1">
                  <Radio className="w-3.5 h-3.5 text-[#F00018]" />
                  <span className="text-[9px] font-mono text-[#92929A] group-hover:text-white">Active</span>
                </div>
                <div className="text-xs font-bold text-[#F2EEE9] font-oswald uppercase tracking-wider truncate">
                  Lead Dispatcher
                </div>
                <div className="text-[10px] font-mono text-[#92929A] truncate">
                  Austin • Queue
                </div>
              </button>

              {/* Field Responder */}
              <button
                type="button"
                onClick={() => handleDemoRoleLogin("Responder")}
                disabled={isSubmitting || success}
                className="p-2.5 rounded-md bg-[#111A29]/70 hover:bg-[#180306] border border-[#790009]/35 hover:border-[#FF7700] text-left transition-all group disabled:opacity-50 cursor-pointer shadow-sm hover:scale-[1.02]"
              >
                <div className="flex items-center justify-between mb-1">
                  <UserCheck className="w-3.5 h-3.5 text-[#FF7700]" />
                  <span className="text-[9px] font-mono text-[#92929A] group-hover:text-white">Active</span>
                </div>
                <div className="text-xs font-bold text-[#F2EEE9] font-oswald uppercase tracking-wider truncate">
                  Field Responder
                </div>
                <div className="text-[10px] font-mono text-[#92929A] truncate">
                  Vance • Tactical
                </div>
              </button>

              {/* Campus Administrator */}
              <button
                type="button"
                onClick={() => handleDemoRoleLogin("Supervisor")}
                disabled={isSubmitting || success}
                className="p-2.5 rounded-md bg-[#111A29]/70 hover:bg-[#180306] border border-[#790009]/35 hover:border-[#FFCC00] text-left transition-all group disabled:opacity-50 cursor-pointer shadow-sm hover:scale-[1.02]"
              >
                <div className="flex items-center justify-between mb-1">
                  <Shield className="w-3.5 h-3.5 text-[#FFCC00]" />
                  <span className="text-[9px] font-mono text-[#92929A] group-hover:text-white">Active</span>
                </div>
                <div className="text-xs font-bold text-[#F2EEE9] font-oswald uppercase tracking-wider truncate">
                  Administrator
                </div>
                <div className="text-[10px] font-mono text-[#92929A] truncate">
                  Supervisor • Root
                </div>
              </button>
            </div>
          </div>

          {/* Gothic Separator */}
          <div className="relative flex py-1 items-center mb-4">
            <div className="flex-grow border-t border-[#790009]/25"></div>
            <span className="flex-shrink mx-3 text-[10px] font-oswald uppercase tracking-wider text-[#92929A]">
              Or Sign In With Passkey
            </span>
            <div className="flex-grow border-t border-[#790009]/25"></div>
          </div>

          {/* Status when authenticating */}
          {authenticatingRole && isSubmitting && (
            <div className="mb-4 p-3 rounded-md bg-[#050506] border border-[#C00012]/50 text-xs text-[#F2EEE9] flex items-center gap-2 animate-pulse font-mono">
              <span className="w-2 h-2 rounded-full bg-[#F00018] animate-ping" />
              <span>Authenticating {authenticatingRole} station terminal...</span>
            </div>
          )}

          {/* Error Notice */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-md bg-[#180306] border border-[#790009]/80 text-[#F00018] text-xs flex items-start gap-2 shadow-inner">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
                Operator ID / Station Email
              </label>
              <input
                type="email"
                required
                disabled={isSubmitting || success}
                value={operatorId}
                onChange={(e) => {
                  setOperatorId(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="operator@campus.vigilora.internal"
                className="w-full px-3.5 py-2.5 rounded-md bg-[#050506] border border-[#790009]/40 text-[#F2EEE9] text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider">
                  Security Passkey
                </label>
                <span className="text-[10px] font-mono text-[#92929A]">Encrypted</span>
              </div>
              <div className="relative">
                <input
                  type="password"
                  required
                  disabled={isSubmitting || success}
                  value={accessCode}
                  onChange={(e) => {
                    setAccessCode(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Enter your security passkey"
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#050506] border border-[#790009]/40 text-[#F2EEE9] text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <KeyRound className="w-4 h-4 text-[#92929A] absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full justify-center mt-2 shadow-lg shadow-black/60"
              disabled={isSubmitting || success}
            >
              {success ? (
                <span className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Terminal Authorized</span>
                </span>
              ) : isSubmitting ? (
                <span>{authenticatingRole ? `Authorizing ${authenticatingRole}...` : "Authenticating Passkey..."}</span>
              ) : (
                <span className="flex items-center gap-2">
                  <span>Enter Tactical Console</span>
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>

          {/* Quick Pre-fill Links */}
          <div className="mt-5 pt-4 border-t border-[#790009]/25 flex items-center justify-between text-xs">
            <span className="text-[#92929A] text-[11px]">Need access?</span>
            <Link
              href="/register"
              className="text-[#F00018] hover:text-[#ff2a36] font-oswald uppercase tracking-wider font-semibold inline-flex items-center gap-1"
            >
              Register Unit ID →
            </Link>
          </div>
        </div>

        {/* Return to Dashboard shortcut */}
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
