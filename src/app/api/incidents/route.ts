import { NextResponse } from "next/server";
import { authenticateRequest, toActorRole } from "@/lib/auth";
import { validateNewIncident } from "@/lib/validation";
import { getNextIncidentId, createIncidentTransaction } from "@/lib/dynamo-helpers";
import { docClient, DYNAMODB_TABLE } from "@/lib/aws";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Incident } from "@/types/incident";

/**
 * GET /api/incidents
 * Retrieves incidents for the authenticated operator's campus using a scan-free Query.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request, ["Supervisor", "Dispatcher", "Responder"]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const severityFilter = searchParams.get("severity");
  const categoryFilter = searchParams.get("category");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100) : 50;

  try {
    // Scan-free Query strictly bounded by authenticated user's campus partition key
    const res = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": auth.user.campusId,
          ":skPrefix": "INCIDENT#",
        },
        Limit: limit,
      })
    );

    let incidents = (res.Items || []) as Incident[];

    // RBAC: Responders may ONLY access incidents assigned to their tactical unit
    if (auth.user.role === "Responder") {
      const responderTeamId = auth.user.teamId;
      const responderCallsign = auth.user.callsign;
      incidents = incidents.filter((i) => {
        if (!i.assignedTeamId && !i.assignedResponder) return false;
        return (
          (responderTeamId && i.assignedTeamId === responderTeamId) ||
          (responderCallsign && i.assignedTeamId === responderCallsign)
        );
      });
    }

    // Apply optional filters
    if (statusFilter && statusFilter !== "all") {
      incidents = incidents.filter((i) => i.status === statusFilter);
    }
    if (severityFilter && severityFilter !== "all") {
      incidents = incidents.filter((i) => i.severity === severityFilter);
    }
    if (categoryFilter && categoryFilter !== "all") {
      incidents = incidents.filter((i) => i.category === categoryFilter);
    }

    return NextResponse.json({
      success: true,
      data: incidents,
      total: incidents.length,
      campusId: auth.user.campusId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to query incidents";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve incidents from operational database.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/incidents
 * Creates an incident with collision-safe atomic sequential ID and writes audit event in a transaction.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request, ["Supervisor", "Dispatcher", "Reporter"]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
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

  const validation = validateNewIncident(body);
  if (!validation.success || !validation.data) {
    return NextResponse.json(
      {
        success: false,
        error: "Incident payload validation failed.",
        errors: validation.errors,
      },
      { status: 400 }
    );
  }

  const payload = validation.data;
  const now = new Date().toISOString();

  try {
    // Generate next atomic sequential ID (e.g. VIG-2026-090)
    const newId = await getNextIncidentId(auth.user.campusId);

    const newIncident: Incident = {
      id: newId,
      title: payload.title,
      description: payload.description,
      category: payload.category,
      severity: payload.severity,
      status: "Reported",
      location: {
        zone: payload.zone,
        building: payload.building || payload.zone,
        landmark: payload.landmark,
        coordinates: payload.coordinates,
      },
      reportedAt: now,
      updatedAt: now,
      reporterContact: payload.reporterContact || auth.user.email,
      hasPhoto: Boolean(payload.photoKey || payload.photoUrl),
      photoUrl: payload.photoUrl || (payload.photoKey ? `/api/evidence?key=${encodeURIComponent(payload.photoKey)}` : undefined),
      notesCount: 0,
      aiClassificationScore: payload.aiClassificationScore,
      isCustomReported: true,
    };

    // Execute atomic transaction: saves incident item + initial audit event
    const result = await createIncidentTransaction({
      incident: newIncident,
      actor: auth.user.name || auth.user.email,
      actorRole: toActorRole(auth.user.role),
      campusId: auth.user.campusId,
    });

    return NextResponse.json(
      {
        success: true,
        data: result.incident,
        activity: result.activity,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create incident";
    return NextResponse.json(
      {
        success: false,
        error: "Database transaction failed while creating incident.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}
