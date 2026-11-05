import fs from "fs";
import path from "path";
import {
  buildIncidentSummaryPdf,
  calculateResponseTelemetry,
  PDF_FILENAME,
} from "../src/lib/pdf-export";
import { Incident } from "../src/types/incident";
import { ResponseTeam } from "../src/types/team";
import { ActivityEvent } from "../src/types/incident";
import { authenticateUser, createSession, SESSION_COOKIE_NAME } from "../src/lib/auth";
import { GET as getIncidentsHandler } from "../src/app/api/incidents/route";
import { GET as getTeamsHandler } from "../src/app/api/teams/route";
import { GET as getActivitiesHandler } from "../src/app/api/activities/route";

const CREDENTIALS_FILE = path.join(process.cwd(), ".demo-credentials.json");

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function main() {
  console.log("================================================================================");
  console.log("       VIGILORA HACKATHON: ANALYTICS PDF EXPORT TEST SUITE");
  console.log("================================================================================\n");

  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error("[FATAL] .demo-credentials.json not found.");
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Authenticated API Session & Data Hydration
  // ---------------------------------------------------------------------------
  console.log("[SCENARIO 1: Authenticated API Hydration]");
  const dispCred = credentials["Dispatcher"];
  const dispAuth = await authenticateUser(dispCred.email, dispCred.password, "127.0.0.1");
  const dispSession = "user" in dispAuth ? await createSession(dispAuth.user) : null;
  assert(Boolean(dispSession?.plainToken), "Authenticated Lead Dispatcher session established");

  const sessionCookie = `${SESSION_COOKIE_NAME}=${dispSession?.plainToken}`;

  // 1. Fetch live incidents via API
  const incRes = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", {
      method: "GET",
      headers: {
        cookie: sessionCookie,
        host: "localhost:3000",
        "x-vigilora-test-client": "pdf-test-suite",
      },
    })
  );
  assert(incRes.status === 200, "GET /api/incidents returns HTTP 200");
  const incJson = await incRes.json();
  const liveIncidents = (incJson.data || []) as Incident[];
  assert(liveIncidents.length > 0, `Fetched ${liveIncidents.length} live incidents`);

  // 2. Fetch live teams via API
  const teamRes = await getTeamsHandler(
    new Request("http://localhost:3000/api/teams", {
      method: "GET",
      headers: {
        cookie: sessionCookie,
        host: "localhost:3000",
        "x-vigilora-test-client": "pdf-test-suite",
      },
    })
  );
  assert(teamRes.status === 200, "GET /api/teams returns HTTP 200");
  const teamJson = await teamRes.json();
  const liveTeams = (teamJson.data || []) as ResponseTeam[];
  assert(liveTeams.length > 0, `Fetched ${liveTeams.length} live response teams`);

  // 3. Fetch live activities via API
  const actRes = await getActivitiesHandler(
    new Request("http://localhost:3000/api/activities?limit=50", {
      method: "GET",
      headers: {
        cookie: sessionCookie,
        host: "localhost:3000",
        "x-vigilora-test-client": "pdf-test-suite",
      },
    })
  );
  assert(actRes.status === 200, "GET /api/activities returns HTTP 200");
  const actJson = await actRes.json();
  const liveActivities = (actJson.data || []) as ActivityEvent[];
  assert(Array.isArray(liveActivities), `Fetched ${liveActivities.length} live activity events`);

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Valid PDF Generation with Real Incident Telemetry
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 2: Valid PDF Generation with Real Telemetry]");

  const doc = buildIncidentSummaryPdf({
    incidents: liveIncidents,
    teams: liveTeams,
    activities: liveActivities,
    campusName: "University Metropolis Campus",
    compress: false, // uncompressed for direct string assertion verification
    operator: {
      name: "Lead Dispatcher",
      email: dispCred.email,
      role: "lead_dispatcher",
    },
  });

  const pdfArrayBuffer = doc.output("arraybuffer");
  const pdfBuffer = Buffer.from(pdfArrayBuffer);
  const pdfText = pdfBuffer.toString("latin1");

  assert(pdfBuffer.length > 4000, `PDF size is valid binary (${pdfBuffer.length} bytes > 4KB)`);
  assert(pdfText.startsWith("%PDF-"), `PDF magic header is valid (%PDF-1.3)`);
  assert(pdfText.includes("%%EOF"), `PDF ends with standard EOF marker`);

  // Verify VIGILORA Brand & Header Metadata
  assert(pdfText.includes("V I G I L O R A"), "PDF contains VIGILORA brand header");
  assert(pdfText.includes("EXECUTIVE OPERATIONAL SUMMARY"), "PDF contains Executive Summary heading");
  assert(pdfText.includes("DISPATCH VELOCITY & TELEMETRY AUDIT"), "PDF contains Telemetry Audit heading");
  assert(pdfText.includes("INSUFFICIENT VERIFIED RESPONSE DATA"), "PDF contains [INSUFFICIENT VERIFIED RESPONSE DATA] when only seed items exist");
  assert(pdfText.includes("calculated from genuine persisted incident records only"), "PDF contains strict telemetry audit rule explanation");
  assert(pdfText.includes("INCIDENT DISTRIBUTION BY CATEGORY & SECTOR"), "PDF contains Distribution heading");
  assert(pdfText.includes("VERIFIED CAMPUS INCIDENT MANIFEST"), "PDF contains Incident Manifest heading");
  assert(pdfText.includes("DEMONSTRATION REPORT"), "PDF explicitly labeled as DEMONSTRATION REPORT");

  // Verify Real Incident Data is present in PDF
  for (const inc of liveIncidents) {
    assert(pdfText.includes(inc.id), `PDF manifest includes Incident ID "${inc.id}"`);
    const firstWord = inc.title.split(" ")[0];
    assert(pdfText.includes(firstWord), `PDF manifest includes title keyword "${firstWord}"`);
    assert(pdfText.includes(inc.severity), `PDF manifest includes severity "${inc.severity}"`);
  }

  // Verify Page Numbers & Footer
  assert(pdfText.includes("Page 1 of"), "PDF contains dynamic page numbering");
  assert(pdfText.includes("VIGILORA Tactical Command System"), "PDF contains security enclave footer");

  // Save the production compressed PDF file for manual and judge inspection
  const compressedDoc = buildIncidentSummaryPdf({
    incidents: liveIncidents,
    teams: liveTeams,
    activities: liveActivities,
    campusName: "University Metropolis Campus",
    compress: true,
    operator: {
      name: "Lead Dispatcher",
      email: dispCred.email,
      role: "lead_dispatcher",
    },
  });
  const compressedBuffer = Buffer.from(compressedDoc.output("arraybuffer"));
  const outPath = path.join(process.cwd(), "public", "demo", PDF_FILENAME);
  fs.writeFileSync(outPath, compressedBuffer);
  assert(fs.existsSync(outPath), `Saved live PDF artifact to: ${outPath} (${compressedBuffer.length} bytes)`);

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Strict Response Time Telemetry Honesty
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 3: Response Time Telemetry Honesty Guardrails]");

  // A: Test when NO activity deltas exist
  const emptyTelemetry = calculateResponseTelemetry(liveIncidents, []);
  assert(emptyTelemetry.available === false, "Telemetry is FALSE when no activities exist");
  assert(emptyTelemetry.statusLabel === "INSUFFICIENT VERIFIED RESPONSE DATA", "Status label is 'INSUFFICIENT VERIFIED RESPONSE DATA'");
  assert(emptyTelemetry.sampleSize === 0, "Sample size is 0 when no activities exist");
  assert(emptyTelemetry.meanMinutes === null, "meanMinutes is strictly null when no activities exist");

  // B: Test that baseline seed incidents are strictly excluded from live telemetry
  const seedTelemetry = calculateResponseTelemetry(liveIncidents, liveActivities);
  assert(seedTelemetry.available === false, "Live seed incidents alone yield available: false");
  assert(seedTelemetry.statusLabel === "INSUFFICIENT VERIFIED RESPONSE DATA", "Live seed incidents yield 'INSUFFICIENT VERIFIED RESPONSE DATA'");
  assert(seedTelemetry.eligibleCount === 0, "Live seed incidents yield eligibleCount: 0");

  // C: Test when verified genuine incident and dispatch events DO exist
  const genuineIncident: Incident = {
    id: "VIG-2026-801",
    title: "Structural water pipe leak in research annex",
    description: "Main pipe ruptured causing localized corridor flooding.",
    category: "Infrastructure",
    severity: "High",
    status: "Responding",
    location: { zone: "North STEM Quad", building: "Curie Engineering Hall" },
    reportedAt: "2026-11-05T08:00:00.000Z",
    updatedAt: "2026-11-05T08:03:00.000Z",
    reporterContact: "lab.director@metropolis.edu",
    isCustomReported: true,
  };

  const genuineActivities: ActivityEvent[] = [
    {
      id: "act-real-1",
      incidentId: "VIG-2026-801",
      incidentTitle: genuineIncident.title,
      action: "Dispatched Facilities Unit to scene",
      actor: "Lead Dispatcher Austin",
      actorRole: "Dispatcher",
      timestamp: "2026-11-05T08:03:00.000Z", // exactly 3.0 min later
      severity: "High",
      type: "dispatch",
    },
  ];

  const calculatedTelemetry = calculateResponseTelemetry([genuineIncident], genuineActivities);
  assert(calculatedTelemetry.available === true, "Telemetry is TRUE when verified genuine dispatch events exist");
  assert(calculatedTelemetry.meanMinutes === 3, "Calculated mean response time is exactly 3.0 minutes");
  assert(calculatedTelemetry.eligibleCount === 1, "Eligible count is exactly 1 verified event");
  assert(calculatedTelemetry.statusLabel === "VERIFIED DISPATCH TELEMETRY", "Status label is 'VERIFIED DISPATCH TELEMETRY'");

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Empty Data Graceful Handling
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 4: Empty Data Graceful Handling]");

  const emptyDoc = buildIncidentSummaryPdf({
    incidents: [],
    teams: [],
    activities: [],
    campusName: "University Metropolis Campus",
  });

  const emptyBuffer = Buffer.from(emptyDoc.output("arraybuffer"));
  const emptyText = emptyBuffer.toString("latin1");

  assert(emptyBuffer.length > 2000, "Empty incident list generates valid PDF binary");
  assert(emptyText.startsWith("%PDF-"), "Empty PDF starts with valid %PDF- magic header");
  assert(emptyDoc.getNumberOfPages() >= 1, "Empty incident list renders at least 1 page");

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Security & Secret Sanitization
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 5: Security & Credential Protection]");

  assert(!pdfText.includes(dispCred.password), "PDF never exposes user passwords");
  assert(!pdfText.includes("AWS_SECRET_ACCESS_KEY"), "PDF never exposes AWS secret keys");
  if (dispSession?.plainToken) {
    assert(!pdfText.includes(dispSession.plainToken), "PDF never exposes plain session tokens");
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  PDF EXPORT SUITE: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
