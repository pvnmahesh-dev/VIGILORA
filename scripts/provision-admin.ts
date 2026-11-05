/**
 * VIGILORA Secure Initial Administrator Provisioning Tool
 *
 * Usage:
 *   npx tsx scripts/provision-admin.ts
 *
 * Environment variables (optional, for non-interactive automation):
 *   VIGILORA_ADMIN_EMAIL=supervisor@campus.vigilora.internal
 *   VIGILORA_ADMIN_PASSWORD=YourSecurePassword123!
 *   VIGILORA_ADMIN_NAME="Chief Inspector Vance"
 *   VIGILORA_ADMIN_CALLSIGN="COMMAND-1"
 *
 * NOTE: Passwords are NEVER written to logs or console output.
 */

import readline from "node:readline";
import { provisionUser } from "../src/lib/auth";

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (!hidden) {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    } else {
      process.stdout.write(question);
      let input = "";
      process.stdin.setRawMode?.(true);
      process.stdin.resume();

      const onData = (char: Buffer) => {
        const c = char.toString("utf8");
        if (c === "\n" || c === "\r" || c === "\u0004") {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          rl.close();
          process.stdout.write("\n");
          resolve(input.trim());
        } else if (c === "\u0003") {
          process.exit(1);
        } else if (c === "\u007f" || c === "\b") {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          input += c;
          process.stdout.write("*");
        }
      };

      process.stdin.on("data", onData);
    }
  });
}

async function main() {
  console.log("=================================================");
  console.log("   VIGILORA SECURE SUPERVISOR PROVISIONING TOOL  ");
  console.log("=================================================");

  const email =
    process.env.VIGILORA_ADMIN_EMAIL ||
    (await prompt("Enter Supervisor Email: "));

  if (!email || !email.includes("@")) {
    console.error("Error: A valid email address is required.");
    process.exit(1);
  }

  const name =
    process.env.VIGILORA_ADMIN_NAME ||
    (await prompt("Enter Supervisor Full Name: ")) ||
    "Command Supervisor";

  const callsign =
    process.env.VIGILORA_ADMIN_CALLSIGN ||
    (await prompt("Enter Radio Callsign (optional, e.g. COMMAND-1): ")) ||
    "COMMAND-1";

  const password =
    process.env.VIGILORA_ADMIN_PASSWORD ||
    (await prompt("Enter Secure Password (min 10 characters): ", true));

  if (!password || password.length < 10) {
    console.error("Error: Password must be at least 10 characters long.");
    process.exit(1);
  }

  try {
    console.log(`\nProvisioning Supervisor identity for [${email}]...`);
    const result = await provisionUser({
      email,
      password,
      name,
      role: "Supervisor",
      callsign,
    });

    console.log("=================================================");
    if (result.created) {
      console.log("[SUCCESS] Supervisor account created successfully!");
      console.log(`  Email:    ${result.user.email}`);
      console.log(`  Name:     ${result.user.name}`);
      console.log(`  Role:     ${result.user.role}`);
      console.log(`  Callsign: ${result.user.callsign || "None"}`);
    } else {
      console.log("[INFO] Idempotent Provisioning Check:");
      console.log(`  ${result.message}`);
    }
    console.log("=================================================");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n[ERROR] Provisioning failed: ${msg}`);
    process.exit(1);
  }
}

main();
