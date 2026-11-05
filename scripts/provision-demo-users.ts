/**
 * VIGILORA Local Hackathon Demo Roles Provisioning Script
 *
 * Provisions three genuine operator accounts for hackathon judging:
 * 1. Lead Dispatcher (role: Dispatcher)
 * 2. Field Responder (role: Responder)
 * 3. Campus Administrator (role: Supervisor)
 *
 * Security:
 * - Credentials are saved strictly to a local, git-ignored file (.demo-credentials.json)
 * - Never committed to source control
 * - Conditional writes prevent duplicate accounts or resetting existing users
 * - Zero hardcoding in client application code
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { provisionUser, UserRole } from "../src/lib/auth";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "../src/lib/aws";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

const CREDENTIALS_FILE = path.join(process.cwd(), ".demo-credentials.json");

interface DemoAccountConfig {
  role: UserRole;
  email: string;
  name: string;
  callsign: string;
  teamId?: string;
  password?: string;
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
  return `${crypto.randomBytes(12).toString("base64url")}!Vig2026`;
}

async function main() {
  console.log("================================================================================");
  console.log("       VIGILORA HACKATHON: DEMO ROLE USER PROVISIONING TOOL");
  console.log("================================================================================\n");

  let existingSaved: Record<string, DemoAccountConfig> = {};
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      existingSaved = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
      console.log(`[INFO] Found existing local credentials at ${CREDENTIALS_FILE}`);
    } catch {
      existingSaved = {};
    }
  }

  const results: Record<string, DemoAccountConfig & { status: string }> = {};

  for (const account of DEMO_ACCOUNTS) {
    const existingEntry = existingSaved[account.role];
    const password = existingEntry?.password || generateSecurePassword();

    try {
      console.log(`Provisioning [${account.role}] account (${account.email})...`);
      const res = await provisionUser({
        email: account.email,
        password,
        name: account.name,
        role: account.role,
        callsign: account.callsign,
        teamId: account.teamId,
      });

      // If account already exists and has a specified team association, synchronize teamId in DynamoDB
      if (!res.created && account.teamId) {
        await docClient.send(
          new UpdateCommand({
            TableName: DYNAMODB_TABLE,
            Key: {
              pk: getCampusPartitionKey(),
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

      results[account.role] = {
        role: account.role,
        email: account.email,
        name: account.name,
        callsign: account.callsign,
        teamId: account.teamId,
        password,
        status: res.created ? "CREATED" : "ALREADY_EXISTS (PRESERVED)",
      };

      console.log(`  -> Status: ${res.created ? "NEW ACCOUNT CREATED" : "ALREADY EXISTS (PRESERVED)"}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  -> [ERROR] Failed to provision ${account.role}: ${msg}`);
      process.exit(1);
    }
  }

  // Write securely to local .demo-credentials.json (ignored by git)
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(results, null, 2), {
    mode: 0o600,
  });

  console.log("\n================================================================================");
  console.log("  DEMO ROLE ACCOUNTS READY FOR HACKATHON EVALUATION");
  console.log("================================================================================");
  for (const [role, acc] of Object.entries(results)) {
    console.log(`\n• ROLE: ${role.toUpperCase()}`);
    console.log(`  Email:    ${acc.email}`);
    console.log(`  Name:     ${acc.name}`);
    console.log(`  Callsign: ${acc.callsign}`);
    console.log(`  Status:   ${acc.status}`);
  }
  console.log("\nLocal credentials persisted to: .demo-credentials.json (Strictly excluded from git)");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});

