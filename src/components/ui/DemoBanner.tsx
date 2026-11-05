"use client";

import React, { useState } from "react";
import { AlertCircle, ShieldAlert, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIncidents } from "@/context/IncidentContext";
import { useAwsPreflight } from "@/context/AwsPreflightContext";

interface DemoBannerProps {
  className?: string;
  compact?: boolean;
}

export function DemoBanner({ className, compact = false }: DemoBannerProps) {
  const { resetDemoData } = useIncidents();
  const {
    status: awsStatus,
    message: awsMessage,
    recheck,
  } = useAwsPreflight();
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleReset = async () => {
    setIsRefreshing(true);
    try {
      resetDemoData();
      await recheck();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2000);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-oswald font-semibold tracking-wider uppercase transition-colors",
          awsStatus === "connected"
            ? "bg-[#041a0d] text-emerald-400 border border-emerald-500/35"
            : "bg-[#180306] text-[#F00018] border border-[#F00018]/60",
          className
        )}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            awsStatus === "connected" ? "bg-emerald-400 animate-operational-pulse" : "bg-[#F00018]"
          )}
        />
        <span>{awsStatus === "connected" ? "AWS CONNECTED" : "AWS DISCONNECTED"}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-4 py-2 rounded-md border shadow-md shadow-black/60 text-xs transition-colors",
        awsStatus === "connected" &&
          "bg-[#0A0B10]/95 border-[#790009]/35 text-[#F2EEE9]",
        awsStatus === "auth_expired" &&
          "bg-[#180306]/95 border-[#F00018]/60 text-[#F2EEE9] animate-pulse shadow-[0_0_12px_rgba(240,0,24,0.25)]",
        awsStatus === "service_unavailable" &&
          "bg-[#201005]/95 border-amber-600/50 text-[#F2EEE9]",
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded-md shrink-0 border",
            awsStatus === "connected" &&
              "bg-[#790009]/25 text-[#F00018] border-[#790009]/40",
            awsStatus === "auth_expired" &&
              "bg-[#790009] text-white border-[#F00018]",
            awsStatus === "service_unavailable" &&
              "bg-amber-950/60 text-amber-400 border-amber-600/50"
          )}
        >
          {awsStatus === "service_unavailable" ? (
            <AlertCircle className="w-3.5 h-3.5" />
          ) : (
            <ShieldAlert className="w-3.5 h-3.5" />
          )}
        </div>
        <div>
          {awsStatus === "auth_expired" ? (
            <div>
              <span className="font-oswald uppercase tracking-wider text-[#F00018] font-bold mr-2">
                AWS SESSION EXPIRED:
              </span>
              <span className="text-[#F2EEE9] font-semibold text-[11px]">
                AWS SESSION EXPIRED — Run aws login in your terminal and refresh the application.
              </span>
            </div>
          ) : awsStatus === "service_unavailable" ? (
            <div>
              <span className="font-oswald uppercase tracking-wider text-amber-400 font-bold mr-2">
                AWS SERVICE UNAVAILABLE:
              </span>
              <span className="text-[#F2EEE9] text-[11px]">{awsMessage}</span>
            </div>
          ) : (
            <div>
              <span className="font-oswald uppercase tracking-wider text-[#F00018] font-bold mr-2">
                AWS DISPATCH GRID ACTIVE:
              </span>
              <span className="text-[#92929A] text-[11px]">
                Synchronized with AWS DynamoDB and private S3 evidence store. Real-time emergency coordination terminal.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {resetSuccess && (
          <span className="text-[10px] text-emerald-400 font-mono">
            Synchronized with AWS ✓
          </span>
        )}
        <button
          type="button"
          onClick={handleReset}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider uppercase bg-white/5 hover:bg-white/10 hover:border-[#C00012]/40 text-zinc-300 border border-[#790009]/30 transition-all active:scale-[0.98] disabled:opacity-50"
          title="Synchronize state from AWS backend"
        >
          <RotateCcw className={cn("w-2.5 h-2.5 text-zinc-400 transition-transform", isRefreshing && "animate-spin text-white")} />
          <span>{isRefreshing ? "Syncing..." : "Refresh Live Grid"}</span>
        </button>

        <div
          title={
            awsStatus === "connected"
              ? "AWS cloud services connected and operational"
              : awsMessage || "AWS cloud services disconnected"
          }
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider uppercase transition-colors",
            awsStatus === "connected"
              ? "bg-[#041a0d] text-emerald-400 border border-emerald-500/35"
              : "bg-[#180306] text-[#F00018] border border-[#F00018]/60 font-semibold"
          )}
        >
          {awsStatus === "connected" ? (
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-operational-pulse inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
          ) : (
            <span className="inline-flex rounded-full h-1.5 w-1.5 bg-[#F00018] shrink-0" />
          )}
          <span>{awsStatus === "connected" ? "AWS CONNECTED" : "AWS DISCONNECTED"}</span>
        </div>
      </div>
    </div>
  );
}

export function DemoBadge({
  className,
  isCustom = false,
}: {
  className?: string;
  isCustom?: boolean;
}) {
  if (isCustom) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wider uppercase bg-[#790009]/30 text-[#F00018] border border-[#C00012]/40 shadow-[0_0_8px_rgba(192,0,18,0.25)]",
          className
        )}
        title="Live operational record in AWS DynamoDB"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#F00018]" />
        LIVE RECORD
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wider uppercase bg-[#111A29] text-[#92929A] border border-[#790009]/30",
        className
      )}
      title="Verified record in AWS DynamoDB"
    >
      <AlertCircle className="w-2.5 h-2.5" />
      AWS RECORD
    </span>
  );
}
