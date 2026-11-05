/**
 * VIGILORA Server-Side DynamoDB Helper Functions
 *
 * Implements:
 * - Atomic sequential incident ID allocation (VIG-2026-XXX) with zero collisions
 * - Scan-free Query operations bounded by campus partition key
 * - ACID TransactWrite operations for incident creation, status updates, and team assignments
 * - Activity log persistence with chronological ISO-8601 sort keys
 */

if (typeof window !== "undefined") {
  throw new Error("VIGILORA dynamo-helpers module can only be executed in a server-side environment.");
}

import {
  UpdateCommand,
  QueryCommand,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "./aws";
import { ActivityEvent, Incident, IncidentSeverity, IncidentStatus } from "@/types/incident";
import { ResponseTeam, TeamStatus } from "@/types/team";

const COUNTERS_SK = "META#COUNTERS";
const BASELINE_SEQUENCE_START = 89;

/**
 * Atomically increments and returns the next sequential incident ID.
 * Generates formatted IDs: "VIG-2026-090", "VIG-2026-091", etc.
 */
export async function getNextIncidentId(campusId?: string): Promise<string> {
  const campusPk = getCampusPartitionKey(campusId);

  // First ensure counter exists initialized at BASELINE_SEQUENCE_START if not yet present
  try {
    const existing = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: COUNTERS_SK },
      })
    );

    if (!existing.Item) {
      await docClient.send(
        new PutCommand({
          TableName: DYNAMODB_TABLE,
          Item: {
            pk: campusPk,
            sk: COUNTERS_SK,
            incidentSeq: BASELINE_SEQUENCE_START,
            updatedAt: new Date().toISOString(),
          },
          ConditionExpression: "attribute_not_exists(pk)",
        })
      ).catch(() => {
        // Ignored if created concurrently
      });
    }
  } catch {
    // Proceed to atomic update
  }

  // Atomically increment counter
  const result = await docClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE,
      Key: { pk: campusPk, sk: COUNTERS_SK },
      UpdateExpression: "ADD incidentSeq :inc SET updatedAt = :now",
      ExpressionAttributeValues: {
        ":inc": 1,
        ":now": new Date().toISOString(),
      },
      ReturnValues: "UPDATED_NEW",
    })
  );

  const nextNum = result.Attributes?.incidentSeq ?? (BASELINE_SEQUENCE_START + 1);
  return `VIG-2026-${String(nextNum).padStart(3, "0")}`;
}

/**
 * Atomic transaction to create an Incident AND its initial Creation Activity Event together.
 */
export async function createIncidentTransaction(params: {
  incident: Incident;
  actor: string;
  actorRole: "System AI" | "Dispatcher" | "Field Responder" | "Reporter" | "Supervisor";
  campusId?: string;
}): Promise<{ incident: Incident; activity: ActivityEvent }> {
  const campusPk = getCampusPartitionKey(params.campusId);
  const now = new Date().toISOString();
  const actId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const activitySk = `ACTIVITY#${now}#${actId}`;

  const activityItem = {
    pk: campusPk,
    sk: activitySk,
    id: actId,
    incidentId: params.incident.id,
    incidentTitle: params.incident.title,
    action: `Incident reported via Dispatch Console: "${params.incident.title}"`,
    actor: params.actor,
    actorRole: params.actorRole,
    timestamp: now,
    severity: params.incident.severity,
    type: "creation" as const,
    entityType: "ACTIVITY",
  };

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: DYNAMODB_TABLE,
            Item: {
              pk: campusPk,
              sk: `INCIDENT#${params.incident.id}`,
              ...params.incident,
              entityType: "INCIDENT",
            },
            ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
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

  return {
    incident: params.incident,
    activity: {
      id: actId,
      incidentId: params.incident.id,
      incidentTitle: params.incident.title,
      action: activityItem.action,
      actor: params.actor,
      actorRole: params.actorRole,
      timestamp: now,
      severity: params.incident.severity,
      type: "creation",
    },
  };
}

/**
 * Retrieves a tactical team strictly from DynamoDB.
 * Pure read-only operation: never creates, mutates, or seeds records.
 */
export async function getTeam(teamId: string, campusId?: string): Promise<ResponseTeam | null> {
  const campusPk = getCampusPartitionKey(campusId);

  const res = await docClient.send(
    new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: { pk: campusPk, sk: `TEAM#${teamId}` },
    })
  );

  if (res.Item) {
    return res.Item as ResponseTeam;
  }

  return null;
}

/**
 * Atomic transaction to assign a tactical response team to an incident.
 * - Updates Incident: status -> "Assigned" (if Reported), assignedTeamId, assignedResponder
 * - Updates New Team: status -> "En Route", activeIncidentId, activeIncidentTitle
 * - Updates Previous Team (if different): status -> "Available", clears activeIncident
 * - Puts Activity Event: type = "dispatch"
 */
export async function assignTeamTransaction(params: {
  incident: Incident;
  targetTeam: ResponseTeam;
  previousTeamId?: string;
  actor: string;
  actorRole: "System AI" | "Dispatcher" | "Field Responder" | "Reporter" | "Supervisor";
  campusId?: string;
}): Promise<ActivityEvent> {
  const campusPk = getCampusPartitionKey(params.campusId);
  const now = new Date().toISOString();
  const actId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const activitySk = `ACTIVITY#${now}#${actId}`;

  const newStatus =
    params.incident.status === "Reported" || params.incident.status === "Under review"
      ? "Assigned"
      : params.incident.status;
  const actionText = params.previousTeamId
    ? `Tactical unit reassigned to ${params.targetTeam.name} (${params.targetTeam.callsign})`
    : `Dispatched ${params.targetTeam.name} (${params.targetTeam.callsign}) to scene`;

  const activityItem = {
    pk: campusPk,
    sk: activitySk,
    id: actId,
    incidentId: params.incident.id,
    incidentTitle: params.incident.title,
    action: actionText,
    actor: params.actor,
    actorRole: params.actorRole,
    timestamp: now,
    severity: params.incident.severity,
    type: "dispatch" as const,
    teamId: params.targetTeam.id,
    teamCallsign: params.targetTeam.callsign,
    entityType: "ACTIVITY",
  };

  const transactItems: unknown[] = [
    // 1. Update Incident
    {
      Update: {
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `INCIDENT#${params.incident.id}` },
        UpdateExpression:
          "SET assignedTeamId = :teamId, assignedResponder = :teamName, #st = :status, updatedAt = :now",
        ExpressionAttributeNames: {
          "#st": "status",
        },
        ExpressionAttributeValues: {
          ":teamId": params.targetTeam.id,
          ":teamName": params.targetTeam.name,
          ":status": newStatus,
          ":now": now,
        },
      },
    },
    // 2. Update New Team (enforce existence to prevent hollow stub creation)
    {
      Update: {
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `TEAM#${params.targetTeam.id}` },
        UpdateExpression:
          "SET #st = :teamStatus, activeIncidentId = :incId, activeIncidentTitle = :incTitle, lastCheckIn = :now",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeNames: {
          "#st": "status",
        },
        ExpressionAttributeValues: {
          ":teamStatus": "En Route",
          ":incId": params.incident.id,
          ":incTitle": params.incident.title,
          ":now": now,
        },
      },
    },
    // 3. Put Dispatch Activity
    {
      Put: {
        TableName: DYNAMODB_TABLE,
        Item: activityItem,
      },
    },
  ];

  // 4. If previous team existed and is different, verify existence and release back to Available
  if (params.previousTeamId && params.previousTeamId !== params.targetTeam.id) {
    const prevExists = await getTeam(params.previousTeamId, params.campusId);
    if (prevExists) {
      transactItems.push({
        Update: {
          TableName: DYNAMODB_TABLE,
          Key: { pk: campusPk, sk: `TEAM#${params.previousTeamId}` },
          UpdateExpression:
            "SET #st = :availStatus REMOVE activeIncidentId, activeIncidentTitle",
          ConditionExpression: "attribute_exists(pk)",
          ExpressionAttributeNames: {
            "#st": "status",
          },
          ExpressionAttributeValues: {
            ":availStatus": "Available",
          },
        },
      });
    }
  }

  // Execute atomic multi-item transaction
  await docClient.send(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new TransactWriteCommand({ TransactItems: transactItems as any })
  );

  return {
    id: actId,
    incidentId: params.incident.id,
    incidentTitle: params.incident.title,
    action: actionText,
    actor: params.actor,
    actorRole: params.actorRole,
    timestamp: now,
    severity: params.incident.severity,
    type: "dispatch",
  };
}

/**
 * Atomic transaction to unassign a team from an incident.
 */
export async function unassignTeamTransaction(params: {
  incident: Incident;
  teamId: string;
  teamName: string;
  actor: string;
  actorRole: "System AI" | "Dispatcher" | "Field Responder" | "Reporter" | "Supervisor";
  campusId?: string;
}): Promise<ActivityEvent> {
  const campusPk = getCampusPartitionKey(params.campusId);
  const now = new Date().toISOString();
  const actId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const activitySk = `ACTIVITY#${now}#${actId}`;

  const newStatus = params.incident.status === "Assigned" ? "Under review" : params.incident.status;
  const actionText = `${params.teamName || "Unit"} unassigned from scene and returned to Available pool`;

  const activityItem = {
    pk: campusPk,
    sk: activitySk,
    id: actId,
    incidentId: params.incident.id,
    incidentTitle: params.incident.title,
    action: actionText,
    actor: params.actor,
    actorRole: params.actorRole,
    timestamp: now,
    severity: params.incident.severity,
    type: "status_change" as const,
    teamId: params.teamId,
    entityType: "ACTIVITY",
  };

  const transactItems: unknown[] = [
    // 1. Revert incident
    {
      Update: {
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `INCIDENT#${params.incident.id}` },
        UpdateExpression:
          "SET #st = :status, updatedAt = :now REMOVE assignedTeamId, assignedResponder",
        ExpressionAttributeNames: {
          "#st": "status",
        },
        ExpressionAttributeValues: {
          ":status": newStatus,
          ":now": now,
        },
      },
    },
    // 2. Put activity record
    {
      Put: {
        TableName: DYNAMODB_TABLE,
        Item: activityItem,
      },
    },
  ];

  // 3. If team exists in DynamoDB, free it back to Available (prevent hollow stub)
  const teamExists = await getTeam(params.teamId, params.campusId);
  if (teamExists) {
    transactItems.splice(1, 0, {
      Update: {
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `TEAM#${params.teamId}` },
        UpdateExpression:
          "SET #st = :teamStatus REMOVE activeIncidentId, activeIncidentTitle",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeNames: {
          "#st": "status",
        },
        ExpressionAttributeValues: {
          ":teamStatus": "Available",
        },
      },
    });
  }

  await docClient.send(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new TransactWriteCommand({ TransactItems: transactItems as any })
  );

  return {
    id: actId,
    incidentId: params.incident.id,
    incidentTitle: params.incident.title,
    action: actionText,
    actor: params.actor,
    actorRole: params.actorRole,
    timestamp: now,
    severity: params.incident.severity,
    type: "status_change",
  };
}

/**
 * Atomic transaction to resolve an incident:
 * - Updates Incident: status -> "Resolved", updatedAt -> now
 * - Releases assigned team (if any and exists): status -> "Available", clears active incident
 * - Puts Activity Event: type = "resolution"
 */
export async function resolveIncidentTransaction(params: {
  incident: Incident;
  assignedTeamId?: string;
  notes?: string;
  actor: string;
  actorRole: "System AI" | "Dispatcher" | "Field Responder" | "Reporter" | "Supervisor";
  campusId?: string;
}): Promise<ActivityEvent> {
  const campusPk = getCampusPartitionKey(params.campusId);
  const now = new Date().toISOString();
  const actId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const activitySk = `ACTIVITY#${now}#${actId}`;

  const actionText = params.notes || `Incident operationally marked as Resolved`;

  const activityItem = {
    pk: campusPk,
    sk: activitySk,
    id: actId,
    incidentId: params.incident.id,
    incidentTitle: params.incident.title,
    action: actionText,
    actor: params.actor,
    actorRole: params.actorRole,
    timestamp: now,
    severity: params.incident.severity,
    type: "resolution" as const,
    entityType: "ACTIVITY",
  };

  const transactItems: unknown[] = [
    // 1. Update incident to Resolved
    {
      Update: {
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `INCIDENT#${params.incident.id}` },
        UpdateExpression: "SET #st = :resStatus, updatedAt = :now",
        ExpressionAttributeNames: {
          "#st": "status",
        },
        ExpressionAttributeValues: {
          ":resStatus": "Resolved",
          ":now": now,
        },
      },
    },
    // 2. Put resolution activity event
    {
      Put: {
        TableName: DYNAMODB_TABLE,
        Item: activityItem,
      },
    },
  ];

  // 3. If an assigned team exists in DynamoDB, release it back to Available
  if (params.assignedTeamId) {
    const teamExists = await getTeam(params.assignedTeamId, params.campusId);
    if (teamExists) {
      transactItems.push({
        Update: {
          TableName: DYNAMODB_TABLE,
          Key: { pk: campusPk, sk: `TEAM#${params.assignedTeamId}` },
          UpdateExpression:
            "SET #st = :availStatus REMOVE activeIncidentId, activeIncidentTitle",
          ConditionExpression: "attribute_exists(pk)",
          ExpressionAttributeNames: {
            "#st": "status",
          },
          ExpressionAttributeValues: {
            ":availStatus": "Available",
          },
        },
      });
    }
  }

  await docClient.send(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new TransactWriteCommand({ TransactItems: transactItems as any })
  );

  return {
    id: actId,
    incidentId: params.incident.id,
    incidentTitle: params.incident.title,
    action: actionText,
    actor: params.actor,
    actorRole: params.actorRole,
    timestamp: now,
    severity: params.incident.severity,
    type: "resolution",
  };
}

/**
 * Scan-free query helper fetching all activities for a campus in reverse chronological order.
 */
export async function queryCampusActivities(
  campusId?: string,
  limit = 50
): Promise<ActivityEvent[]> {
  const campusPk = getCampusPartitionKey(campusId);

  const res = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": campusPk,
        ":skPrefix": "ACTIVITY#",
      },
      ScanIndexForward: false, // Newest first
      Limit: limit,
    })
  );

  return (res.Items || []).map((item) => ({
    id: item.id as string,
    incidentId: item.incidentId as string,
    incidentTitle: item.incidentTitle as string,
    action: item.action as string,
    actor: item.actor as string,
    actorRole: item.actorRole as ActivityEvent["actorRole"],
    timestamp: item.timestamp as string,
    severity: item.severity as IncidentSeverity,
    type: item.type as ActivityEvent["type"],
  }));
}

/**
 * Scan-free query helper fetching items by sort key prefix within campus partition.
 */
export async function queryByPrefix<T>(
  prefix: string,
  campusId?: string,
  limit?: number
): Promise<T[]> {
  const campusPk = getCampusPartitionKey(campusId);

  const res = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": campusPk,
        ":prefix": prefix,
      },
      Limit: limit,
    })
  );

  return (res.Items || []) as T[];
}
