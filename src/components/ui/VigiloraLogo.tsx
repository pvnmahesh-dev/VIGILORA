"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export interface VigiloraLogoProps {
  variant?: "banner" | "icon";
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | number;
  showWordmark?: boolean;
  subtitle?: string | null;
  badge?: React.ReactNode;
  glow?: "none" | "subtle" | "pulse";
  priority?: boolean;
  className?: string;
  imageClassName?: string;
}

const BANNER_SIZES: Record<string, { width: number; height: number; classNames: string }> = {
  xs: { width: 90, height: 30, classNames: "h-7 w-[84px]" },
  sm: { width: 120, height: 40, classNames: "h-9 w-[108px]" },
  md: { width: 180, height: 60, classNames: "h-12 w-[144px]" },
  lg: { width: 240, height: 80, classNames: "h-16 w-[192px]" },
  xl: { width: 300, height: 100, classNames: "h-24 w-[288px]" },
  "2xl": { width: 360, height: 120, classNames: "h-28 w-[336px]" },
};

const ICON_SIZES: Record<string, { sizePx: number; containerClass: string }> = {
  xs: { sizePx: 24, containerClass: "w-6 h-6" },
  sm: { sizePx: 32, containerClass: "w-8 h-8" },
  md: { sizePx: 44, containerClass: "w-11 h-11" },
  lg: { sizePx: 56, containerClass: "w-14 h-14" },
  xl: { sizePx: 80, containerClass: "w-20 h-20" },
  "2xl": { sizePx: 112, containerClass: "w-28 h-28" },
};

export function VigiloraLogo({
  variant = "banner",
  size = "md",
  showWordmark = false,
  subtitle = null,
  badge = null,
  glow = "subtle",
  priority = false,
  className,
  imageClassName,
}: VigiloraLogoProps) {
  const isCustomNumber = typeof size === "number";

  if (variant === "icon") {
    const iconConfig = isCustomNumber ? null : ICON_SIZES[size] || ICON_SIZES.md;
    const dimensionPx = isCustomNumber ? size : iconConfig!.sizePx;

    return (
      <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
        <div
          className={cn(
            "relative shrink-0 rounded-md overflow-hidden bg-[#050506] border border-[#790009]/40 flex items-center justify-center transition-all duration-300",
            glow === "subtle" && "shadow-[0_0_14px_rgba(192,0,18,0.35)] border-[#C00012]/50",
            glow === "pulse" && "animate-vigilora-glow border-[#F00018]/60",
            !isCustomNumber && iconConfig?.containerClass
          )}
          style={isCustomNumber ? { width: dimensionPx, height: dimensionPx } : undefined}
        >
          <Image
            src="/vigilora-icon.png"
            alt="VIGILORA Icon"
            width={dimensionPx}
            height={dimensionPx}
            priority={priority}
            className={cn("w-full h-full object-cover pointer-events-none", imageClassName)}
          />
        </div>

        {showWordmark && (
          <div className="flex flex-col leading-tight justify-center min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bodoni font-bold tracking-widest text-[#F2EEE9] text-sm sm:text-base">
                VIGILORA
              </span>
              {badge && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-widest bg-[#790009]/20 text-[#F00018] border border-[#790009]/40">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-[#92929A] font-oswald uppercase tracking-wider text-[10px] truncate">
                {subtitle}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Banner variant (default)
  const bannerConfig = isCustomNumber
    ? { width: size * 3, height: size, classNames: "" }
    : BANNER_SIZES[size] || BANNER_SIZES.md;

  return (
    <div
      className={cn(
        "relative select-none inline-flex items-center transition-all duration-300 group",
        glow === "subtle" && "drop-shadow-[0_0_12px_rgba(192,0,18,0.35)]",
        glow === "pulse" && "drop-shadow-[0_0_18px_rgba(240,0,24,0.5)] animate-vigilora-glow",
        className
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-md border border-[#790009]/40 bg-[#050506]/90 shadow-md",
          !isCustomNumber && bannerConfig.classNames
        )}
        style={isCustomNumber ? { width: size * 3, height: size } : undefined}
      >
        <Image
          src="/vigilora-logo.png"
          alt="VIGILORA - Incident Intelligence Platform"
          width={bannerConfig.width}
          height={bannerConfig.height}
          priority={priority}
          className={cn(
            "w-full h-full object-cover object-center pointer-events-none transition-transform duration-300 group-hover:scale-[1.02]",
            imageClassName
          )}
        />
        {/* Subtle red bottom border line */}
        <div className="absolute bottom-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#C00012] to-transparent opacity-75" />
      </div>
    </div>
  );
}
