import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "@/lib/aws";
import {
  createSession,
  getSessionCookieOptions,
  checkRateLimit,
  provisionUser,
  UserRole,
  AuthenticatedUser,
} from "@/lib/auth";

interface DemoAccountMetadata {
  email: string;
  name: string;
  role: UserRole;
  callsign: string;
  teamId?: string;
}

const DEMO_STATIONS: Record<string, DemoAccountMetadata> = {
  Dispatcher: {
    email: "dispatcher@demo.vigilora.internal",
    name: "Lead Dispatcher Austin",
    role: "Dispatcher",
    callsign: "DISPATCH-LEAD-1",
  },
  Responder: {
    email: "responder@demo.vigilora.internal",
    name: "Officer Vance (Alpha Patrol)",
    role: "Responder",
    callsign: "UNIT-ALPHA-1",
    teamId: "MED-01",
  },
  Supervisor: {
    email: "admin@demo.vigilora.internal",
    name: "Chief Inspector Helena Vance",
    role: "Supervisor",
    callsign: "CHIEF-SUPERVISOR-1",
  },
};

/**
 * POST /api/auth/demo-login
 *
 * Operational Station Role Selection endpoint.
 *
 * Authenticates the user into the selected operational station role,
 * generates a genuine cryptographically secure server-side session in DynamoDB,
 * and sets an HttpOnly session cookie.
 *
 * Security & Data Isolation:
 * - Operates strictly within the synthetic evaluation partition (getCampusPartitionKey()).
 * - Does not touch or expose production operational data.
 * - Permanent credential authentication (/api/auth/login) remains completely separate.
 * - Sessions are tracked, revokable, and rate-limited.
 */
export async function POST(request: Request) {
  // 1. Environment guardrail
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && process.env.ENABLE_DEMO_LOGIN !== "true") {
    return NextResponse.json(
      {
        success: false,
        error: "Terminal station role selection is disabled in this environment.",
      },
      { status: 403 }
    );
  }

  // 2. Validate request payload
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request payload." },
      { status: 400 }
    );
  }

  const role = body.role as string | undefined;
  const allowedRoles = Object.keys(DEMO_STATIONS);

  if (!role || !allowedRoles.includes(role)) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid operational role. Available roles: ${allowedRoles.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // 3. Rate limiting check
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const rateCheck = await checkRateLimit("ROLE_ACCESS", clientIp);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many access attempts from this station. Retry in ${rateCheck.retryAfterSeconds || 60} seconds.`,
      },
      { status: 429 }
    );
  }

  const station = DEMO_STATIONS[role];
  const campusPk = getCampusPartitionKey();

  try {
    // 4. Look up or auto-ensure user record in DynamoDB
    let authUser: AuthenticatedUser;

    const userRes = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: campusPk,
          sk: `USER#${station.email.toLowerCase()}`,
        },
      })
    );

    if (userRes.Item) {
      authUser = {
        email: userRes.Item.email as string,
        name: userRes.Item.name as string,
        role: userRes.Item.role as UserRole,
        callsign: userRes.Item.callsign as string | undefined,
        teamId:
          (userRes.Item.teamId as string | undefined) ||
          (userRes.Item.role === "Responder" ? "MED-01" : undefined),
        campusId: (userRes.Item.campusId as string) || campusPk,
      };
    } else {
      // Auto-provision station account in partition if not yet initialized
      const provisionRes = await provisionUser({
        email: station.email,
        password: `VigiloraStation!${Date.now()}#2026`,
        name: station.name,
        role: station.role,
        callsign: station.callsign,
        teamId: station.teamId,
        campusId: campusPk,
      });

      authUser = provisionRes.user;
    }

    // 5. Create genuine cryptographic server session
    const { plainToken } = await createSession(authUser);

    // 6. Return authorized response with HttpOnly cookie
    const response = NextResponse.json({
      success: true,
      user: {
        email: authUser.email,
        name: authUser.name,
        role: authUser.role,
        callsign: authUser.callsign,
        teamId: authUser.teamId,
        campusId: authUser.campusId,
      },
      message: `Terminal station authorized as [${authUser.name}].`,
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: `Database error during station authorization: ${msg}`,
      },
      { status: 500 }
    );
  }
}
