import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { docClient, DYNAMODB_TABLE } from "@/lib/aws";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ResponseTeam } from "@/types/team";
import { ensureDemoTeams } from "@/lib/teams-seed";

/**
 * GET /api/teams
 * Retrieves tactical response teams strictly from DynamoDB for the authenticated user's campus.
 * Scan-free Query strictly bounded by campus partition key.
 * If zero teams exist for the campus partition, automatically seeds baseline demonstration units
 * atomically using conditional writes (attribute_not_exists(pk)) to prevent duplicate creation.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request, ["Supervisor", "Dispatcher", "Responder"]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const specialtyFilter = searchParams.get("specialty");

  try {
    const res = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": auth.user.campusId,
          ":prefix": "TEAM#",
        },
      })
    );

    let teams = (res.Items || []) as ResponseTeam[];

    // If zero teams exist, atomically provision baseline demonstration units into DynamoDB
    if (teams.length === 0) {
      teams = await ensureDemoTeams(auth.user.campusId);
    }

    if (statusFilter && statusFilter !== "all") {
      teams = teams.filter((t) => t.status === statusFilter);
    }
    if (specialtyFilter && specialtyFilter !== "all") {
      teams = teams.filter((t) => t.specialty === specialtyFilter);
    }

    return NextResponse.json({
      success: true,
      data: teams,
      total: teams.length,
      campusId: auth.user.campusId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to query teams";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve tactical response teams.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}

