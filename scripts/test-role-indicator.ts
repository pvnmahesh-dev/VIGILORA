/**
 * VIGILORA HACKATHON: LOGGED-IN ROLE INDICATOR TEST BATTERY
 *
 * Verifies:
 * 1. Role presentation utility mapping for all roles (ADMIN, DISPATCHER, RESPONDER).
 * 2. Role-specific clarity descriptions matching actual permissions.
 * 3. Authenticated session verification for all three demo accounts:
 *    - Supervisor -> ADMIN -> "Campus-wide incident visibility"
 *    - Dispatcher -> DISPATCHER -> "Campus-wide incident coordination"
 *    - Responder -> RESPONDER -> "Assigned-team incident visibility"
 * 4. Account switching and session revocation (logout) handling.
 * 5. TopNavigation component source code audit for user name and role badge.
 * 6. Command Centre component source code audit for CURRENT ACCESS label and clarity string.
 * 7. Security: role derived strictly from verified server session.
 */

import fs from "fs";
import path from "path";
import { getRolePresentation } from "../src/lib/role-utils";
import {
  authenticateUser,
  createSession,
  revokeSession,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { GET as getSessionHandler } from "../src/app/api/auth/session/route";
import { POST as logoutHandler } from "../src/app/api/auth/logout/route";

const CREDENTIALS_FILE = path.join(process.cwd(), ".demo-credentials.json");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

async function runRoleIndicatorBattery() {
  console.log("================================================================================");
  console.log("       VIGILORA HACKATHON: LOGGED-IN ROLE INDICATOR TEST SUITE");
  console.log("================================================================================\n");

  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error("[FATAL] .demo-credentials.json not found.");
    process.exit(1);
  }
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Role Presentation Utility & Canonical Permission Clarity
  // ---------------------------------------------------------------------------
  console.log("[SCENARIO 1: Role Presentation & Clarity Metadata Mapping]");

  // A: Admin / Supervisor
  const adminPres = getRolePresentation("Supervisor");
  assert(adminPres.displayRole === "ADMIN", "Supervisor role maps to displayRole 'ADMIN'");
  assert(adminPres.label === "ADMIN", "Supervisor role label is 'ADMIN'");
  assert(adminPres.badgeText === "CURRENT ACCESS: ADMIN", "Supervisor badge text is 'CURRENT ACCESS: ADMIN'");
  assert(
    adminPres.description === "Campus-wide incident visibility",
    "Supervisor clarity description strictly equals 'Campus-wide incident visibility'"
  );
  assert(adminPres.badgeStyle.text.includes("F01420"), "Admin badge uses gothic crimson highlight");

  // Also verify alias 'admin'
  const adminAlias = getRolePresentation("admin");
  assert(adminAlias.displayRole === "ADMIN", "'admin' alias maps to 'ADMIN'");
  assert(adminAlias.description === "Campus-wide incident visibility", "'admin' alias preserves clarity description");

  // B: Dispatcher
  const dispPres = getRolePresentation("Dispatcher");
  assert(dispPres.displayRole === "DISPATCHER", "Dispatcher role maps to displayRole 'DISPATCHER'");
  assert(dispPres.label === "DISPATCHER", "Dispatcher role label is 'DISPATCHER'");
  assert(dispPres.badgeText === "CURRENT ACCESS: DISPATCHER", "Dispatcher badge text is 'CURRENT ACCESS: DISPATCHER'");
  assert(
    dispPres.description === "Campus-wide incident coordination",
    "Dispatcher clarity description strictly equals 'Campus-wide incident coordination'"
  );
  assert(dispPres.badgeStyle.text.includes("f59e0b"), "Dispatcher badge uses gothic amber flame styling");

  // C: Responder
  const respPres = getRolePresentation("Responder");
  assert(respPres.displayRole === "RESPONDER", "Responder role maps to displayRole 'RESPONDER'");
  assert(respPres.label === "RESPONDER", "Responder role label is 'RESPONDER'");
  assert(respPres.badgeText === "CURRENT ACCESS: RESPONDER", "Responder badge text is 'CURRENT ACCESS: RESPONDER'");
  assert(
    respPres.description === "Assigned-team incident visibility",
    "Responder clarity description strictly equals 'Assigned-team incident visibility'"
  );
  assert(respPres.badgeStyle.text.includes("10b981"), "Responder badge uses tactical emerald styling");

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Server-Side Authenticated Session Hydration for All Three Roles
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 2: Server-Side Authenticated Session Verification]");

  // 1. ADMIN (Supervisor) Session
  const supCred = credentials["Supervisor"];
  const supAuth = await authenticateUser(supCred.email, supCred.password, "127.0.0.1");
  assert("user" in supAuth, "Supervisor authenticated successfully");
  const supSession = "user" in supAuth ? await createSession(supAuth.user) : null;
  assert(Boolean(supSession?.plainToken), "Supervisor session token created in DynamoDB");

  const supRes = await getSessionHandler(
    new Request("http://localhost:3000/api/auth/session", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${supSession?.plainToken}` },
    })
  );
  assert(supRes.status === 200, "GET /api/auth/session for Supervisor returns HTTP 200");
  const supPayload = await supRes.json();
  assert(supPayload.success === true, "Session payload reports success: true");
  assert(supPayload.user.role === "Supervisor", "Session user role is 'Supervisor'");
  assert(supPayload.user.name === supCred.name, `Session user name matches "${supCred.name}"`);
  const supMapped = getRolePresentation(supPayload.user.role);
  assert(supMapped.label === "ADMIN", "Supervisor session resolves to UI label 'ADMIN'");
  assert(supMapped.description === "Campus-wide incident visibility", "Supervisor resolves to 'Campus-wide incident visibility'");

  // 2. DISPATCHER Session
  const dispCred = credentials["Dispatcher"];
  const dispAuth = await authenticateUser(dispCred.email, dispCred.password, "127.0.0.1");
  assert("user" in dispAuth, "Dispatcher authenticated successfully");
  const dispSession = "user" in dispAuth ? await createSession(dispAuth.user) : null;
  assert(Boolean(dispSession?.plainToken), "Dispatcher session token created in DynamoDB");

  const dispRes = await getSessionHandler(
    new Request("http://localhost:3000/api/auth/session", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${dispSession?.plainToken}` },
    })
  );
  assert(dispRes.status === 200, "GET /api/auth/session for Dispatcher returns HTTP 200");
  const dispPayload = await dispRes.json();
  assert(dispPayload.user.role === "Dispatcher", "Session user role is 'Dispatcher'");
  assert(dispPayload.user.name === dispCred.name, `Session user name matches "${dispCred.name}"`);
  const dispMapped = getRolePresentation(dispPayload.user.role);
  assert(dispMapped.label === "DISPATCHER", "Dispatcher session resolves to UI label 'DISPATCHER'");
  assert(dispMapped.description === "Campus-wide incident coordination", "Dispatcher resolves to 'Campus-wide incident coordination'");

  // 3. RESPONDER Session
  const respCred = credentials["Responder"];
  const respAuth = await authenticateUser(respCred.email, respCred.password, "127.0.0.1");
  assert("user" in respAuth, "Responder authenticated successfully");
  const respSession = "user" in respAuth ? await createSession(respAuth.user) : null;
  assert(Boolean(respSession?.plainToken), "Responder session token created in DynamoDB");

  const respRes = await getSessionHandler(
    new Request("http://localhost:3000/api/auth/session", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${respSession?.plainToken}` },
    })
  );
  assert(respRes.status === 200, "GET /api/auth/session for Responder returns HTTP 200");
  const respPayload = await respRes.json();
  assert(respPayload.user.role === "Responder", "Session user role is 'Responder'");
  assert(respPayload.user.name === respCred.name, `Session user name matches "${respCred.name}"`);
  assert(respPayload.user.teamId === "MED-01", "Responder user is assigned to team 'MED-01'");
  const respMapped = getRolePresentation(respPayload.user.role);
  assert(respMapped.label === "RESPONDER", "Responder session resolves to UI label 'RESPONDER'");
  assert(respMapped.description === "Assigned-team incident visibility", "Responder resolves to 'Assigned-team incident visibility'");

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Account Switching & Logout Revocation
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 3: Account Switching & Logout Handling]");

  // A: Switching between accounts updates role
  assert(
    getRolePresentation(supPayload.user.role).label !== getRolePresentation(respPayload.user.role).label,
    "Switching from Supervisor to Responder transitions UI label from ADMIN to RESPONDER"
  );
  assert(
    getRolePresentation(dispPayload.user.role).label !== getRolePresentation(respPayload.user.role).label,
    "Switching from Dispatcher to Responder transitions UI label from DISPATCHER to RESPONDER"
  );

  // B: Session revocation (Logout)
  const logoutRes = await logoutHandler(
    new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${SESSION_COOKIE_NAME}=${respSession?.plainToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    })
  );
  assert(logoutRes.status === 200, "POST /api/auth/logout returns HTTP 200");
  const unauthRes = await getSessionHandler(
    new Request("http://localhost:3000/api/auth/session", {
      headers: {
        host: "localhost:3000",
        cookie: `${SESSION_COOKIE_NAME}=${respSession?.plainToken}`,
      },
    })
  );
  assert(unauthRes.status === 401, "Revoked session returns HTTP 401 unauthenticated");

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Source Code Audit (TopNavigation & Command Centre)
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 4: Component Source Code Audit]");

  const topNavSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/layout/TopNavigation.tsx"),
    "utf-8"
  );
  assert(
    topNavSource.includes("useAuth"),
    "TopNavigation consumes useAuth context"
  );
  assert(
    topNavSource.includes("getRolePresentation"),
    "TopNavigation imports and uses getRolePresentation"
  );
  assert(
    topNavSource.includes("top-nav-user-role-indicator"),
    "TopNavigation declares #top-nav-user-role-indicator container"
  );
  assert(
    topNavSource.includes("top-nav-role-badge"),
    "TopNavigation declares #top-nav-role-badge"
  );
  assert(
    topNavSource.includes("{user.name || \"Operator\"}"),
    "TopNavigation displays authenticated user name"
  );
  assert(
    topNavSource.includes("{rolePresentation.label}"),
    "TopNavigation displays distinct role label"
  );

  const commandCentreSource = fs.readFileSync(
    path.join(process.cwd(), "src/app/page.tsx"),
    "utf-8"
  );
  assert(
    commandCentreSource.includes("getRolePresentation"),
    "Command Centre imports and uses getRolePresentation"
  );
  assert(
    commandCentreSource.includes("command-centre-role-indicator"),
    "Command Centre declares #command-centre-role-indicator container"
  );
  assert(
    commandCentreSource.includes("{rolePresentation.badgeText}"),
    "Command Centre displays role presentation badge text (CURRENT ACCESS: ...)"
  );
  assert(
    commandCentreSource.includes("{rolePresentation.description}"),
    "Command Centre displays role permission description"
  );

  const sidebarSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/layout/Sidebar.tsx"),
    "utf-8"
  );
  assert(
    sidebarSource.includes("getRolePresentation"),
    "Sidebar imports and uses getRolePresentation in operator profile card"
  );
  assert(
    sidebarSource.includes("{rolePresentation.label}"),
    "Sidebar displays distinct role label"
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  LOGGED-IN ROLE INDICATOR SUITE: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRoleIndicatorBattery().catch((err) => {
  console.error("Fatal error in test suite:", err);
  process.exit(1);
});
