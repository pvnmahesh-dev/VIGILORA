import { NextResponse } from "next/server";
import { authenticateRequest, revokeSession, verifyCsrf } from "@/lib/auth";

export async function POST(request: Request) {
  if (!verifyCsrf(request)) {
    return NextResponse.json(
      { success: false, error: "Forbidden. Invalid request origin." },
      { status: 403 }
    );
  }

  const authResult = await authenticateRequest(request);
  if ("errorResponse" in authResult) {
    return authResult.errorResponse;
  }

  let targetToken = authResult.plainToken;

  // Supervisors can revoke another session token if specified
  try {
    const body = await request.json().catch(() => null);
    if (body?.token && authResult.user.role === "Supervisor") {
      targetToken = body.token;
    }
  } catch {
    // Default to revoking own session
  }

  const success = await revokeSession(targetToken);

  return NextResponse.json({
    success,
    message: success ? "Session successfully revoked." : "Failed to revoke session.",
  });
}

