import React from "react";
import { IncidentSeverity } from "@/types/incident";
import { cn } from "@/lib/utils";
import { AlertTriangle, AlertCircle, Info, ShieldAlert } from "lucide-react";

interface PriorityBadgeProps {
  severity: IncidentSeverity;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

export function PriorityBadge({
  severity,
  size = "md",
  showIcon = true,
  className,
}: PriorityBadgeProps) {
  const sizeClasses = {
    sm: "text-[11px] px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1.5",
  };

  const config = {
    Critical: {
      bg: "bg-[#790009]/35 text-[#F00018] border-[#C00012]/60 shadow-[0_0_12px_rgba(240,0,24,0.35)]",
      dot: "bg-[#F00018] animate-pulse",
      icon: ShieldAlert,
      label: "Critical",
    },
    High: {
      bg: "bg-[#7A1F0D]/25 text-[#FF7700] border-[#FF7700]/50 shadow-[0_0_8px_rgba(255,119,0,0.2)]",
      dot: "bg-[#FF7700]",
      icon: AlertTriangle,
      label: "High",
    },
    Medium: {
      bg: "bg-[#5C3B0D]/25 text-[#FFCC00] border-[#FFCC00]/45",
      dot: "bg-[#FFCC00]",
      icon: AlertCircle,
      label: "Medium",
    },
    Low: {
      bg: "bg-[#041a0d]/40 text-[#00CC66] border-[#00CC66]/40",
      dot: "bg-[#00CC66]",
      icon: Info,
      label: "Low",
    },
  }[severity];

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
      {showIcon && <IconComponent className={size === "sm" ? "w-3 h-3 shrink-0" : "w-3.5 h-3.5 shrink-0"} />}
      <span>{config.label}</span>
    </span>
  );
}
