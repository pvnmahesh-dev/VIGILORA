import { NextResponse } from "next/server";
import { performAwsPreflight } from "@/lib/aws-preflight";
import { authenticateRequest } from "@/lib/auth";

/**
 * GET /api/health/preflight
 *
 * Dedicated authenticated application endpoint for AWS preflight verification.
 *
 * Guarantees:
 * 1. Requires valid operator session authentication (preserves session auth and RBAC rules).
 *    Unauthenticated callers receive HTTP 401.
 * 2. Does NOT modify the unauthenticated liveness endpoint (/api/health).
 * 3. Does NOT expose infrastructure names (table names, bucket names), account details,
 *    resource identifiers, ARNs, credentials, or raw AWS error messages.
 * 4. Returns only the safe status code, user-readable display label, and message.
 */
export async function GET(request: Request) {
  // Enforce session authentication (Supervisor, Dispatcher, Responder, Reporter)
  const authResult = await authenticateRequest(request);
  if ("errorResponse" in authResult) {
    return authResult.errorResponse;
  }

  try {
    const preflight = await performAwsPreflight();

    return NextResponse.json(
      {
        success: preflight.success,
        status: preflight.status,
        label: preflight.label,
        message: preflight.message,
        timestamp: preflight.timestamp,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        status: "service_unavailable",
        label: "Service unavailable",
        message: "AWS SERVICE UNAVAILABLE — Cloud resources could not be reached. Verify network connectivity.",
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
