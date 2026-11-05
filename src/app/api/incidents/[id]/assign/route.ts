import { NextResponse } from "next/server";
import { authenticateRequest, toActorRole } from "@/lib/auth";
import {
  getTeam,
  assignTeamTransaction,
  unassignTeamTransaction,
} from "@/lib/dynamo-helpers";
import { docClient, DYNAMODB_TABLE } from "@/lib/aws";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { Incident } from "@/types/incident";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/incidents/[id]/assign
 * Transactional assignment and unassignment of tactical response teams to incidents.
 */
export async function POST(request: Request, context: RouteParams) {
  const auth = await authenticateRequest(request, ["Supervisor", "Dispatcher"]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Incident ID is required." }, { status: 400 });
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

  const { teamId, action = "assign" } = (body || {}) as {
    teamId?: string;
    action?: "assign" | "unassign";
  };

  try {
    // 1. Fetch current incident
    const incRes = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: auth.user.campusId,
          sk: `INCIDENT#${id}`,
        },
      })
    );

    if (!incRes.Item) {
      return NextResponse.json(
        { success: false, error: `Incident "${id}" was not found.` },
        { status: 404 }
      );
    }

    const incident = incRes.Item as Incident;

    // 2. Handle UNASSIGN Action
    if (action === "unassign") {
      if (!incident.assignedTeamId) {
        return NextResponse.json(
          {
            success: false,
            error: "Incident does not have a tactical unit currently assigned.",
          },
          { status: 400 }
        );
      }

      const activity = await unassignTeamTransaction({
        incident,
        teamId: incident.assignedTeamId,
        teamName: incident.assignedResponder || "Tactical Unit",
        actor: auth.user.name || auth.user.email,
        actorRole: toActorRole(auth.user.role),
        campusId: auth.user.campusId,
      });

      return NextResponse.json({
        success: true,
        message: "Tactical unit unassigned and returned to available roster.",
        data: {
          incidentId: id,
          assignedTeamId: null,
          assignedResponder: null,
          status: incident.status === "Assigned" ? "Under review" : incident.status,
        },
        activity,
      });
    }

    // 3. Handle ASSIGN Action
    if (!teamId || typeof teamId !== "string" || !teamId.trim()) {
      return NextResponse.json(
        { success: false, error: "Target teamId is required for assignment." },
        { status: 400 }
      );
    }

    // Check if incident is resolved
    if (incident.status === "Resolved") {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot assign tactical unit to an already resolved incident.",
        },
        { status: 409 }
      );
    }

    // 4. Verify target team exists strictly in DynamoDB (never initialize on the fly)
    const targetTeam = await getTeam(teamId.trim(), auth.user.campusId);
    if (!targetTeam) {
      return NextResponse.json(
        { success: false, error: `Target tactical unit "${teamId}" was not found in campus roster.` },
        { status: 404 }
      );
    }

    // Check if unit is off duty
    if (targetTeam.status === "Off Duty") {
      return NextResponse.json(
        {
          success: false,
          error: `Tactical unit "${targetTeam.name}" (${targetTeam.callsign}) is currently off-duty and unavailable for dispatch.`,
        },
        { status: 409 }
      );
    }

    // Check if unit is busy with another active incident
    if (
      (targetTeam.activeIncidentId &&
        targetTeam.activeIncidentId !== incident.id &&
        targetTeam.status !== "Available") ||
      (targetTeam.status === "Busy" && targetTeam.activeIncidentId !== incident.id)
    ) {
      const activeRef = targetTeam.activeIncidentId
        ? `to incident ${targetTeam.activeIncidentId}`
        : "on operational assignment";
      return NextResponse.json(
        {
          success: false,
          error: `Tactical unit "${targetTeam.name}" (${targetTeam.callsign}) is currently committed ${activeRef}.`,
        },
        { status: 409 }
      );
    }

    // 5. Execute atomic multi-item transaction
    const activity = await assignTeamTransaction({
      incident,
      targetTeam,
      previousTeamId: incident.assignedTeamId,
      actor: auth.user.name || auth.user.email,
      actorRole: toActorRole(auth.user.role),
      campusId: auth.user.campusId,
    });

    const newStatus =
      incident.status === "Reported" || incident.status === "Under review"
        ? "Assigned"
        : incident.status;

    return NextResponse.json({
      success: true,
      message: `Successfully dispatched ${targetTeam.name} (${targetTeam.callsign}) to incident ${incident.id}.`,
      data: {
        incidentId: incident.id,
        assignedTeamId: targetTeam.id,
        assignedResponder: targetTeam.name,
        status: newStatus,
      },
      activity,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Assignment transaction failed";
    return NextResponse.json(
      {
        success: false,
        error: "Database transaction failed while assigning tactical unit.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}
