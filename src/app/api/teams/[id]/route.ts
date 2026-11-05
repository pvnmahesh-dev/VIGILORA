import { NextResponse } from "next/server";
import { authenticateRequest, toActorRole } from "@/lib/auth";
import { validateTeamUpdate } from "@/lib/validation";
import { getTeam } from "@/lib/dynamo-helpers";
import { docClient, DYNAMODB_TABLE } from "@/lib/aws";
import { GetCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ResponseTeam, TeamStatus } from "@/types/team";
import { Incident } from "@/types/incident";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/teams/[id]
 * Retrieves details for a specific tactical response team.
 * Pure read-only operation: returns 404 if not found in DynamoDB. Never creates or initializes records.
 */
export async function GET(request: Request, context: RouteParams) {
  const auth = await authenticateRequest(request, ["Supervisor", "Dispatcher", "Responder"]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Team ID is required." }, { status: 400 });
  }

  try {
    const team = await getTeam(id, auth.user.campusId);
    if (!team) {
      return NextResponse.json(
        { success: false, error: `Tactical team "${id}" was not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: team });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch team";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch tactical team.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/teams/[id]
 * Updates permitted team telemetry or operational status.
 * Enforces assignment consistency: blocks marking Available if assigned to an unresolved incident.
 */
export async function PATCH(request: Request, context: RouteParams) {
  const auth = await authenticateRequest(request, ["Supervisor", "Dispatcher", "Responder"]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Team ID is required." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const validation = validateTeamUpdate(body);
  if (!validation.success || !validation.data) {
    return NextResponse.json(
      {
        success: false,
        error: "Team update payload validation failed.",
        errors: validation.errors,
      },
      { status: 400 }
    );
  }

  const updates = validation.data;

  // Role permissions check: Responder role can ONLY update telemetry
  if (auth.user.role === "Responder") {
    if (
      updates.status !== undefined ||
      updates.membersCount !== undefined ||
      updates.leadResponder !== undefined ||
      updates.contactChannel !== undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Forbidden. Field Responders may only update telemetry (batteryStatus, currentZone). Operational status changes must be authorized by Dispatcher or Supervisor.",
        },
        { status: 403 }
      );
    }
  }

  const now = new Date().toISOString();

  try {
    // 1. Fetch current team strictly from DynamoDB
    const current = await getTeam(id, auth.user.campusId);
    if (!current) {
      return NextResponse.json(
        { success: false, error: `Tactical team "${id}" was not found.` },
        { status: 404 }
      );
    }

    // 2. DATA INTEGRITY CHECK: Prevent marking Available while assigned to unresolved incident
    if (updates.status === "Available" && current.activeIncidentId) {
      const incRes = await docClient.send(
        new GetCommand({
          TableName: DYNAMODB_TABLE,
          Key: {
            pk: auth.user.campusId,
            sk: `INCIDENT#${current.activeIncidentId}`,
          },
        })
      );

      const activeIncident = incRes.Item as Incident | undefined;
      if (activeIncident && activeIncident.status !== "Resolved") {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot mark tactical unit as Available while actively assigned to unresolved incident ${current.activeIncidentId} ("${activeIncident.title}"). The incident must be unassigned or resolved first.`,
            activeIncidentId: current.activeIncidentId,
            activeIncidentStatus: activeIncident.status,
          },
          { status: 409 }
        );
      }
    }

    // 3. Assemble dynamic update expression
    const updateExpressions: string[] = ["lastCheckIn = :now", "updatedAt = :now"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expressionAttributeValues: Record<string, any> = {
      ":now": now,
    };
    const expressionAttributeNames: Record<string, string> = {};

    if (updates.status !== undefined) {
      updateExpressions.push("#st = :status");
      expressionAttributeNames["#st"] = "status";
      expressionAttributeValues[":status"] = updates.status;
    }

    if (updates.batteryStatus !== undefined) {
      updateExpressions.push("batteryStatus = :battery");
      expressionAttributeValues[":battery"] = updates.batteryStatus;
    }

    if (updates.currentZone !== undefined) {
      updateExpressions.push("currentZone = :zone");
      expressionAttributeValues[":zone"] = updates.currentZone;
    }

    if (updates.membersCount !== undefined) {
      updateExpressions.push("membersCount = :members");
      expressionAttributeValues[":members"] = updates.membersCount;
    }

    if (updates.leadResponder !== undefined) {
      updateExpressions.push("leadResponder = :lead");
      expressionAttributeValues[":lead"] = updates.leadResponder;
    }

    if (updates.contactChannel !== undefined) {
      updateExpressions.push("contactChannel = :channel");
      expressionAttributeValues[":channel"] = updates.contactChannel;
    }

    const updatedRes = await docClient.send(
      new UpdateCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: auth.user.campusId,
          sk: `TEAM#${id}`,
        },
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ConditionExpression: "attribute_exists(pk)",
        ...(Object.keys(expressionAttributeNames).length > 0
          ? { ExpressionAttributeNames: expressionAttributeNames }
          : {}),
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    const updatedTeam = updatedRes.Attributes as ResponseTeam;

    // 4. Audit activity log if operational status changed
    let activityLog = undefined;
    if (updates.status && updates.status !== current.status) {
      const actId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const actionText = `Tactical unit ${current.name} (${current.callsign}) operational status changed to "${updates.status}"`;

      activityLog = {
        pk: auth.user.campusId,
        sk: `ACTIVITY#${now}#${actId}`,
        id: actId,
        incidentId: current.activeIncidentId || "CAMPUS-ROSTER",
        incidentTitle: current.activeIncidentTitle || `Tactical Unit ${current.callsign}`,
        action: actionText,
        actor: auth.user.name || auth.user.email,
        actorRole: toActorRole(auth.user.role),
        timestamp: now,
        severity: "Low" as const,
        type: "status_change" as const,
        teamId: current.id,
        teamCallsign: current.callsign,
        entityType: "ACTIVITY",
      };

      await docClient.send(
        new PutCommand({
          TableName: DYNAMODB_TABLE,
          Item: activityLog,
        })
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedTeam,
      activity: activityLog
        ? {
            id: activityLog.id,
            action: activityLog.action,
            timestamp: activityLog.timestamp,
            actor: activityLog.actor,
          }
        : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update team";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update tactical team.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}

