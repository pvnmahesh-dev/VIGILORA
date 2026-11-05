import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { docClient, DYNAMODB_TABLE } from "@/lib/aws";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ActivityEvent } from "@/types/incident";

/**
 * GET /api/activities
 * Retrieves immutable campus audit activity logs with reverse-chronological ordering and pagination.
 * NOTE: Audit records cannot be created, modified, or deleted through this API.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request, ["Supervisor", "Dispatcher", "Responder"]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { searchParams } = new URL(request.url);
  const incidentId = searchParams.get("incidentId");
  const actorFilter = searchParams.get("actor");
  const typeFilter = searchParams.get("type");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20;
  const nextToken = searchParams.get("nextToken");

  let exclusiveStartKey: Record<string, unknown> | undefined = undefined;
  if (nextToken) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(nextToken, "base64url").toString("utf8"));
    } catch {
      return NextResponse.json({ success: false, error: "Invalid nextToken pagination cursor." }, { status: 400 });
    }
  }

  try {
    // Scan-free Query sorted reverse-chronologically (newest first)
    const res = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": auth.user.campusId,
          ":prefix": "ACTIVITY#",
        },
        ScanIndexForward: false, // Newest first
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    let activities = (res.Items || []) as ActivityEvent[];

    if (incidentId) {
      activities = activities.filter((a) => a.incidentId === incidentId);
    }
    if (actorFilter) {
      activities = activities.filter((a) => a.actor.toLowerCase().includes(actorFilter.toLowerCase()));
    }
    if (typeFilter && typeFilter !== "all") {
      activities = activities.filter((a) => a.type === typeFilter);
    }

    let encodedNextToken: string | undefined = undefined;
    if (res.LastEvaluatedKey) {
      encodedNextToken = Buffer.from(JSON.stringify(res.LastEvaluatedKey), "utf8").toString("base64url");
    }

    return NextResponse.json({
      success: true,
      data: activities,
      total: activities.length,
      nextToken: encodedNextToken,
      campusId: auth.user.campusId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to query activities";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to query activity audit trail.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}

