import { NextResponse } from "next/server";
import { authenticateRequest, toActorRole } from "@/lib/auth";
import { validateIncidentUpdate, validateIncidentStatusTransition } from "@/lib/validation";
import { resolveIncidentTransaction } from "@/lib/dynamo-helpers";
import { docClient, DYNAMODB_TABLE } from "@/lib/aws";
import { GetCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { Incident } from "@/types/incident";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/incidents/[id]
 * Retrieves a single incident by ID along with its audit events.
 */
export async function GET(request: Request, context: RouteParams) {
  const auth = await authenticateRequest(request, ["Supervisor", "Dispatcher", "Responder"]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Incident ID is required." }, { status: 400 });
  }

  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: auth.user.campusId,
          sk: `INCIDENT#${id}`,
        },
      })
    );

    if (!res.Item) {
      return NextResponse.json(
        { success: false, error: `Incident "${id}" was not found.` },
        { status: 404 }
      );
    }

    const incident = res.Item as Incident;

    // RBAC: Responders may ONLY access incidents assigned to their tactical unit
    if (auth.user.role === "Responder") {
      const responderTeamId = auth.user.teamId;
      const responderCallsign = auth.user.callsign;
      const isAssigned =
        (responderTeamId && incident.assignedTeamId === responderTeamId) ||
        (responderCallsign && incident.assignedTeamId === responderCallsign);

      if (!isAssigned) {
        return NextResponse.json(
          {
            success: false,
            error: "Forbidden. Responders may only access incidents assigned to their tactical unit.",
          },
          { status: 403 }
        );
      }
    }

    // Fetch related audit activity events
    const actRes = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        FilterExpression: "incidentId = :incId",
        ExpressionAttributeValues: {
          ":pk": auth.user.campusId,
          ":prefix": "ACTIVITY#",
          ":incId": id,
        },
        ScanIndexForward: false,
        Limit: 20,
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        incident,
        activities: actRes.Items || [],
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch incident";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch incident from database.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/incidents/[id]
 * Updates incident information or operational status with ACID state-machine transitions.
 */
export async function PATCH(request: Request, context: RouteParams) {
  const auth = await authenticateRequest(request, ["Supervisor", "Dispatcher", "Responder"]);
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

  const validation = validateIncidentUpdate(body);
  if (!validation.success || !validation.data) {
    return NextResponse.json(
      {
        success: false,
        error: "Incident update validation failed.",
        errors: validation.errors,
      },
      { status: 400 }
    );
  }

  const updates = validation.data;
  const now = new Date().toISOString();

  try {
    // 1. Fetch current incident record
    const currentRes = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: auth.user.campusId,
          sk: `INCIDENT#${id}`,
        },
      })
    );

    if (!currentRes.Item) {
      return NextResponse.json(
        { success: false, error: `Incident "${id}" was not found.` },
        { status: 404 }
      );
    }

    const current = currentRes.Item as Incident;

    // RBAC: Responders may ONLY update incidents assigned to their tactical unit
    if (auth.user.role === "Responder") {
      const responderTeamId = auth.user.teamId;
      const responderCallsign = auth.user.callsign;
      const isAssigned =
        (responderTeamId && current.assignedTeamId === responderTeamId) ||
        (responderCallsign && current.assignedTeamId === responderCallsign);

      if (!isAssigned) {
        return NextResponse.json(
          {
            success: false,
            error: "Forbidden. Responders may only update incidents assigned to their tactical unit.",
          },
          { status: 403 }
        );
      }

      // Responders may only update operational status and field notes
      if (updates.title || updates.description || updates.category || updates.severity) {
        return NextResponse.json(
          {
            success: false,
            error: "Forbidden. Field Responders may only update operational status and field notes.",
          },
          { status: 403 }
        );
      }
    }

    // 2. Validate status transition if status is being updated
    if (updates.status && updates.status !== current.status) {
      const hasAssignedTeam = Boolean(current.assignedTeamId);
      const transitionCheck = validateIncidentStatusTransition(
        current.status,
        updates.status,
        auth.user.role,
        hasAssignedTeam
      );
      if (!transitionCheck.valid) {
        return NextResponse.json(
          {
            success: false,
            error: transitionCheck.error,
            currentStatus: current.status,
            attemptedStatus: updates.status,
          },
          { status: 422 }
        );
      }
    }

    // Explicit invariant: An unassigned incident cannot enter "Assigned" or "Responding" status via PATCH
    if ((updates.status === "Assigned" || updates.status === "Responding") && !current.assignedTeamId) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot transition incident to "${updates.status}" without an assigned tactical response unit. Use the tactical unit assignment workflow.`,
          currentStatus: current.status,
          attemptedStatus: updates.status,
        },
        { status: 422 }
      );
    }

    // 3. Handle Resolution transition (with atomic team release)
    if (updates.status === "Resolved") {
      const resolutionActivity = await resolveIncidentTransaction({
        incident: current,
        assignedTeamId: current.assignedTeamId,
        notes: updates.notes,
        actor: auth.user.name || auth.user.email,
        actorRole: toActorRole(auth.user.role),
        campusId: auth.user.campusId,
      });

      return NextResponse.json({
        success: true,
        data: {
          ...current,
          status: "Resolved",
          updatedAt: now,
        },
        activity: resolutionActivity,
      });
    }

    // 4. Handle standard updates & status changes
    const targetStatus = updates.status || current.status;
    const targetTitle = updates.title || current.title;
    const targetDesc = updates.description || current.description;
    const targetSev = updates.severity || current.severity;
    const targetCat = updates.category || current.category;

    const actId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const actionNote =
      updates.notes ||
      (updates.status && updates.status !== current.status
        ? `Operational status transitioned to "${updates.status}"`
        : `Incident details updated`);

    const activityItem = {
      pk: auth.user.campusId,
      sk: `ACTIVITY#${now}#${actId}`,
      id: actId,
      incidentId: current.id,
      incidentTitle: targetTitle,
      action: actionNote,
      actor: auth.user.name || auth.user.email,
      actorRole: toActorRole(auth.user.role),
      timestamp: now,
      severity: targetSev,
      type: "status_change" as const,
      entityType: "ACTIVITY",
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: DYNAMODB_TABLE,
              Key: { pk: auth.user.campusId, sk: `INCIDENT#${id}` },
              UpdateExpression:
                "SET #st = :status, title = :title, description = :desc, severity = :sev, category = :cat, updatedAt = :now",
              ExpressionAttributeNames: {
                "#st": "status",
              },
              ExpressionAttributeValues: {
                ":status": targetStatus,
                ":title": targetTitle,
                ":desc": targetDesc,
                ":sev": targetSev,
                ":cat": targetCat,
                ":now": now,
              },
            },
          },
          {
            Put: {
              TableName: DYNAMODB_TABLE,
              Item: activityItem,
            },
          },
        ],
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        ...current,
        status: targetStatus,
        title: targetTitle,
        description: targetDesc,
        severity: targetSev,
        category: targetCat,
        updatedAt: now,
      },
      activity: {
        id: actId,
        incidentId: current.id,
        incidentTitle: targetTitle,
        action: actionNote,
        actor: auth.user.name || auth.user.email,
        actorRole: auth.user.role,
        timestamp: now,
        severity: targetSev,
        type: "status_change",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update incident";
    return NextResponse.json(
      {
        success: false,
        error: "Database transaction failed while updating incident.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}
