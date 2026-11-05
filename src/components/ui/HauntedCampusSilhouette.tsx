"use client";

import React from "react";

export function HauntedCampusSilhouette({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative w-full h-32 rounded-xl overflow-hidden bg-gradient-to-b from-[#140508] via-[#09050A] to-[#050506] border border-[#87000A]/35 shadow-inner group ${className}`}
    >
      {/* Crimson & moonlight atmospheric glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-950/40 via-red-900/15 to-transparent pointer-events-none" />

      {/* Full Moon behind spire matching master reference */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-[#E8E5E2]/15 blur-lg pointer-events-none" />
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-[#F5F5F0]/30 blur-sm pointer-events-none" />

      {/* SVG Vector Artwork for Gothic Spire, Cemetery Crosses & Trees */}
      <svg
        viewBox="0 0 240 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id="mistCrimsonGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F01420" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#87000A" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gothicSpireGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1a0609" />
            <stop offset="100%" stopColor="#050506" />
          </linearGradient>
          <filter id="softCrimsonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Distant cemetery silhouettes and hills */}
        <path
          d="M0 95 C 15 90, 25 82, 35 92 C 45 88, 55 96, 65 92 L 65 120 L 0 120 Z"
          fill="#0c0407"
          opacity="0.85"
        />
        <path
          d="M175 92 C 185 86, 195 94, 205 88 C 215 82, 225 90, 240 95 L 240 120 L 175 120 Z"
          fill="#0c0407"
          opacity="0.85"
        />

        {/* Cemetery Crosses */}
        <line x1="32" y1="84" x2="32" y2="94" stroke="#050506" strokeWidth="1.5" />
        <line x1="29" y1="87" x2="35" y2="87" stroke="#050506" strokeWidth="1.5" />
        <line x1="48" y1="88" x2="48" y2="96" stroke="#050506" strokeWidth="1.5" />
        <line x1="45" y1="91" x2="51" y2="91" stroke="#050506" strokeWidth="1.5" />

        {/* Central Gothic Castle / Cathedral Spire */}
        <g fill="url(#gothicSpireGrad)">
          {/* Main Hall Wings */}
          <rect x="50" y="70" width="140" height="45" rx="1" />
          <polygon points="50,70 120,48 190,70" />

          {/* Left Wing Gables */}
          <polygon points="60,70 75,52 90,70" />
          <rect x="62" y="70" width="26" height="42" />

          {/* Right Wing Gables */}
          <polygon points="150,70 165,52 180,70" />
          <rect x="152" y="70" width="26" height="42" />

          {/* Central Clock Tower Spire */}
          <rect x="105" y="40" width="30" height="70" />
          <polygon points="102,40 120,8 138,40" />

          {/* Steeple cross / spire needle */}
          <line x1="120" y1="8" x2="120" y2="2" stroke="#87000A" strokeWidth="1.5" />
          <line x1="117" y1="5" x2="123" y2="5" stroke="#87000A" strokeWidth="1.5" />

          {/* Corner Turrets */}
          <polygon points="103,42 105,28 107,42" />
          <polygon points="133,42 135,28 137,42" />
        </g>

        {/* Glowing Crimson Clock & Gothic Windows */}
        <circle cx="120" cy="48" r="4.5" fill="#F01420" filter="url(#softCrimsonGlow)" opacity="0.95" />
        <circle cx="120" cy="48" r="2.8" fill="#FFF1F2" />

        {/* Arched Gothic Windows glowing with red candlelight */}
        <path d="M72 78 Q 75 74 78 78 L 78 86 L 72 86 Z" fill="#C90012" opacity="0.85" />
        <path d="M162 78 Q 165 74 168 78 L 168 86 L 162 86 Z" fill="#C90012" opacity="0.85" />
        <path d="M117 62 Q 120 58 123 62 L 123 72 L 117 72 Z" fill="#F01420" opacity="0.95" />

        {/* Gnarly bare twisted oak silhouettes on sides */}
        {/* Left tree */}
        <path
          d="M 18 115 Q 22 90 28 75 Q 32 65 30 55 Q 36 62 40 68 M 28 75 Q 22 68 15 64 M 20 85 Q 12 78 8 72 M 30 55 Q 26 44 20 40 M 30 55 Q 35 48 44 46"
          stroke="#050506"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Right tree */}
        <path
          d="M 220 115 Q 216 88 210 70 Q 206 58 202 46 M 210 70 Q 218 62 228 58 M 214 80 Q 225 75 234 72 M 202 46 Q 194 38 185 36 M 202 46 Q 208 38 216 35"
          stroke="#050506"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Subtle ground fog mist wave */}
        <path
          d="M0 108 Q 60 98 120 108 T 240 108 L 240 120 L 0 120 Z"
          fill="url(#mistCrimsonGrad)"
        />
      </svg>
    </div>
  );
}
