// Utility functions for class name merging and formatting

export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}

// Fixed timestamp used for deterministic SSR prerendering in Next.js 16
const SSR_BASELINE_TIME = new Date("2026-11-02T10:48:00Z").getTime();

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  // Use static baseline during SSR to avoid non-deterministic prerender errors in Next.js 16
  const now = typeof window !== "undefined" ? Date.now() : SSR_BASELINE_TIME;
  const diffInMinutes = Math.floor((now - date.getTime()) / (1000 * 60));

  if (diffInMinutes < 1) return "Just now";
  if (diffInMinutes === 1) return "1 min ago";
  if (diffInMinutes < 60) return `${diffInMinutes} mins ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours === 1) return "1 hour ago";
  if (diffInHours < 24) return `${diffInHours} hours ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} days ago`;
}
