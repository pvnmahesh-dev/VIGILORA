import { NextResponse } from "next/server";
import {
  extractTokenFromRequest,
  revokeSession,
  getSessionCookieOptions,
  verifyCsrf,
} from "@/lib/auth";

export async function POST(request: Request) {
  if (!verifyCsrf(request)) {
    return NextResponse.json(
      { success: false, error: "Forbidden. Invalid request origin." },
      { status: 403 }
    );
  }

  const plainToken = extractTokenFromRequest(request);
  if (plainToken) {
    await revokeSession(plainToken);
  }

  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully. Session revoked.",
  });

  // Clear session cookie
  const cookieOpts = getSessionCookieOptions();
  response.cookies.set({
    name: cookieOpts.name,
    value: "",
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    maxAge: 0,
  });

  return response;
}

