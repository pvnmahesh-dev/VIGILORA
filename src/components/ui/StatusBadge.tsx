import React from "react";
import { IncidentStatus } from "@/types/incident";
import { cn } from "@/lib/utils";
import { Radio, Search, UserCheck, Flame, CheckCircle2 } from "lucide-react";

interface StatusBadgeProps {
  status: IncidentStatus | string;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  size = "md",
  showIcon = true,
  className,
}: StatusBadgeProps) {
  const sizeClasses = {
    sm: "text-[11px] px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1.5",
  };

  const configMap: Record<string, { bg: string; dot: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
    Reported: {
      bg: "bg-[#141C26] text-[#85858B] border-[#85858B]/30",
      dot: "bg-[#85858B]",
      icon: Radio,
      label: "Reported",
    },
    "Under review": {
      bg: "bg-[#1E1B4B]/35 text-[#818CF8] border-[#6366F1]/40",
      dot: "bg-[#818CF8]",
      icon: Search,
      label: "Under Review",
    },
    "Under Review": {
      bg: "bg-[#1E1B4B]/35 text-[#818CF8] border-[#6366F1]/40",
      dot: "bg-[#818CF8]",
      icon: Search,
      label: "Under Review",
    },
    Assigned: {
      bg: "bg-[#3B0764]/40 text-[#C084FC] border-[#A855F7]/40 shadow-[0_0_8px_rgba(168,85,247,0.2)]",
      dot: "bg-[#C084FC]",
      icon: UserCheck,
      label: "Assigned",
    },
    Responding: {
      bg: "bg-[#7A1F0D]/30 text-[#FB923C] border-[#EA580C]/50 shadow-[0_0_10px_rgba(234,88,12,0.25)]",
      dot: "bg-[#FB923C] animate-active-pulse",
      icon: Flame,
      label: "Responding",
    },
    Resolved: {
      bg: "bg-[#052E16]/40 text-[#4ADE80] border-[#22C55E]/40",
      dot: "bg-[#4ADE80]",
      icon: CheckCircle2,
      label: "Resolved",
    },
  };

  const config = configMap[status] || configMap["Reported"];

  const IconComponent = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center font-oswald uppercase tracking-wider font-semibold rounded-full border shadow-sm",
        sizeClasses[size],
        config.bg,
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dot)} />
      {showIcon && <IconComponent className={size === "sm" ? "w-3 h-3 shrink-0" : "w-3.5 h-3.5 shrink-0"} />}
      <span>{config.label}</span>
    </span>
  );
}
