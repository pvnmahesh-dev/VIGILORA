import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import {
  authenticateUser,
  createSession,
  getSessionCookieOptions,
  UserRole,
} from "@/lib/auth";

const CREDENTIALS_FILE = path.join(process.cwd(), ".demo-credentials.json");

interface DemoAccountRecord {
  role: UserRole;
  email: string;
  name: string;
  callsign: string;
  password?: string;
}

/**
 * POST /api/auth/demo-login
 *
 * Provides convenient, authenticated station access for hackathon evaluations.
 * Validates the role, loads credentials from the secure local store (outside git),
 * executes REAL server-side scrypt authentication, and issues a genuine signed session cookie.
 *
 * Strict Security Guardrails:
 * - Disabled in production unless explicitly enabled via ENABLE_DEMO_LOGIN=true
 * - Zero hardcoded passwords in client bundles
 * - Real authentication with rate-limiting and session tracking
 */
export async function POST(request: Request) {
  // 1. Production environment guardrail
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && process.env.ENABLE_DEMO_LOGIN !== "true") {
    return NextResponse.json(
      {
        success: false,
        error: "Demo role authentication is disabled in production environments.",
      },
      { status: 403 }
    );
  }

  // 2. Validate request payload
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request payload." },
      { status: 400 }
    );
  }

  const { role } = body as { role?: unknown };
  const validRoles: UserRole[] = ["Dispatcher", "Responder", "Supervisor"];

  if (typeof role !== "string" || !validRoles.includes(role as UserRole)) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid demo role. Allowed roles: ${validRoles.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // 3. Load credentials from secure server environment variable or local file store
  let credentials: Record<string, DemoAccountRecord> | null = null;

  if (process.env.DEMO_CREDENTIALS_JSON) {
    try {
      credentials = JSON.parse(process.env.DEMO_CREDENTIALS_JSON);
    } catch {
      return NextResponse.json(
        { success: false, error: "Malformed DEMO_CREDENTIALS_JSON server environment variable." },
        { status: 500 }
      );
    }
  } else if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to read demo credentials store from disk." },
        { status: 500 }
      );
    }
  } else {
    return NextResponse.json(
      {
        success: false,
        error: "Demo credentials store not found. Please run 'npx tsx scripts/provision-demo-users.ts' or configure DEMO_CREDENTIALS_JSON in server environment.",
      },
      { status: 404 }
    );
  }

  if (!credentials) {
    return NextResponse.json(
      { success: false, error: "Demo credentials store unavailable." },
      { status: 500 }
    );
  }

  const account = credentials[role];
  if (!account || !account.email || !account.password) {
    return NextResponse.json(
      {
        success: false,
        error: `No provisioned demo account found for role [${role}].`,
      },
      { status: 404 }
    );
  }

  // 4. Execute genuine server-side scrypt verification & rate limit tracking
  const clientIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const authResult = await authenticateUser(account.email, account.password, clientIp);

  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.statusCode }
    );
  }

  // 5. Create genuine session token record in DynamoDB
  const { plainToken } = await createSession(authResult.user);

  // 6. Set HttpOnly session cookie
  const response = NextResponse.json({
    success: true,
    user: {
      email: authResult.user.email,
      name: authResult.user.name,
      role: authResult.user.role,
      callsign: authResult.user.callsign,
      teamId: authResult.user.teamId,
      campusId: authResult.user.campusId,
    },
    message: `Terminal station authorized as [${authResult.user.role}].`,
  });

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
