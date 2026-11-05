import { NextResponse } from "next/server";
import { authenticateUser, createSession, getSessionCookieOptions, verifyCsrf } from "@/lib/auth";

export async function POST(request: Request) {
  // CSRF validation
  if (!verifyCsrf(request)) {
    return NextResponse.json(
      { success: false, error: "Forbidden. Invalid request origin." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request payload." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, error: "Invalid request payload." },
      { status: 400 }
    );
  }

  const { email, password } = body as { email?: string; password?: string };

  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    return NextResponse.json(
      { success: false, error: "Email and password are required." },
      { status: 400 }
    );
  }

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "localhost";

  const result = await authenticateUser(email, password, clientIp);

  if ("error" in result) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.statusCode }
    );
  }

  // Generate session token and store hashed token in DynamoDB
  const { plainToken, expiresAt } = await createSession(result.user);

  const response = NextResponse.json({
    success: true,
    user: {
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      callsign: result.user.callsign,
      teamId: result.user.teamId,
    },
    expiresAt,
  });

  // Set HttpOnly, SameSite=Lax, Secure session cookie
  const cookieOpts = getSessionCookieOptions();
  response.cookies.set({
    name: cookieOpts.name,
    value: plainToken,
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    maxAge: cookieOpts.maxAge,
  });

  return response;
}

