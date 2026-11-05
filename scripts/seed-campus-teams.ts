/**
 * VIGILORA Campus Tactical Teams Provisioning Tool
 *
 * Explicitly provisions baseline tactical response teams to DynamoDB for a campus.
 *
 * Requirements:
 * - Uses DEMO_TEAMS definitions only as initial structural templates.
 * - Never copies demo activeIncidentId or fictitious incident references.
 * - Initializes clean operational states (status: "Available").
 * - Uses conditional writes (attribute_not_exists(pk)) to prevent overwriting existing teams.
 * - Never resets active teams or overwrites existing operational data.
 * - Requires explicit operator confirmation before seeding when run interactively.
 *
 * Usage:
 *   Interactive:
 *     npx tsx scripts/seed-campus-teams.ts
 *
 *   Non-interactive (automation/scripts):
 *     npx tsx scripts/seed-campus-teams.ts --yes
 */

import readline from "node:readline";
import { HACKATHON_DEMO_TEAMS } from "../src/lib/teams-seed";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "../src/lib/aws";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ResponseTeam } from "../src/types/team";

export interface SeedOptions {
  campusId?: string;
  nonInteractive?: boolean;
}

export interface SeedResultItem {
  id: string;
  name: string;
  callsign: string;
  outcome: "SEEDED" | "PRESERVED";
}

export interface SeedResult {
  totalTemplates: number;
  seededCount: number;
  preservedCount: number;
  items: SeedResultItem[];
}

export async function seedCampusTeams(options?: SeedOptions): Promise<SeedResult> {
  const campusPk = getCampusPartitionKey(options?.campusId);
  const now = new Date().toISOString();

  let seededCount = 0;
  let preservedCount = 0;
  const items: SeedResultItem[] = [];

  for (const template of HACKATHON_DEMO_TEAMS) {
    // 1. Create clean operational record (never carry over fictitious demo incident references)
    const cleanTeam: ResponseTeam = {
      id: template.id,
      name: template.name,
      callsign: template.callsign,
      specialty: template.specialty,
      status: "Available", // Initial clean operational state
      currentZone: template.currentZone,
      membersCount: template.membersCount,
      leadResponder: template.leadResponder,
      contactChannel: template.contactChannel,
      batteryStatus: template.batteryStatus ?? 100,
      lastCheckIn: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: DYNAMODB_TABLE,
          Item: {
            pk: campusPk,
            sk: `TEAM#${cleanTeam.id}`,
            ...cleanTeam,
            entityType: "TEAM",
            createdAt: now,
            updatedAt: now,
          },
          ConditionExpression: "attribute_not_exists(pk)",
        })
      );

      console.log(`  [SEEDED] ${cleanTeam.name} (${cleanTeam.id}) - Status: Available`);
      seededCount++;
      items.push({
        id: cleanTeam.id,
        name: cleanTeam.name,
        callsign: cleanTeam.callsign,
        outcome: "SEEDED",
      });
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : "";
      if (errName === "ConditionalCheckFailedException") {
        console.log(`  [PRESERVED] ${template.name} (${template.id}) already exists in DynamoDB — active state untouched`);
        preservedCount++;
        items.push({
          id: template.id,
          name: template.name,
          callsign: template.callsign,
          outcome: "PRESERVED",
        });
      } else {
        throw err;
      }
    }
  }

  return {
    totalTemplates: HACKATHON_DEMO_TEAMS.length,
    seededCount,
    preservedCount,
    items,
  };
}

async function promptConfirmation(promptText: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === "yes" || trimmed === "y");
    });
  });
}

async function main() {
  console.log("=================================================");
  console.log("  VIGILORA CAMPUS TACTICAL TEAMS PROVISIONING ");
  console.log("=================================================\n");

  const campusPk = getCampusPartitionKey();
  const isNonInteractive =
    process.argv.includes("--yes") ||
    process.argv.includes("-y") ||
    Boolean(process.env.CI);

  console.log(`Target Campus: ${campusPk}`);
  console.log(`DynamoDB Table: ${DYNAMODB_TABLE}`);
  console.log(`Template Units: ${HACKATHON_DEMO_TEAMS.length} teams\n`);

  if (!isNonInteractive) {
    const confirmed = await promptConfirmation(
      `This will provision initial response teams to "${campusPk}" in DynamoDB.\nExisting active teams will NOT be overwritten.\nProceed with provisioning? (yes/no): `
    );
    if (!confirmed) {
      console.log("\nProvisioning cancelled by operator.");
      process.exit(0);
    }
    console.log("");
  }

  try {
    const result = await seedCampusTeams();
    console.log("\n-------------------------------------------------");
    console.log(`Provisioning completed:`);
    console.log(`  Seeded:    ${result.seededCount} teams`);
    console.log(`  Preserved: ${result.preservedCount} teams`);
    console.log(`  Total:     ${result.totalTemplates} units processed`);
    console.log("=================================================");
  } catch (err) {
    console.error("Provisioning failed:", err);
    process.exit(1);
  }
}

if (process.argv[1]?.includes("seed-campus-teams")) {
  main();
}

