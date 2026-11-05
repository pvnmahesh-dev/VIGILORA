import { NextResponse } from "next/server";


/**
 * GET /api/health
 * Lightweight, unauthenticated liveness check for AWS ALB target group health checks.
 *
 * Requirements:
 * - Returns HTTP 200 with {"status":"ok"}.
 * - Zero authentication required (accessible by AWS ALB health prober).
 * - Zero downstream AWS calls (prevents DynamoDB/S3 throttling and latency coupling).
 * - Exposes zero secrets, database details, or internal infrastructure information.
 */
export async function GET() {
  return NextResponse.json(
    { status: "ok" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
