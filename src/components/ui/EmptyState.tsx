import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  illustrationSrc?: string;
}

export function EmptyState({
  title = "No Incidents in the Shadows",
  description = "All sectors are currently quiet or no records match your investigative search criteria.",
  icon,
  actionLabel,
  onAction,
  className,
  illustrationSrc = "/artwork/gothic-empty-state.jpg",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-[#080D13]/90 border border-[#87000A]/30 backdrop-blur-md relative overflow-hidden shadow-2xl",
        className
      )}
    >
      {/* Background Subtle Crimson Vignette & Ambient Glow */}
      <div className="absolute inset-0 bg-radial-vignette opacity-50 pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[#87000A]/15 rounded-full blur-2xl pointer-events-none" />

      {/* Atmospheric Illustration or Icon Wrapper */}
      {illustrationSrc ? (
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-2xl overflow-hidden border border-[#87000A]/50 mb-5 shadow-2xl shadow-red-950/50 group">
          <Image
            src={illustrationSrc}
            alt="Gothic Empty State Artwork"
            fill
            sizes="208px"
            className="object-cover transition-transform duration-700 group-hover:scale-105 filter contrast-[1.08]"
          />
          {/* Subtle perimeter inner shadow and dark bottom fade */}
          <div className="absolute inset-0 ring-1 ring-inset ring-[#87000A]/35 bg-gradient-to-t from-[#080D13]/90 via-transparent to-transparent pointer-events-none" />
        </div>
      ) : (
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#87000A]/15 text-[#F01420] border border-[#87000A]/40 mb-4 shadow-inner">
          {icon}
        </div>
      )}

      {/* Distressed Ivory Title */}
      <h3 className="text-base sm:text-xl font-cinzel-decorative font-bold text-distressed-ivory tracking-wider mb-2 uppercase">
        {title}
      </h3>

      {/* Description */}
      <p className="text-xs sm:text-sm text-[#85858B] max-w-sm mb-5 leading-relaxed">
        {description}
      </p>

      {/* Action Button */}
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
