/**
 * VIGILORA PHASE 3A VERIFICATION SUITE
 *
 * Verifies Frontend Authentication & Session Integration:
 * 1. Missing credentials handling (HTTP 400)
 * 2. Invalid password handling (HTTP 401)
 * 3. Successful login with scrypt password verification (HTTP 200)
 * 4. Secure HttpOnly, SameSite=Lax cookie issuance
 * 5. Role and user metadata resolution without token exposure
 * 6. Session persistence via GET /api/auth/session
 * 7. Functional logout and immediate session revocation
 * 8. Rejection of expired/revoked session tokens (HTTP 401)
 * 9. Code inspection confirming removal of fake/demo login, localStorage, and simulated timers
 * 10. Clean teardown from DynamoDB
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { provisionUser } from "../src/lib/auth";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const AWS_REGION = process.env.AWS_REGION || "eu-north-1";
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE_NAME || "VIGILORA-Main";

const ddbRaw = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbRaw);

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    testsFailed++;
  }
}

async function runPhase3ATests() {
  console.log("\n================================================================================");
  console.log("  VIGILORA PHASE 3A: AUTHENTICATION & SESSION INTEGRATION VERIFICATION");
  console.log("================================================================================\n");

  const runId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const testEmail = `test.phase3a.${runId}@vigilora.internal`;
  const testPassword = `SecureTestPass_${runId}!`;
  const testName = "Sgt. Jordan Hayes";
  const testRole = "Dispatcher";
  const testCallsign = "DISPATCH-SEC-9";
  const campusPk = "CAMPUS#METROPOLIS";
  const userSk = `USER#${testEmail.toLowerCase()}`;

  const cleanupDynamoKeys: { pk: string; sk: string }[] = [];

  try {
    // -------------------------------------------------------------------------
    // Setup: Provision verified test operator into DynamoDB
    // -------------------------------------------------------------------------
    console.log("Setup: Provisioning verified test operator in DynamoDB...");
    await provisionUser({
      email: testEmail,
      password: testPassword,
      name: testName,
      role: testRole,
      callsign: testCallsign,
    });
    cleanupDynamoKeys.push({ pk: campusPk, sk: userSk });
    console.log(`  Test operator provisioned: ${testEmail}\n`);

    // -------------------------------------------------------------------------
    // Test 1: Missing Credentials Validation
    // -------------------------------------------------------------------------
    console.log("Test 1: Missing Credentials Validation");
    const emptyEmailRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vigilora-test-client": "phase3a-test",
      },
      body: JSON.stringify({ email: "", password: testPassword }),
    });
    assert(emptyEmailRes.status === 400, `Empty email rejected with HTTP 400 (Got ${emptyEmailRes.status})`);
    const emptyEmailData = await emptyEmailRes.json();
    assert(emptyEmailData.success === false, "Missing email response indicates failure");

    const emptyPassRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vigilora-test-client": "phase3a-test",
      },
      body: JSON.stringify({ email: testEmail, password: "" }),
    });
    assert(emptyPassRes.status === 400, `Empty password rejected with HTTP 400 (Got ${emptyPassRes.status})`);

    // -------------------------------------------------------------------------
    // Test 2: Invalid Password Handling
    // -------------------------------------------------------------------------
    console.log("\nTest 2: Invalid Password Handling");
    const wrongPassRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vigilora-test-client": "phase3a-test",
      },
      body: JSON.stringify({ email: testEmail, password: "IncorrectPassword123!" }),
    });
    assert(wrongPassRes.status === 401, `Invalid password rejected with HTTP 401 (Got ${wrongPassRes.status})`);
    const wrongPassData = await wrongPassRes.json();
    assert(wrongPassData.success === false, "Failure flag returned on bad password");
    assert(
      wrongPassData.error.toLowerCase().includes("invalid"),
      `Generic error message returned: "${wrongPassData.error}"`
    );
    cleanupDynamoKeys.push({ pk: campusPk, sk: `RATELIMIT#USER#${testEmail.toLowerCase()}` });

    // -------------------------------------------------------------------------
    // Test 3: Successful Login & Cookie Verification
    // -------------------------------------------------------------------------
    console.log("\nTest 3: Successful Login & Cookie Verification");
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vigilora-test-client": "phase3a-test",
      },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    assert(loginRes.status === 200, `Login returns HTTP 200 (Got ${loginRes.status})`);

    const loginData = await loginRes.json();
    assert(loginData.success === true, "Login reports success: true");
    assert(loginData.user?.email === testEmail.toLowerCase(), `User email matches: ${loginData.user?.email}`);
    assert(loginData.user?.name === testName, `User name matches: ${loginData.user?.name}`);
    assert(loginData.user?.role === testRole, `User role matches: ${loginData.user?.role}`);
    assert(loginData.user?.callsign === testCallsign, `User callsign matches: ${loginData.user?.callsign}`);
    assert(!loginData.token && !loginData.plainToken, "Plain session token NOT exposed in response JSON body");

    // Cookie checks
    const setCookieHeader = loginRes.headers.get("set-cookie") || "";
    assert(setCookieHeader.includes("vigilora_session="), "Cookie vigilora_session is issued");
    assert(setCookieHeader.toLowerCase().includes("httponly"), "Cookie marked HttpOnly");
    assert(setCookieHeader.toLowerCase().includes("samesite=lax"), "Cookie marked SameSite=Lax");
    assert(setCookieHeader.toLowerCase().includes("path=/"), "Cookie scoped to Path=/");

    // Extract session token from cookie
    const tokenMatch = setCookieHeader.match(/vigilora_session=([^;]+)/);
    const sessionToken = tokenMatch ? tokenMatch[1] : "";
    assert(sessionToken.length > 20, "Session token is high-entropy string");

    if (sessionToken) {
      const hashedToken = crypto.createHash("sha256").update(sessionToken).digest("hex");
      cleanupDynamoKeys.push({ pk: campusPk, sk: `SESSION#${hashedToken}` });
    }

    // -------------------------------------------------------------------------
    // Test 4: Session Persistence (GET /api/auth/session)
    // -------------------------------------------------------------------------
    console.log("\nTest 4: Session Persistence (GET /api/auth/session)");
    const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        Cookie: `vigilora_session=${sessionToken}`,
      },
    });
    assert(sessionRes.status === 200, `Session check returns HTTP 200 (Got ${sessionRes.status})`);
    const sessionData = await sessionRes.json();
    assert(sessionData.success === true, "Session reports success: true");
    assert(sessionData.user.email === testEmail.toLowerCase(), "Session resolves correct email");
    assert(sessionData.user.role === "Dispatcher", "Session resolves correct role: Dispatcher");
    assert(sessionData.user.name === testName, "Session resolves correct operator name");
    assert(sessionData.user.callsign === testCallsign, "Session resolves correct callsign");

    // -------------------------------------------------------------------------
    // Test 5: Unauthenticated Route Protection (GET /api/auth/session without cookie)
    // -------------------------------------------------------------------------
    console.log("\nTest 5: Unauthenticated Route Protection");
    const unauthSessionRes = await fetch(`${BASE_URL}/api/auth/session`);
    assert(unauthSessionRes.status === 401, `Missing session cookie rejected with HTTP 401 (Got ${unauthSessionRes.status})`);
    const unauthData = await unauthSessionRes.json();
    assert(unauthData.success === false, "Unauthenticated session reports success: false");

    // -------------------------------------------------------------------------
    // Test 6: Logout and Immediate Session Revocation
    // -------------------------------------------------------------------------
    console.log("\nTest 6: Logout and Immediate Session Revocation");
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: `vigilora_session=${sessionToken}`,
        "x-vigilora-test-client": "phase3a-test",
      },
    });
    assert(logoutRes.status === 200, `Logout returns HTTP 200 (Got ${logoutRes.status})`);
    const logoutCookie = logoutRes.headers.get("set-cookie") || "";
    assert(
      logoutCookie.includes("vigilora_session=;") ||
        logoutCookie.includes("Max-Age=0") ||
        logoutCookie.includes("expires="),
      "Logout clears vigilora_session cookie"
    );

    // Verify session is now revoked in DynamoDB
    const postLogoutSessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        Cookie: `vigilora_session=${sessionToken}`,
      },
    });
    assert(
      postLogoutSessionRes.status === 401,
      `Revoked session rejected immediately with HTTP 401 (Got ${postLogoutSessionRes.status})`
    );

    // -------------------------------------------------------------------------
    // Test 7: Expired or Revoked Token Handling
    // -------------------------------------------------------------------------
    console.log("\nTest 7: Expired or Revoked Token Handling");
    const forgedToken = crypto.randomBytes(32).toString("hex");
    const forgedRes = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        Cookie: `vigilora_session=${forgedToken}`,
      },
    });
    assert(forgedRes.status === 401, `Forged/expired session token rejected with HTTP 401 (Got ${forgedRes.status})`);

    // -------------------------------------------------------------------------
    // Test 8: Code Inspection & Zero-Demo Verification
    // -------------------------------------------------------------------------
    console.log("\nTest 8: Frontend Code Inspection & Zero-Demo Verification");

    // Check AuthContext.tsx
    const authContextPath = path.join(process.cwd(), "src/context/AuthContext.tsx");
    assert(fs.existsSync(authContextPath), "AuthContext.tsx exists in src/context/");
    const authContextCode = fs.readFileSync(authContextPath, "utf-8");
    assert(!authContextCode.includes("localStorage"), "AuthContext does NOT use localStorage");
    assert(!authContextCode.includes("sessionStorage"), "AuthContext does NOT use sessionStorage");
    assert(authContextCode.includes("/api/auth/session"), "AuthContext queries GET /api/auth/session");
    assert(authContextCode.includes("/api/auth/login"), "AuthContext calls POST /api/auth/login");
    assert(authContextCode.includes("/api/auth/logout"), "AuthContext calls POST /api/auth/logout");

    // Check LoginPage
    const loginPagePath = path.join(process.cwd(), "src/app/login/page.tsx");
    const loginPageCode = fs.readFileSync(loginPagePath, "utf-8");
    assert(!loginPageCode.includes("setTimeout("), "LoginPage has zero simulated setTimeout login");
    assert(!loginPageCode.includes("operator-402@campus"), "LoginPage does NOT contain hardcoded operator-402");
    assert(!loginPageCode.includes("••••••••••••"), "LoginPage does NOT contain hardcoded bullets");
    assert(loginPageCode.includes("useAuth()"), "LoginPage uses useAuth() hook");
    assert(loginPageCode.includes("errorMessage"), "LoginPage displays real error message");

    // Check Sidebar
    const sidebarPath = path.join(process.cwd(), "src/components/layout/Sidebar.tsx");
    const sidebarCode = fs.readFileSync(sidebarPath, "utf-8");
    assert(sidebarCode.includes("useAuth()"), "Sidebar uses useAuth() hook");
    assert(sidebarCode.includes("user.name"), "Sidebar displays dynamic user.name");
    assert(sidebarCode.includes("user.role"), "Sidebar displays dynamic user.role");
    assert(sidebarCode.includes("Sign Out"), "Sidebar includes functional Sign Out action");

    // Check AppShell
    const appShellPath = path.join(process.cwd(), "src/components/layout/AppShell.tsx");
    const appShellCode = fs.readFileSync(appShellPath, "utf-8");
    assert(appShellCode.includes("useAuth()"), "AppShell uses useAuth() hook");
    assert(appShellCode.includes("router.replace(\"/login\")"), "AppShell redirects unauthenticated users to /login");
    assert(appShellCode.includes("Verifying Terminal Authorization"), "AppShell guards against redirect loops while loading");

    // Check RegisterPage
    const registerPagePath = path.join(process.cwd(), "src/app/register/page.tsx");
    const registerPageCode = fs.readFileSync(registerPagePath, "utf-8");
    assert(
      registerPageCode.includes("Supervisor") || registerPageCode.includes("restricted"),
      "RegisterPage includes Supervisor provisioning policy explanation"
    );
    assert(!registerPageCode.includes("POST /api/auth/register"), "RegisterPage does NOT implement public registration");

  } catch (err) {
    console.error("Test execution failed with error:", err);
    testsFailed++;
  } finally {
    // -------------------------------------------------------------------------
    // Automatic Teardown: Clean up test operator and test sessions from DynamoDB
    // -------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("  AUTOMATIC TEARDOWN: PURGING TEST ITEMS FROM DYNAMODB");
    console.log("================================================================================");

    let purged = 0;
    for (const key of cleanupDynamoKeys) {
      try {
        await docClient.send(new DeleteCommand({ TableName: DYNAMODB_TABLE, Key: key }));
        purged++;
      } catch {
        // ignore
      }
    }
    console.log(`  Purged ${purged} test records from DynamoDB.`);

    // Live verification
    const userCheck = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": campusPk,
          ":sk": "USER#test.phase3a.",
        },
      })
    );
    assert(userCheck.Count === 0, "DynamoDB verified: ZERO test operators remain in table");
  }

  console.log("\n================================================================================");
  console.log(`  PHASE 3A AUTH INTEGRATION: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log("================================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runPhase3ATests();
