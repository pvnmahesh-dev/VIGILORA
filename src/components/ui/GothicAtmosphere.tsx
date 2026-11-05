"use client";

import React from "react";
import Image from "next/image";

export type GothicAtmosphereVariant =
  | "dashboard"
  | "investigation"
  | "skyline"
  | "settings"
  | "subtle"
  | "report"
  | "teams"
  | "analytics"
  | "incidents";

interface GothicAtmosphereProps {
  variant?: GothicAtmosphereVariant;
  className?: string;
  children?: React.ReactNode;
}

export function GothicAtmosphere({
  variant = "subtle",
  className = "",
  children,
}: GothicAtmosphereProps) {
  // Determine artwork layers based on page variant
  let mainArtworkSrc = "";
  let mainArtworkAlt = "";
  let mainArtworkOpacity = "opacity-25";
  let mainArtworkClass = "h-[480px] sm:h-[620px]";

  let showLeftSentinel = false;
  let showRightCemetery = false;
  let showCovenTop = false;

  switch (variant) {
    case "dashboard":
      mainArtworkSrc = "/artwork/gothic/cinematic-spotlight-atmosphere.webp";
      mainArtworkAlt = "Gothic Cinematic Spotlights and Supernatural Silhouettes";
      mainArtworkOpacity = "opacity-20 sm:opacity-30";
      mainArtworkClass = "h-[540px] sm:h-[680px]";
      showLeftSentinel = true;
      showRightCemetery = true;
      break;

    case "report":
      mainArtworkSrc = "/artwork/gothic/supernatural-coven.webp";
      mainArtworkAlt = "Haunted Gothic Coven and Supernatural Figures";
      mainArtworkOpacity = "opacity-25 sm:opacity-35";
      mainArtworkClass = "h-[360px] sm:h-[440px]";
      showLeftSentinel = true;
      showRightCemetery = true;
      showCovenTop = true;
      break;

    case "teams":
      mainArtworkSrc = "/artwork/gothic/supernatural-characters-snowglobes.webp";
      mainArtworkAlt = "Gothic Victorian Figures and Haunted Fortress Snowglobes";
      mainArtworkOpacity = "opacity-20 sm:opacity-30";
      mainArtworkClass = "h-[500px] sm:h-[640px]";
      showLeftSentinel = true;
      showRightCemetery = true;
      break;

    case "analytics":
    case "skyline":
      mainArtworkSrc = "/artwork/gothic/cinematic-spotlight-atmosphere.webp";
      mainArtworkAlt = "Cinematic Night Sky and Dramatic Spotlight Lighting";
      mainArtworkOpacity = "opacity-22 sm:opacity-32";
      mainArtworkClass = "h-[520px] sm:h-[660px]";
      showLeftSentinel = true;
      showRightCemetery = true;
      break;

    case "incidents":
    case "investigation":
      mainArtworkSrc = "/artwork/gothic/cinematic-spotlight-atmosphere.webp";
      mainArtworkAlt = "Cinematic Spotlights and Foggy Investigation Scene";
      mainArtworkOpacity = "opacity-20 sm:opacity-28";
      mainArtworkClass = "h-[520px] sm:h-[650px]";
      showLeftSentinel = true;
      showRightCemetery = true;
      break;

    case "settings":
      mainArtworkSrc = "/artwork/gothic/supernatural-characters-snowglobes.webp";
      mainArtworkAlt = "Subtle Gothic Fortress Artwork";
      mainArtworkOpacity = "opacity-15 sm:opacity-22";
      mainArtworkClass = "h-[420px] sm:h-[520px]";
      showRightCemetery = true;
      break;

    case "subtle":
    default:
      mainArtworkSrc = "";
      mainArtworkAlt = "";
      mainArtworkOpacity = "opacity-0";
      break;
  }

  return (
    <div className={`relative min-h-full w-full bg-[#050506] bg-gothic-texture isolate overflow-hidden ${className}`}>
      {/* =========================================================================
          LAYER 1: Deep Black Base & Vignette Gradient
         ========================================================================= */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#0A0B10] via-[#050506] to-[#050506] z-0" />

      {/* =========================================================================
          LAYER 2: Atmospheric Spotlights, Fog Drift & Midnight Blue Halos
         ========================================================================= */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Soft Blue-White Spotlight Cone from top center */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[720px] sm:w-[980px] h-[480px] bg-[radial-gradient(ellipse_at_top,_rgba(120,165,220,0.18)_0%,_rgba(17,26,41,0.35)_45%,_transparent_75%)] blur-[90px]" />

        {/* Deep Crimson Ambient Spotlight (#790009) */}
        <div className="absolute top-16 left-6 sm:left-24 w-[560px] h-[360px] bg-[#790009]/[0.18] rounded-full blur-[120px] animate-crimson-ambient" />

        {/* Blood Red Fog Drift Accent (#C00012) */}
        <div className="absolute top-48 right-6 sm:right-28 w-[580px] h-[320px] bg-[#C00012]/[0.12] rounded-full blur-[110px] animate-fog-drift" />

        {/* Secondary Midnight Blue Horizon Halo (#111A29) */}
        <div className="absolute top-[380px] left-1/3 w-[640px] h-[340px] bg-[#111A29]/[0.40] rounded-full blur-[130px]" />
      </div>

      {/* =========================================================================
          LAYER 3: Original Ghost Bus Reference Overhead / Central Scene
         ========================================================================= */}
      {mainArtworkSrc && (
        <div className={`absolute top-0 left-0 right-0 ${mainArtworkClass} pointer-events-none overflow-hidden z-0 select-none`}>
          <div className={`relative w-full h-full ${mainArtworkOpacity} transition-opacity duration-1000`}>
            <Image
              src={mainArtworkSrc}
              alt={mainArtworkAlt}
              fill
              priority={variant === "dashboard"}
              sizes="100vw"
              className="object-cover object-top filter contrast-[1.15] brightness-[0.85] mix-blend-screen"
            />
            {/* Linear and Radial Protective Masks for Seamless Blending */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#0A0B10]/70 via-transparent to-[#050506]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#050506] via-transparent to-[#050506]" />
            <div className="absolute inset-0 bg-radial-vignette opacity-60" />
          </div>
        </div>
      )}

      {/* =========================================================================
          LAYER 4: Edge Artwork — Original Gothic Characters & Cemetery Silhouettes
         ========================================================================= */}

      {/* 4A: Left Margin — Skeleton Sentinel on Cemetery Rocks in Moonlight */}
      {showLeftSentinel && (
        <div
          className="absolute bottom-0 left-0 sm:left-0 pointer-events-none z-0 select-none hidden md:block overflow-hidden"
          style={{ width: "380px", height: "640px", maxWidth: "25vw" }}
          aria-hidden="true"
        >
          <div className="relative w-full h-full opacity-20 lg:opacity-28 transition-opacity duration-700">
            <Image
              src="/artwork/gothic/skeleton-sentinel-cemetery.webp"
              alt="Gothic Skeleton Sentinel on Cemetery Rocks"
              fill
              sizes="380px"
              className="object-contain object-bottom filter contrast-110 brightness-90 mix-blend-screen"
            />
            {/* Gradient Mask fading inward to pure dark base */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#050506]" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050506] via-transparent to-[#050506]/40" />
          </div>
        </div>
      )}

      {/* 4B: Right Margin — Dark Twisted Trees, Cemetery Gravestones & Crosses */}
      {showRightCemetery && (
        <div
          className="absolute top-0 right-0 pointer-events-none z-0 select-none hidden md:block overflow-hidden"
          style={{ width: "360px", height: "720px", maxWidth: "24vw" }}
          aria-hidden="true"
        >
          <div className="relative w-full h-full opacity-22 lg:opacity-30 transition-opacity duration-700">
            <Image
              src="/artwork/gothic/haunted-cemetery-trees.webp"
              alt="Haunted Cemetery Gravestones, Angel Crosses and Twisted Trees"
              fill
              sizes="360px"
              className="object-contain object-top-right filter contrast-110 brightness-90 mix-blend-screen"
            />
            {/* Gradient Mask fading inward */}
            <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-[#050506]" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050506]" />
          </div>
        </div>
      )}

      {/* 4C: Top Center Coven Banner (Specific to Report & Investigation) */}
      {showCovenTop && (
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none z-0 select-none hidden sm:block overflow-hidden"
          style={{ width: "680px", height: "260px", maxWidth: "60vw" }}
          aria-hidden="true"
        >
          <div className="relative w-full h-full opacity-25 lg:opacity-32 transition-opacity duration-700">
            <Image
              src="/artwork/gothic/supernatural-coven.webp"
              alt="Supernatural Coven in Moonlit Mist"
              fill
              sizes="680px"
              className="object-contain object-top filter contrast-115 brightness-90 mix-blend-screen"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0A0B10]/60 via-transparent to-[#050506]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#050506] via-transparent to-[#050506]" />
          </div>
        </div>
      )}

      {/* =========================================================================
          LAYER 5: Microtexture Overlay & Vignette Protection
         ========================================================================= */}
      <div className="absolute inset-0 pointer-events-none bg-gothic-texture opacity-75 z-0" />

      {/* =========================================================================
          LAYER 6: Foreground Interactive Content (High Readability)
         ========================================================================= */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
