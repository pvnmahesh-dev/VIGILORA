"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  User,
  Tag,
  Building2,
  Key,
  Lock,
  Eye,
  EyeOff,
  ChevronDown,
  ArrowRight,
  LogIn,
  CheckCircle2,
} from "lucide-react";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const router = useRouter();
  const { demoLogin } = useAuth();

  const [fullName, setFullName] = useState("");
  const [callSign, setCallSign] = useState("");
  const [sector, setSector] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form Submission (Display-only / Non-blocking evaluation access)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || success) return;

    setIsSubmitting(true);

    try {
      // Authorize session directly in non-mandatory evaluation mode
      const result = await demoLogin("Responder");
      if (result.success) {
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
      {/* Tactical Unit Responder Registration Card */}
      <div className="p-5 sm:p-7 rounded-xl bg-[#090A0F]/95 border border-[#790009]/45 shadow-[0_0_35px_rgba(121,0,9,0.22)] backdrop-blur-xl relative">
        {/* Header Row */}
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-[#790009]/25">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-[#F2EEE9] font-oswald uppercase tracking-wider">
            <UserPlus className="w-4 h-4 text-[#F00018]" />
            <span>Tactical Unit Responder Registration</span>
          </div>
          <span className="text-[10px] font-mono text-[#7D7D88] tracking-wider uppercase">
            Field Enrollment
          </span>
        </div>

        {/* Sign In / Register Tabs Control */}
        <div className="p-1 rounded-lg bg-[#050508] border border-[#790009]/40 grid grid-cols-2 gap-1 mb-5">
          <Link
            href="/login"
            className="py-2 px-3 rounded-md text-[#92929A] hover:text-[#F2EEE9] hover:bg-[#111A29]/50 font-oswald uppercase tracking-wider font-medium text-xs flex items-center justify-center gap-2 transition-all"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </Link>
          <div className="py-2 px-3 rounded-md bg-gradient-to-r from-[#C00012] to-[#790009] text-white font-oswald uppercase tracking-wider font-semibold text-xs flex items-center justify-center gap-2 shadow-md shadow-red-950/60 cursor-default select-none">
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register</span>
          </div>
        </div>

        {/* Registration Form (Display-only / Non-Blocking) */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Full Name & Tactical Call Sign */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#7D7D88] absolute left-3.5 top-3 pointer-events-none" />
                <input
                  type="text"
                  disabled={isSubmitting || success}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-md bg-[#050508] border border-[#790009]/40 text-[#F2EEE9] placeholder-[#555562] font-sans text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
                Tactical Call Sign
              </label>
              <div className="relative">
                <Tag className="w-4 h-4 text-[#7D7D88] absolute left-3.5 top-3 pointer-events-none" />
                <input
                  type="text"
                  disabled={isSubmitting || success}
                  value={callSign}
                  onChange={(e) => setCallSign(e.target.value)}
                  placeholder="e.g. ECHO-4"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-md bg-[#050508] border border-[#790009]/40 text-[#F2EEE9] placeholder-[#555562] font-mono text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Primary Assigned Campus Sector */}
          <div>
            <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
              Primary Assigned Campus Sector
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-[#7D7D88] absolute left-3.5 top-3 pointer-events-none" />
              <select
                disabled={isSubmitting || success}
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-md bg-[#050508] border border-[#790009]/40 text-[#F2EEE9] font-sans text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] appearance-none cursor-pointer disabled:opacity-50"
              >
                <option value="" className="text-[#555562] bg-[#0A0B10]">
                  Select campus sector
                </option>
                <option value="North Complex" className="bg-[#0A0B10]">
                  Alpha Sector – North Quad & Science Complex
                </option>
                <option value="Student Union" className="bg-[#0A0B10]">
                  Bravo Sector – Student Union & Plaza
                </option>
                <option value="Athletic Arena" className="bg-[#0A0B10]">
                  Charlie Sector – Athletic Arena & Stadium
                </option>
                <option value="Housing East" className="bg-[#0A0B10]">
                  Delta Sector – Residential Housing East
                </option>
              </select>
              <ChevronDown className="w-4 h-4 text-[#7D7D88] absolute right-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Row 3: Campus Authorization Token */}
          <div>
            <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
              Campus Authorization Token
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-[#7D7D88] absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                disabled={isSubmitting || success}
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="VGL-DISPATCH-XXXX"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-md bg-[#050508] border border-[#790009]/40 text-[#F2EEE9] placeholder-[#555562] font-mono text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] disabled:opacity-50"
              />
            </div>
          </div>

          {/* Row 4: Create Secure Password */}
          <div>
            <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
              Create Secure Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#7D7D88] absolute left-3.5 top-3 pointer-events-none" />
              <input
                type={showPassword ? "text" : "password"}
                disabled={isSubmitting || success}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a secure password"
                className="w-full pl-10 pr-10 py-2.5 rounded-md bg-[#050508] border border-[#790009]/40 text-[#F2EEE9] placeholder-[#555562] font-mono text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-[#7D7D88] hover:text-[#F2EEE9] transition-colors focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Row 5: Confirm Password */}
          <div>
            <label className="block text-xs font-medium text-[#F2EEE9] font-oswald uppercase tracking-wider mb-1.5">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#7D7D88] absolute left-3.5 top-3 pointer-events-none" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                disabled={isSubmitting || success}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full pl-10 pr-10 py-2.5 rounded-md bg-[#050508] border border-[#790009]/40 text-[#F2EEE9] placeholder-[#555562] font-mono text-xs sm:text-sm focus:outline-none focus:border-[#C00012] focus:ring-1 focus:ring-[#C00012] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-3 text-[#7D7D88] hover:text-[#F2EEE9] transition-colors focus:outline-none"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Unit Credentials Button */}
          <button
            type="submit"
            disabled={isSubmitting || success}
            className="w-full py-3 rounded-md bg-gradient-to-r from-[#F00018] via-[#C00012] to-[#790009] hover:from-[#ff1a26] hover:to-[#8e000b] hover:shadow-[0_0_16px_rgba(240,0,24,0.4)] text-white font-oswald uppercase tracking-wider font-bold text-sm shadow-lg shadow-black/80 flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:opacity-50 mt-2"
          >
            {success ? (
              <span className="flex items-center gap-2 text-white animate-scale-check">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Credentials Accepted • Entering Grid</span>
              </span>
            ) : isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Submitting Credentials...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>Submit Unit Credentials</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
              </span>
            )}
          </button>
        </form>

        {/* Already registered link */}
        <div className="mt-4 pt-3.5 border-t border-[#790009]/20 text-center text-xs text-[#92929A]">
          <span>Already registered? </span>
          <Link
            href="/login"
            className="text-[#F00018] hover:text-[#ff3b45] font-oswald uppercase tracking-wider font-semibold transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    </AuthPageLayout>
  );
}
