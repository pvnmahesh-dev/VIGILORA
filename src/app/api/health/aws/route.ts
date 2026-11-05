import { NextResponse } from "next/server";
import { checkAwsHealth } from "@/lib/aws";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: Request) {
  // Enforce verified Supervisor-only authorization
  const authResult = await authenticateRequest(request, ["Supervisor"]);
  if ("errorResponse" in authResult) {
    return authResult.errorResponse;
  }

  try {
    const health = await checkAwsHealth();
    const httpStatus = health.status === "healthy" ? 200 : 503;

    // Sanitized output for authorized supervisors - no secrets, keys, or internal ARNs
    return NextResponse.json(
      {
        success: health.status === "healthy",
        status: health.status,
        region: health.region,
        dynamoDb: {
          table: health.dynamoDb.table,
          status: health.dynamoDb.status,
          accessible: health.dynamoDb.accessible,
        },
        s3: {
          bucket: health.s3.bucket,
          accessible: health.s3.accessible,
        },
        checkedBy: authResult.user.email,
        timestamp: health.timestamp,
      },
      { status: httpStatus }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "An internal error occurred while verifying AWS connectivity.",
      },
      { status: 500 }
    );
  }
}
