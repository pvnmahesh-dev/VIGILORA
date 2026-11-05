import React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-white/[0.04] border border-[#87000A]/20",
        className
      )}
      {...props}
    />
  );
}

export function IncidentCardSkeleton() {
  return (
    <div className="p-4 rounded-xl bg-[#080D13] border border-[#87000A]/30 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
      <div className="pt-2 flex items-center justify-between border-t border-[#87000A]/20">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-20 rounded-md" />
      </div>
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="p-5 rounded-xl bg-[#080D13] border border-[#87000A]/30 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
