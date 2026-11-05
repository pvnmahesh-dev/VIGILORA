/**
 * VIGILORA Hackathon Demo Roles Provisioning Script
 *
 * Provisions genuine operator accounts for hackathon judging directly in DynamoDB:
 * 1. Lead Dispatcher (role: Dispatcher)
 * 2. Field Responder (role: Responder)
 *
 * Security:
 * - Credentials are encrypted via scrypt and stored directly in DynamoDB
 * - Zero plaintext passwords written to disk or environment variables
 * - Idempotent conditional writes prevent overwriting existing credentials
 * - Zero hardcoding in frontend bundles
 */

import crypto from "node:crypto";
import { provisionUser, UserRole } from "../src/lib/auth";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "../src/lib/aws";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

interface DemoAccountConfig {
  role: UserRole;
  email: string;
  name: string;
  callsign: string;
  teamId?: string;
}

const DEMO_ACCOUNTS: DemoAccountConfig[] = [
  {
    role: "Dispatcher",
    email: "dispatcher@demo.vigilora.internal",
    name: "Lead Dispatcher Austin",
    callsign: "DISPATCH-LEAD-1",
  },
  {
    role: "Responder",
    email: "responder@demo.vigilora.internal",
    name: "Officer Vance (Alpha Patrol)",
    callsign: "UNIT-ALPHA-1",
    teamId: "MED-01",
  },
  {
    role: "Supervisor",
    email: "admin@demo.vigilora.internal",
    name: "Chief Inspector Helena Vance",
    callsign: "CHIEF-SUPERVISOR-1",
  },
];

function generateSecurePassword(): string {
  return `${crypto.randomBytes(16).toString("base64url")}!Vig2026`;
}

async function main() {
  const campusPk = getCampusPartitionKey();

  console.log("================================================================================");
  console.log("       VIGILORA HACKATHON: DEMO ROLE USER PROVISIONING TOOL");
  console.log("================================================================================\n");
  console.log(`Target Partition: ${campusPk}`);
  console.log(`Target Table:     ${DYNAMODB_TABLE}\n`);

  for (const account of DEMO_ACCOUNTS) {
    const password = generateSecurePassword();

    try {
      console.log(`Provisioning [${account.role}] account (${account.email})...`);
      const res = await provisionUser({
        email: account.email,
        password,
        name: account.name,
        role: account.role,
        callsign: account.callsign,
        teamId: account.teamId,
        campusId: campusPk,
      });

      // Synchronize team association in DynamoDB if needed
      if (account.teamId) {
        await docClient.send(
          new UpdateCommand({
            TableName: DYNAMODB_TABLE,
            Key: {
              pk: campusPk,
              sk: `USER#${account.email.toLowerCase()}`,
            },
            UpdateExpression: "SET teamId = :tid, updatedAt = :now",
            ExpressionAttributeValues: {
              ":tid": account.teamId,
              ":now": new Date().toISOString(),
            },
          })
        );
        console.log(`  -> Associated with tactical unit [${account.teamId}] in DynamoDB`);
      }

      console.log(`  -> Status: ${res.created ? "NEW ACCOUNT CREATED" : "ALREADY EXISTS (PRESERVED)"}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  -> [ERROR] Failed to provision ${account.role}: ${msg}`);
      process.exit(1);
    }
  }

  console.log("\n================================================================================");
  console.log("  DEMO ROLE ACCOUNTS READY FOR HACKATHON EVALUATION");
  console.log("================================================================================");
  for (const acc of DEMO_ACCOUNTS) {
    console.log(`\n• ROLE: ${acc.role.toUpperCase()}`);
    console.log(`  Email:    ${acc.email}`);
    console.log(`  Name:     ${acc.name}`);
    console.log(`  Callsign: ${acc.callsign}`);
    if (acc.teamId) console.log(`  Team:     ${acc.teamId}`);
  }
  console.log("\nZero credentials written to disk. Direct role selection enabled via /api/auth/demo-login.");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
