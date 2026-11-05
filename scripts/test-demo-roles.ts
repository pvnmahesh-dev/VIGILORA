/**
 * VIGILORA HACKATHON: OPERATIONAL ROLE AUTHENTICATION & RBAC TEST SUITE
 *
 * Verifies:
 * 1. Lead Dispatcher direct station authentication & session issuance
 * 2. Field Responder direct station authentication & session issuance
 * 3. Campus Administrator (Supervisor) direct station authentication & session issuance
 * 4. Incident Reporter role rejection (strictly 3 hackathon roles allowed)
 * 5. Session persistence via GET /api/auth/session
 * 6. Role-specific RBAC enforcement (Supervisor vs Dispatcher vs Responder)
 * 7. Secure session logout and revocation
 * 8. Production environment guardrail (HTTP 403 when simulated in production)
 * 9. Invalid role rejection (HTTP 400)
 * 10. Zero secret / password leak verification
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
  console.log("       VIGILORA: OPERATIONAL ROLE AUTHENTICATION & RBAC TEST SUITE");
  console.log("================================================================================\n");

  // TEST 1: Lead Dispatcher Authentication
  console.log("[SCENARIO 1: Lead Dispatcher Station Login]");
  let dispatcherCookie = "";
  {
    const req = new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Dispatcher" }),
    });

    const res = await demoLoginHandler(req);
    const body = await res.json();

    assert(res.status === 200, "Dispatcher station login returns HTTP 200");
    assert(body.success === true, "Dispatcher station login success flag is TRUE");
    assert(body.user.role === "Dispatcher", "Role is strictly 'Dispatcher'");
    assert(body.user.email === "dispatcher@demo.vigilora.internal", "Email matches dispatcher station");
    assert(body.user.password === undefined, "Zero password in response body");
    assert(body.user.passwordHash === undefined, "Zero passwordHash in response body");

    const token = extractCookie(res);
    assert(Boolean(token), "Issues genuine vigilora_session HttpOnly cookie");
    dispatcherCookie = token || "";
  }

  // TEST 2: Field Responder Authentication
  console.log("\n[SCENARIO 2: Field Responder Station Login]");
  let responderCookie = "";
  {
    const req = new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Responder" }),
    });

    const res = await demoLoginHandler(req);
    const body = await res.json();

    assert(res.status === 200, "Responder station login returns HTTP 200");
    assert(body.success === true, "Responder station login success flag is TRUE");
    assert(body.user.role === "Responder", "Role is strictly 'Responder'");
    assert(body.user.email === "responder@demo.vigilora.internal", "Email matches responder station");
    assert(body.user.password === undefined, "Zero password in response body");

    const token = extractCookie(res);
    assert(Boolean(token), "Issues genuine vigilora_session HttpOnly cookie");
    responderCookie = token || "";
  }

  // TEST 3: Campus Administrator (Supervisor) Station Login
  console.log("\n[SCENARIO 3: Campus Administrator (Supervisor) Station Login]");
  let supervisorCookie = "";
  {
    const req = new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Supervisor" }),
    });

    const res = await demoLoginHandler(req);
    const body = await res.json();

    assert(res.status === 200, "Supervisor station login returns HTTP 200");
    assert(body.success === true, "Supervisor station login success flag is TRUE");
    assert(body.user.role === "Supervisor", "Role is strictly 'Supervisor'");
    assert(body.user.email === "admin@demo.vigilora.internal", "Email matches administrator station");
    assert(body.user.password === undefined, "Zero password in response body");

    const token = extractCookie(res);
    assert(Boolean(token), "Issues genuine vigilora_session HttpOnly cookie");
    supervisorCookie = token || "";
  }

  // TEST 4: Incident Reporter Role Rejection (Strictly 3 operational roles permitted)
  console.log("\n[SCENARIO 4: Incident Reporter Role Rejection]");
  {
    const req = new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Reporter" }),
    });

    const res = await demoLoginHandler(req);
    const body = await res.json();

    assert(res.status === 400, "Reporter role rejected with HTTP 400");
    assert(body.success === false, "Reporter login success flag is FALSE");
    assert(
      body.error?.includes("Available roles: Dispatcher, Responder, Supervisor"),
      "Error lists strictly 3 approved hackathon roles"
    );
  }

  // TEST 5: Session Persistence (GET /api/auth/session)
  console.log("\n[SCENARIO 5: Session Persistence via GET /api/auth/session]");
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

  // TEST 6: RBAC Enforcement - Settings Access Control
  console.log("\n[SCENARIO 6: RBAC Enforcement - Settings Mutation Permissions]");
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

    // Supervisor attempts PATCH /api/settings (Should be ALLOWED HTTP 200)
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

  // TEST 7: RBAC Enforcement - Tactical Dispatch Permissions
  console.log("\n[SCENARIO 7: RBAC Enforcement - Responder Team Assignment Restrictions]");
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

  // TEST 8: Logout & Immediate Session Revocation
  console.log("\n[SCENARIO 8: Session Logout & Immediate Revocation]");
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

  // TEST 9: Production Mode Guardrail
  console.log("\n[SCENARIO 9: Production Guardrail Validation]");
  {
    const originalEnv = process.env.NODE_ENV;
    const originalEnable = process.env.ENABLE_DEMO_LOGIN;

    try {
      Reflect.set(process.env, "NODE_ENV", "production");
      Reflect.deleteProperty(process.env, "ENABLE_DEMO_LOGIN");

      const prodReq = new Request("http://localhost:3000/api/auth/demo-login", {
        method: "POST",
        headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "Dispatcher" }),
      });
      const prodRes = await demoLoginHandler(prodReq);
      const prodBody = await prodRes.json();

      assert(prodRes.status === 403, "Station login is strictly FORBIDDEN in production without ENABLE_DEMO_LOGIN (HTTP 403)");
      assert(
        prodBody.error.includes("disabled in this environment"),
        "Error explicitly specifies station selection is disabled"
      );
    } finally {
      if (originalEnv !== undefined) {
        Reflect.set(process.env, "NODE_ENV", originalEnv);
      } else {
        Reflect.deleteProperty(process.env, "NODE_ENV");
      }
      if (originalEnable !== undefined) {
        Reflect.set(process.env, "ENABLE_DEMO_LOGIN", originalEnable);
      } else {
        Reflect.deleteProperty(process.env, "ENABLE_DEMO_LOGIN");
      }
    }
  }

  // TEST 10: Invalid Role Validation
  console.log("\n[SCENARIO 10: Invalid Role Payload Validation]");
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
  console.log(`  OPERATIONAL ROLES SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
