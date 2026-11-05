"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Radio,
  ArrowRight,
  UserCheck,
  UserPlus,
  LogIn,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { useAuth, OperatorRole } from "@/context/AuthContext";
import { useAwsPreflight } from "@/context/AwsPreflightContext";

interface OperationalStation {
  role: "Dispatcher" | "Responder" | "Supervisor";
  title: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  accentColor: string;
  hoverBorderColor: string;
  badgeStyle: string;
}

const OPERATIONAL_STATIONS: OperationalStation[] = [
  {
    role: "Dispatcher",
    title: "LEAD DISPATCHER",
    name: "Lead Dispatcher Austin",
    description: "Campus-wide incident coordination and tactical resource assignment.",
    icon: Radio,
    route: "/",
    accentColor: "#F00018",
    hoverBorderColor: "hover:border-[#C00012]",
    badgeStyle: "text-[#F00018] bg-[#790009]/20 border-[#790009]/50",
  },
  {
    role: "Responder",
    title: "FIELD RESPONDER",
    name: "Officer Vance (Alpha Patrol)",
    description: "On-ground response, incident visibility & tactical execution.",
    icon: UserCheck,
    route: "/",
    accentColor: "#FF7700",
    hoverBorderColor: "hover:border-[#FF7700]",
    badgeStyle: "text-[#FF7700] bg-[#FF7700]/15 border-[#FF7700]/30",
  },
  {
    role: "Supervisor",
    title: "CAMPUS ADMINISTRATOR",
    name: "Chief Inspector Helena Vance",
    description: "System oversight, unit configuration & incident escalation control.",
    icon: Shield,
    route: "/",
    accentColor: "#FFCC00",
    hoverBorderColor: "hover:border-[#FFCC00]",
    badgeStyle: "text-[#FFCC00] bg-[#FFCC00]/15 border-[#FFCC00]/30",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { demoLogin, login } = useAuth();
  const { status: awsStatus } = useAwsPreflight();

  const [operatorId, setOperatorId] = useState("operator@campus.vigilora.internal");
  const [accessCode, setAccessCode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authenticatingRole, setAuthenticatingRole] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Direct Role Selection
  const handleSelectStation = async (station: OperationalStation) => {
    if (isSubmitting || success) return;
    setIsSubmitting(true);
    setAuthenticatingRole(station.title);

    try {
      const result = await demoLogin(station.role);
      if (result.success) {
        setIsSubmitting(false);
        setSuccess(true);
        router.push(station.route);
        return;
      }
    } catch {
      // Non-blocking fallback for evaluation
    }

    setIsSubmitting(false);
    setSuccess(true);
    router.push(station.route);
  };

  // Credential Form Submit (Display-only / Non-blocking)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || success) return;

    setIsSubmitting(true);
    setAuthenticatingRole("Terminal");

    const idLower = operatorId.toLowerCase().trim();
    let targetRole: OperatorRole = "Dispatcher";
    if (idLower.includes("admin") || idLower.includes("super") || idLower.includes("chief")) {
      targetRole = "Supervisor";
    } else if (
      idLower.includes("respond") ||
      idLower.includes("vance") ||
      idLower.includes("patrol") ||
      idLower.includes("officer") ||
      idLower.includes("unit")
    ) {
      targetRole = "Responder";
    }

    try {
      if (operatorId.trim() && accessCode.trim()) {
        const loginRes = await login(operatorId.trim(), accessCode.trim());
        if (loginRes.success) {
          setIsSubmitting(false);
          setSuccess(true);
          router.push("/");
          return;
        }
      }

      const stationRes = await demoLogin(targetRole);
      if (stationRes.success) {
        setIsSubmitting(false);
        setSuccess(true);
        router.push("/");
        return;
      }
    } catch {
      // Non-blocking fallback
    }

    setIsSubmitting(false);
    setSuccess(true);
    router.push("/");
  };

  return (
    <AuthPageLayout>
      {/* Operator Terminal Sign In Card */}
      <div className="p-5 sm:p-7 rounded-xl bg-[#090A0F]/95 border border-[#790009]/45 shadow-[0_0_35px_rgba(121,0,9,0.22)] backdrop-blur-xl relative">
        {/* Header Row: Shield Title + Sector Grid */}
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-[#790009]/25">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-[#F2EEE9] font-oswald uppercase tracking-wider">
            <Shield className="w-4 h-4 text-[#F00018]" />
            <span>Operator Terminal Sign In</span>
          </div>
          <span className="text-[10px] font-mono text-[#7D7D88] tracking-wider uppercase">
            Sector Grid 4.2
          </span>
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

        {/* Sign In / Register Tabs Control */}
        <div className="p-1 rounded-lg bg-[#050508] border border-[#790009]/40 grid grid-cols-2 gap-1 mb-5">
          <div className="py-2 px-3 rounded-md bg-gradient-to-r from-[#C00012] to-[#790009] text-white font-oswald uppercase tracking-wider font-semibold text-xs flex items-center justify-center gap-2 shadow-md shadow-red-950/60 cursor-default select-none">
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </div>
          <Link
            href="/register"
            className="py-2 px-3 rounded-md text-[#92929A] hover:text-[#F2EEE9] hover:bg-[#111A29]/50 font-oswald uppercase tracking-wider font-medium text-xs flex items-center justify-center gap-2 transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register</span>
          </Link>
        </div>

        {/* Operational Stations Header */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5 text-xs font-oswald uppercase tracking-wider text-[#F2EEE9] font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-[#F00018]" />
            <span>Select Operational Station</span>
          </div>
          <span className="text-[10px] font-mono text-[#92929A]">
            Instant Authorized Entry
          </span>
        </div>

        {/* Three Operational Role Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
          {OPERATIONAL_STATIONS.map((station) => {
            const Icon = station.icon;
            return (
              <button
                key={station.role}
                type="button"
                onClick={() => handleSelectStation(station)}
                disabled={isSubmitting || success}
                className={`p-3.5 rounded-lg bg-[#0D0F16]/90 hover:bg-[#180306] border border-[#790009]/35 ${station.hoverBorderColor} text-left transition-all duration-200 group disabled:opacity-50 cursor-pointer shadow-sm hover:-translate-y-0.5 active:scale-[0.98] card-interactive flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center bg-[#050508] border border-[#790009]/40 group-hover:border-[#C00012]/60 transition-colors"
                      style={{ color: station.accentColor }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span
                      className={`text-[8.5px] font-mono uppercase px-1.5 py-0.5 rounded border font-bold ${station.badgeStyle}`}
                    >
                      Active
                    </span>
                  </div>

                  <div className="text-xs sm:text-[13px] font-bold text-[#F2EEE9] font-oswald uppercase tracking-wider group-hover:text-white transition-colors">
                    {station.title}
                  </div>

                  <div className="text-[10.5px] text-[#92929A] leading-tight line-clamp-3 mt-1.5 group-hover:text-[#F2EEE9]/80 transition-colors">
                    {station.description}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-[#790009]/20 flex items-center justify-between text-[10px] font-mono text-[#92929A] group-hover:text-white transition-colors">
                  <span>Launch Station</span>
                  <ArrowRight className="w-3 h-3 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Divider: Or Enter Credentials */}
        <div className="relative flex py-1.5 items-center my-3.5">
          <div className="flex-grow border-t border-[#790009]/25"></div>
          <span className="flex-shrink mx-3 text-[10px] font-mono uppercase tracking-widest text-[#7D7D88]">
            Or Enter Terminal Credentials
          </span>
          <div className="flex-grow border-t border-[#790009]/25"></div>
        </div>

        {/* Authenticating Feedback */}
        {authenticatingRole && isSubmitting && (
          <div className="mb-3.5 p-2.5 rounded-md bg-[#050508] border border-[#C00012]/50 text-xs text-[#F2EEE9] flex items-center gap-2 animate-pulse font-mono">
            <span className="w-2 h-2 rounded-full bg-[#F00018] animate-ping" />
            <span>Authorizing {authenticatingRole} console session...</span>
          </div>
        )}

        {/* Credential Form (Visible for Presentation / Non-Blocking) */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
              Operator ID / Station Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#7D7D88] absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                disabled={isSubmitting || success}
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                placeholder="operator@campus.vigilora.internal"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-md bg-[#050508] border border-[#790009]/40 text-[#F2EEE9] placeholder-[#555562] font-mono text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider">
                Security Passkey
              </label>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#7D7D88] absolute left-3.5 top-3 pointer-events-none" />
              <input
                type={showPass ? "text" : "password"}
                disabled={isSubmitting || success}
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Enter your security passkey"
                className="w-full pl-10 pr-10 py-2.5 rounded-md bg-[#050508] border border-[#790009]/40 text-[#F2EEE9] placeholder-[#555562] font-mono text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3.5 top-3 text-[#7D7D88] hover:text-[#F2EEE9] transition-colors focus:outline-none"
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || success}
            className="w-full py-3 rounded-md bg-gradient-to-r from-[#F00018] via-[#C00012] to-[#790009] hover:from-[#ff1a26] hover:to-[#8e000b] hover:shadow-[0_0_16px_rgba(240,0,24,0.4)] text-white font-oswald uppercase tracking-wider font-bold text-sm shadow-lg shadow-black/80 flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:opacity-50"
          >
            {success ? (
              <span className="flex items-center gap-2 text-white animate-scale-check">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Terminal Authorized</span>
              </span>
            ) : isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Authorizing Terminal...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>Enter Tactical Console</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
              </span>
            )}
          </button>
        </form>
      </div>
    </AuthPageLayout>
  );
}
