import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "./aws";
import { ResponseTeam } from "@/types/team";

/**
 * Standard fictional demonstration response teams for hackathon evaluation.
 * Clearly identified with simulation labels and clean initial "Available" operational status.
 */
export const HACKATHON_DEMO_TEAMS: Omit<ResponseTeam, "lastCheckIn">[] = [
  {
    id: "MED-01",
    name: "Medical Response Unit",
    callsign: "MED-01",
    specialty: "Emergency Medical Services",
    status: "Available",
    currentZone: "East Sports Complex",
    membersCount: 3,
    leadResponder: "Dr. Arthur Pendelton (Simulation Unit)",
    contactChannel: "TAC-MED-1 (460.125 MHz)",
    batteryStatus: 96,
  },
  {
    id: "SEC-01",
    name: "Campus Security Unit",
    callsign: "SEC-01",
    specialty: "Campus Security",
    status: "Available",
    currentZone: "Central Campus Sector",
    membersCount: 4,
    leadResponder: "Officer Marcus Vance (Simulation Unit)",
    contactChannel: "TAC-SEC-1 (458.775 MHz)",
    batteryStatus: 92,
  },
  {
    id: "FIRE-01",
    name: "Fire & Safety Response Unit",
    callsign: "FIRE-01",
    specialty: "Fire & Safety Response",
    status: "Available",
    currentZone: "North STEM Quad",
    membersCount: 3,
    leadResponder: "Capt. Thaddeus Cross (Simulation Unit)",
    contactChannel: "TAC-FIRE-1 (462.450 MHz)",
    batteryStatus: 88,
  },
];

/**
 * Ensures baseline demo teams exist in DynamoDB for the specified campus.
 * Uses atomic conditional write (attribute_not_exists(pk)) to NEVER overwrite
 * or duplicate existing teams or active operational assignments.
 */
export async function ensureDemoTeams(campusId?: string): Promise<ResponseTeam[]> {
  const campusPk = getCampusPartitionKey(campusId);
  const now = new Date().toISOString();

  for (const template of HACKATHON_DEMO_TEAMS) {
    const teamRecord: ResponseTeam = {
      ...template,
      lastCheckIn: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: DYNAMODB_TABLE,
          Item: {
            pk: campusPk,
            sk: `TEAM#${teamRecord.id}`,
            ...teamRecord,
            entityType: "TEAM",
            isDemoSeed: true,
            createdAt: now,
            updatedAt: now,
          },
          ConditionExpression: "attribute_not_exists(pk)",
        })
      );
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : "";
      if (errName === "ConditionalCheckFailedException") {
        // Team already exists in DynamoDB — safely preserve active operational record
        continue;
      }
      console.warn(`VIGILORA: Unexpected error seeding team ${template.id}:`, err);
    }
  }

  // Fetch and return the active teams
  const res = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": campusPk,
        ":prefix": "TEAM#",
      },
    })
  );

  return (res.Items || []) as ResponseTeam[];
}

