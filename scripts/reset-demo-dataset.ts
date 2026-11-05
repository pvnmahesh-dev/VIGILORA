/**
 * VIGILORA Hackathon Demo Dataset Reset Tool
 *
 * Privileged administrative tool to reset the hackathon evaluation dataset
 * to its pristine baseline state.
 *
 * Security Guardrails:
 * - Restricted to developer CLI / AWS IAM authenticated operators
 * - Requires explicit confirmation to prevent accidental invocation
 * - Bounded strictly to the designated demo campus partition
 * - Preserves core user records (Dispatcher & Responder)
 *
 * Usage:
 *   npx tsx scripts/reset-demo-dataset.ts
 *   npx tsx scripts/reset-demo-dataset.ts --force
 */

import readline from "node:readline";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "../src/lib/aws";
import { QueryCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ensureDemoTeams } from "../src/lib/teams-seed";
import { provisionUser } from "../src/lib/auth";

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const isForce = process.argv.includes("--force") || process.argv.includes("-f");
  const campusPk = getCampusPartitionKey();

  console.log("================================================================================");
  console.log("       VIGILORA HACKATHON: DEMO DATASET ADMINISTRATIVE RESET TOOL               ");
  console.log("================================================================================\n");
  console.log(`Target Partition: ${campusPk}`);
  console.log(`Target Table:     ${DYNAMODB_TABLE}\n`);

  if (!isForce) {
    const confirmation = await prompt(
      `Are you sure you want to reset the demo dataset for partition [${campusPk}]? (yes/no): `
    );
    if (confirmation.toLowerCase() !== "yes") {
      console.log("\nReset operation aborted by operator.");
      process.exit(0);
    }
  }

  console.log("\n[1/4] Scanning for dynamic evaluation records...");

  // Query all items in this campus partition
  const res = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": campusPk },
    })
  );

  const items = res.Items || [];
  console.log(`  -> Found ${items.length} total items in partition [${campusPk}].`);

  let deletedCount = 0;
  for (const item of items) {
    const sk = item.sk as string;

    // Preserve core user records
    if (sk.startsWith("USER#")) {
      continue;
    }

    // Delete dynamically created evaluation incidents, activities, sessions, rate limits
    if (
      sk.startsWith("INCIDENT#") ||
      sk.startsWith("ACTIVITY#") ||
      sk.startsWith("EVIDENCE#") ||
      sk.startsWith("SESSION#") ||
      sk.startsWith("RATELIMIT#")
    ) {
      await docClient.send(
        new DeleteCommand({
          TableName: DYNAMODB_TABLE,
          Key: { pk: campusPk, sk },
        })
      );
      deletedCount++;
    }
  }

  console.log(`  -> Purged ${deletedCount} evaluation records (incidents, activities, sessions).`);

  // [2/4] Reset Incident ID Counter
  console.log("\n[2/4] Resetting sequential incident ID counter...");
  await docClient.send(
    new PutCommand({
      TableName: DYNAMODB_TABLE,
      Item: {
        pk: campusPk,
        sk: "META#COUNTERS",
        lastIncidentNumber: 89,
        entityType: "META",
        updatedAt: new Date().toISOString(),
      },
    })
  );
  console.log("  -> Incident sequence counter initialized to baseline (89). Next: VIG-2026-090.");

  // [3/4] Re-seed Demo Teams
  console.log("\n[3/4] Re-seeding baseline response teams...");
  await ensureDemoTeams(campusPk);
  console.log("  -> Baseline tactical response teams verified and initialized.");

  // [4/4] Verify Demo Users
  console.log("\n[4/4] Verifying demo evaluator user accounts...");
  await provisionUser({
    email: "dispatcher@demo.vigilora.internal",
    password: "TempPasscode123!Vig2026",
    name: "Lead Dispatcher Austin",
    role: "Dispatcher",
    callsign: "DISPATCH-LEAD-1",
    campusId: campusPk,
  });

  await provisionUser({
    email: "responder@demo.vigilora.internal",
    password: "TempPasscode123!Vig2026",
    name: "Officer Vance (Alpha Patrol)",
    role: "Responder",
    callsign: "UNIT-ALPHA-1",
    teamId: "MED-01",
    campusId: campusPk,
  });
  console.log("  -> Demo user accounts verified.");

  console.log("\n================================================================================");
  console.log("  DEMO DATASET RESET COMPLETE: Pristine baseline state established.");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});

