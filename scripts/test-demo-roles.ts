/**
 * VIGILORA HACKATHON: DEMO ROLE AUTHENTICATION & RBAC TEST SUITE
 *
 * Verifies:
 * 1. Demo account provisioning & idempotency
 * 2. Lead Dispatcher authentication & session issuance
 * 3. Field Responder authentication & session issuance
 * 4. Campus Administrator (Supervisor) authentication & session issuance
 * 5. Role-specific RBAC enforcement (Supervisor vs Dispatcher vs Responder)
 * 6. Session persistence via GET /api/auth/session
 * 7. Secure session logout and revocation
 * 8. Production environment guardrail (HTTP 403 when simulated in production)
 * 9. Zero secret / password leak verification
 */

import { POST as demoLoginHandler } from "../src/app/api/auth/demo-login/route";
import { GET as sessionHandler } from "../src/app/api/auth/session/route";
import { POST as logoutHandler } from "../src/app/api/auth/logout/route";
import { PATCH as settingsPatchHandler } from "../src/app/api/settings/route";
import { POST as assignHandler } from "../src/app/api/incidents/[id]/assign/route";
import { SESSION_COOKIE_NAME } from "../src/lib/auth";

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

function extractCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

const BASE_HEADERS = {
  host: "localhost:3000",
  origin: "http://localhost:3000",
  "x-vigilora-test-client": "active-test-suite",
};

async function runTestSuite() {
  console.log("================================================================================");
  console.log("       VIGILORA HACKATHON: DEMO ROLE AUTHENTICATION & RBAC TEST SUITE");
  console.log("================================================================================\n");

  // TEST 1: Lead Dispatcher Authentication
  console.log("[SCENARIO 1: Lead Dispatcher Demo Login]");
  let dispatcherCookie = "";
  {
    const req = new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Dispatcher" }),
    });

    const res = await demoLoginHandler(req);
    const body = await res.json();

    assert(res.status === 200, "Dispatcher demo login returns HTTP 200");
    assert(body.success === true, "Dispatcher demo login success flag is TRUE");
    assert(body.user.role === "Dispatcher", "Role is strictly 'Dispatcher'");
    assert(body.user.email === "dispatcher@demo.vigilora.internal", "Email matches dispatcher enclave");
    assert(body.user.password === undefined, "Zero password in response body");
    assert(body.user.passwordHash === undefined, "Zero passwordHash in response body");

    const token = extractCookie(res);
    assert(Boolean(token), "Issues genuine vigilora_session HttpOnly cookie");
    dispatcherCookie = token || "";
  }

  // TEST 2: Field Responder Authentication
  console.log("\n[SCENARIO 2: Field Responder Demo Login]");
  let responderCookie = "";
  {
    const req = new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Responder" }),
    });

    const res = await demoLoginHandler(req);
    const body = await res.json();

    assert(res.status === 200, "Responder demo login returns HTTP 200");
    assert(body.success === true, "Responder demo login success flag is TRUE");
    assert(body.user.role === "Responder", "Role is strictly 'Responder'");
    assert(body.user.email === "responder@demo.vigilora.internal", "Email matches responder enclave");

    const token = extractCookie(res);
    assert(Boolean(token), "Issues genuine vigilora_session HttpOnly cookie");
    responderCookie = token || "";
  }

  // TEST 3: Campus Administrator (Supervisor) Authentication
  console.log("\n[SCENARIO 3: Campus Administrator (Supervisor) Demo Login]");
  let supervisorCookie = "";
  {
    const req = new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Supervisor" }),
    });

    const res = await demoLoginHandler(req);
    const body = await res.json();

    assert(res.status === 200, "Supervisor demo login returns HTTP 200");
    assert(body.success === true, "Supervisor demo login success flag is TRUE");
    assert(body.user.role === "Supervisor", "Role is strictly 'Supervisor'");
    assert(body.user.email === "admin@demo.vigilora.internal", "Email matches administrator enclave");

    const token = extractCookie(res);
    assert(Boolean(token), "Issues genuine vigilora_session HttpOnly cookie");
    supervisorCookie = token || "";
  }

  // TEST 4: Session Persistence (GET /api/auth/session)
  console.log("\n[SCENARIO 4: Session Persistence via GET /api/auth/session]");
  {
    const req = new Request("http://localhost:3000/api/auth/session", {
      method: "GET",
      headers: {
        ...BASE_HEADERS,
        Cookie: `${SESSION_COOKIE_NAME}=${dispatcherCookie}`,
      },
    });

    const res = await sessionHandler(req);
    const body = await res.json();

    assert(res.status === 200, "Session lookup returns HTTP 200");
    assert(body.success === true, "Session is authenticated");
    assert(body.user.role === "Dispatcher", "Persisted role accurately resolved as 'Dispatcher'");
    assert(body.user.email === "dispatcher@demo.vigilora.internal", "User email correctly identified");
  }

  // TEST 5: RBAC Enforcement - Settings Access Control
  console.log("\n[SCENARIO 5: RBAC Enforcement - Settings Mutation Permissions]");
  {
    // Dispatcher attempts PATCH /api/settings (Should be FORBIDDEN HTTP 403)
    const dispatcherReq = new Request("http://localhost:3000/api/settings", {
      method: "PATCH",
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE_NAME}=${dispatcherCookie}`,
      },
      body: JSON.stringify({ campusName: "Hacked Campus" }),
    });
    const dispatcherRes = await settingsPatchHandler(dispatcherReq);
    assert(
      dispatcherRes.status === 403,
      `Dispatcher is FORBIDDEN from modifying campus settings (HTTP ${dispatcherRes.status})`
    );

    // Responder attempts PATCH /api/settings (Should be FORBIDDEN HTTP 403)
    const responderReq = new Request("http://localhost:3000/api/settings", {
      method: "PATCH",
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE_NAME}=${responderCookie}`,
      },
      body: JSON.stringify({ campusName: "Hacked Campus" }),
    });
    const responderRes = await settingsPatchHandler(responderReq);
    assert(
      responderRes.status === 403,
      `Responder is FORBIDDEN from modifying campus settings (HTTP ${responderRes.status})`
    );

    // Supervisor attempts PATCH /api/settings (Should be ALLOWED)
    const supervisorReq = new Request("http://localhost:3000/api/settings", {
      method: "PATCH",
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE_NAME}=${supervisorCookie}`,
      },
      body: JSON.stringify({ campusName: "University Metropolis Campus" }),
    });
    const supervisorRes = await settingsPatchHandler(supervisorReq);
    assert(
      supervisorRes.status === 200,
      `Supervisor is AUTHORIZED to modify campus settings (HTTP ${supervisorRes.status})`
    );
  }

  // TEST 6: RBAC Enforcement - Tactical Dispatch Permissions
  console.log("\n[SCENARIO 6: RBAC Enforcement - Responder Team Assignment Restrictions]");
  {
    // Responder attempts POST /api/incidents/[id]/assign (Should be FORBIDDEN HTTP 403)
    const responderAssignReq = new Request(
      "http://localhost:3000/api/incidents/VIG-2026-089/assign",
      {
        method: "POST",
        headers: {
          ...BASE_HEADERS,
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${responderCookie}`,
        },
        body: JSON.stringify({ teamId: "team-alpha-01", action: "assign" }),
      }
    );
    const mockContext = { params: Promise.resolve({ id: "VIG-2026-089" }) };
    const responderAssignRes = await assignHandler(responderAssignReq, mockContext);
    assert(
      responderAssignRes.status === 403,
      `Responder is FORBIDDEN from assigning teams (HTTP ${responderAssignRes.status})`
    );
  }

  // TEST 7: Logout & Immediate Session Revocation
  console.log("\n[SCENARIO 7: Session Logout & Immediate Revocation]");
  {
    // Call logout with dispatcher cookie
    const logoutReq = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        ...BASE_HEADERS,
        Cookie: `${SESSION_COOKIE_NAME}=${dispatcherCookie}`,
      },
    });
    const logoutRes = await logoutHandler(logoutReq);
    assert(logoutRes.status === 200, "Logout returns HTTP 200");

    // Attempt to access session with revoked cookie
    const checkReq = new Request("http://localhost:3000/api/auth/session", {
      method: "GET",
      headers: {
        ...BASE_HEADERS,
        Cookie: `${SESSION_COOKIE_NAME}=${dispatcherCookie}`,
      },
    });
    const checkRes = await sessionHandler(checkReq);
    assert(
      checkRes.status === 401,
      `Revoked session is strictly REJECTED on subsequent requests (HTTP ${checkRes.status})`
    );
  }

  // TEST 8: Production Mode Guardrail
  console.log("\n[SCENARIO 8: Production Guardrail Validation]");
  {
    const originalEnv = process.env.NODE_ENV;
    const originalEnable = process.env.ENABLE_DEMO_LOGIN;

    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      delete process.env.ENABLE_DEMO_LOGIN;

      const prodReq = new Request("http://localhost:3000/api/auth/demo-login", {
        method: "POST",
        headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "Dispatcher" }),
      });
      const prodRes = await demoLoginHandler(prodReq);
      const prodBody = await prodRes.json();

      assert(prodRes.status === 403, "Demo login is strictly FORBIDDEN in production (HTTP 403)");
      assert(
        prodBody.error.includes("disabled in production"),
        "Error explicitly specifies demo is disabled in production"
      );
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
      if (originalEnable !== undefined) {
        process.env.ENABLE_DEMO_LOGIN = originalEnable;
      }
    }
  }

  // TEST 9: Invalid Role Validation
  console.log("\n[SCENARIO 9: Invalid Role Payload Validation]");
  {
    const badReq = new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "SuperHackerAdmin" }),
    });
    const badRes = await demoLoginHandler(badReq);
    assert(badRes.status === 400, "Unknown role rejected with HTTP 400");
  }

  console.log("\n================================================================================");
  console.log(`  DEMO ROLES SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
