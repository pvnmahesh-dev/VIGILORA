/**
 * VIGILORA Role Presentation & Permission Descriptor Utility
 *
 * Provides single-source-of-truth UI presentation metadata for authenticated roles:
 * - ADMIN (Supervisor): Campus-wide incident visibility
 * - DISPATCHER: Campus-wide incident coordination
 * - RESPONDER: Assigned-team incident visibility
 *
 * Security Invariant: Metadata is strictly derived from verified server session roles.
 */

export type DisplayRole = "ADMIN" | "DISPATCHER" | "RESPONDER";

export interface RolePresentation {
  displayRole: DisplayRole;
  label: string;
  badgeText: string;
  description: string;
  badgeStyle: {
    bg: string;
    text: string;
    border: string;
    glow: string;
  };
}

export function getRolePresentation(role?: string | null): RolePresentation {
  const normalized = (role || "").toLowerCase().trim();

  if (normalized === "supervisor" || normalized === "admin") {
    return {
      displayRole: "ADMIN",
      label: "ADMIN",
      badgeText: "CURRENT ACCESS: ADMIN",
      description: "Campus-wide incident visibility",
      badgeStyle: {
        bg: "bg-[#250508]",
        text: "text-[#F01420]",
        border: "border-[#F01420]/60",
        glow: "shadow-[0_0_10px_rgba(240,20,32,0.35)]",
      },
    };
  }

  if (normalized === "dispatcher") {
    return {
      displayRole: "DISPATCHER",
      label: "DISPATCHER",
      badgeText: "CURRENT ACCESS: DISPATCHER",
      description: "Campus-wide incident coordination",
      badgeStyle: {
        bg: "bg-[#261505]",
        text: "text-[#f59e0b]",
        border: "border-[#f59e0b]/60",
        glow: "shadow-[0_0_10px_rgba(245,158,11,0.25)]",
      },
    };
  }

  // Responder / Field Responder (default tactical unit role)
  return {
    displayRole: "RESPONDER",
    label: "RESPONDER",
    badgeText: "CURRENT ACCESS: RESPONDER",
    description: "Assigned-team incident visibility",
    badgeStyle: {
      bg: "bg-[#051c14]",
      text: "text-[#10b981]",
      border: "border-[#10b981]/60",
      glow: "shadow-[0_0_10px_rgba(16,185,129,0.25)]",
    },
  };
}

