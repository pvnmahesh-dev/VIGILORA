import { NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await verifySessionFromRequest(request);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: "No active authenticated session." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    user: {
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
      callsign: auth.user.callsign,
      teamId: auth.user.teamId,
    },
  });
}

