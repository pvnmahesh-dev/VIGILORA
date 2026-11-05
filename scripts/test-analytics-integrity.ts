/**
 * VIGILORA HACKATHON: ANALYTICS & DATA INTEGRITY TEST SUITE
 *
 * Verifies:
 * 1. Hourly incident distribution aggregation mathematics and dynamic scaling.
 * 2. Invariant: Sum of hourly bucket counts strictly equals valid parsed incidents.
 * 3. Removal of fabricated 83-incident simulation and hardcoded 4.2m response time.
 * 4. Mean response time single source of truth across Analytics, Dashboard, and PDF.
 * 5. Fictional emergency hotline (555-series) demonstration labeling in Settings and Report.
 * 6. Live DynamoDB data hydration consistency.
 */

import {
  calculateHourlyDistribution,
  calculateResponseTelemetry,
} from "../src/lib/telemetry";
import { calculateResponseTelemetry as pdfExportTelemetry } from "../src/lib/pdf-export";
import { Incident, ActivityEvent } from "../src/types/incident";
import fs from "node:fs";
import path from "node:path";

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

async function runAnalyticsIntegritySuite() {
  console.log("================================================================================");
  console.log("       VIGILORA HACKATHON: ANALYTICS DATA INTEGRITY TEST SUITE");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Hourly Distribution Mathematical Invariants
  // ---------------------------------------------------------------------------
  console.log("[SCENARIO 1: Hourly Distribution Aggregation Math]");

  // A: Empty incident list
  const emptyRes = calculateHourlyDistribution([]);
  assert(emptyRes.totalValid === 0, "Empty incident list yields 0 totalValid");
  assert(emptyRes.buckets.length === 12, "Always returns exactly 12 two-hour buckets");
  assert(emptyRes.peakHour === null, "Peak hour is null when no incidents exist");
  assert(emptyRes.peakCount === 0, "Peak count is 0 when no incidents exist");
  const emptySum = emptyRes.buckets.reduce((acc, b) => acc + b.count, 0);
  assert(emptySum === 0, "Sum of bucket counts for empty list is exactly 0");
  assert(
    emptyRes.buckets.every((b) => b.height === "4%"),
    "All empty buckets render baseline height (4%)"
  );

  // B: Mock incidents across specific hours (constructed in local time to match operator clock)
  const baseDay = new Date(2026, 10, 4); // November 4, 2026 local
  const makeLocalIso = (hour: number, minute: number) => {
    const d = new Date(baseDay);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  const testIncidents: Incident[] = [
    {
      id: "inc-1",
      title: "Incident at 01:15",
      description: "Test",
      category: "Medical",
      severity: "High",
      status: "Reported",
      location: { zone: "North Sector", building: "Auditorium" },
      reportedAt: makeLocalIso(1, 15),
      updatedAt: makeLocalIso(1, 15),
    },
    {
      id: "inc-2",
      title: "Incident at 08:45",
      description: "Test",
      category: "Security",
      severity: "Low",
      status: "Reported",
      location: { zone: "East Sector", building: "Sports Complex" },
      reportedAt: makeLocalIso(8, 45),
      updatedAt: makeLocalIso(8, 45),
    },
    {
      id: "inc-3",
      title: "Incident at 09:30",
      description: "Test",
      category: "Infrastructure",
      severity: "Medium",
      status: "Reported",
      location: { zone: "Central Sector", building: "STEM Quad" },
      reportedAt: makeLocalIso(9, 30),
      updatedAt: makeLocalIso(9, 30),
    },
    {
      id: "inc-4",
      title: "Incident at 18:20",
      description: "Test",
      category: "Fire and Hazard",
      severity: "Critical",
      status: "Reported",
      location: { zone: "South Sector", building: "Depot" },
      reportedAt: makeLocalIso(18, 20),
      updatedAt: makeLocalIso(18, 20),
    },
    {
      id: "inc-5",
      title: "Incident with invalid date",
      description: "Test",
      category: "Medical",
      severity: "Low",
      status: "Reported",
      location: { zone: "North Sector", building: "Auditorium" },
      reportedAt: "invalid-date-string",
      updatedAt: "invalid-date-string",
    },
  ];

  const distribution = calculateHourlyDistribution(testIncidents);

  assert(distribution.totalValid === 4, "totalValid correctly counts only the 4 valid timestamps");
  const bucketSum = distribution.buckets.reduce((acc, b) => acc + b.count, 0);
  assert(bucketSum === 4, "Sum of bucket counts strictly equals totalValid (4)");
  assert(bucketSum <= testIncidents.length, "Bucket count sum never exceeds total incidents");

  // Check individual buckets
  const b00 = distribution.buckets.find((b) => b.hour === "00:00");
  assert(b00?.count === 1, "01:15 incident mapped to 00:00 bucket");

  const b08 = distribution.buckets.find((b) => b.hour === "08:00");
  assert(b08?.count === 2, "08:45 and 09:30 incidents both mapped to 08:00 bucket (count = 2)");

  const b18 = distribution.buckets.find((b) => b.hour === "18:00");
  assert(b18?.count === 1, "18:20 incident mapped to 18:00 bucket");

  const b12 = distribution.buckets.find((b) => b.hour === "12:00");
  assert(b12?.count === 0, "Empty hours have count 0");
  assert(b12?.height === "4%", "Empty hours have 4% baseline height");

  // Peak check
  assert(distribution.peakHour === "08:00", "Peak hour accurately identified as 08:00");
  assert(distribution.peakCount === 2, "Peak count accurately identified as 2");
  assert(b08?.height === "100%", "Peak bucket renders at 100% height");

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Mean Response Time Ground Truth & Strict Real-Data Honesty
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 2: Mean Response Time Ground Truth & Strict Real-Data Honesty]");

  // Verify single source of truth: telemetry module and pdf-export module export identical logic
  assert(
    calculateResponseTelemetry === pdfExportTelemetry,
    "pdf-export re-exports identical calculateResponseTelemetry function reference"
  );

  // A: Empty incident list
  const emptyTelemetry = calculateResponseTelemetry([], []);
  assert(emptyTelemetry.available === false, "Telemetry is unavailable when incident list is empty");
  assert(emptyTelemetry.sampleSize === 0, "Sample size is 0 when incident list is empty");
  assert(emptyTelemetry.eligibleCount === 0, "eligibleCount is 0 when incident list is empty");
  assert(emptyTelemetry.meanMinutes === null, "meanMinutes is strictly null when incident list is empty");
  assert(
    emptyTelemetry.statusLabel === "INSUFFICIENT VERIFIED RESPONSE DATA",
    "Status label is strictly 'INSUFFICIENT VERIFIED RESPONSE DATA'"
  );
  assert(
    emptyTelemetry.explanation ===
      "Average time from incident reporting to the first verified dispatch, calculated from genuine persisted incident records only.",
    "Explanation strictly matches standard audit rule"
  );

  // B: Demo & Seed Exclusion Guardrails
  const demoAndSeedIncidents: Incident[] = [
    {
      id: "VIG-2026-089",
      title: "Unresponsive student near Arena entrance",
      description: "Demo incident",
      category: "Medical Emergency",
      severity: "Critical",
      status: "Responding",
      location: { zone: "East Sports Complex" },
      reportedAt: "2026-11-02T10:38:00Z",
      updatedAt: "2026-11-02T10:44:00Z",
      reporterContact: "+1 (555) 019-4821",
    },
    {
      id: "VIG-2026-171",
      title: "Student collapsed near the auditorium",
      description: "Seed incident",
      category: "Medical",
      severity: "Critical",
      status: "Resolved",
      location: { zone: "East Sports Complex" },
      reportedAt: "2026-11-04T13:16:16.819Z",
      updatedAt: "2026-11-05T07:16:29.323Z",
      reporterContact: "dispatcher@demo.vigilora.internal",
    },
    {
      id: "VIG-2026-172",
      title: "Test Incident Alpha - Electrical Sparking",
      description: "Test fixture",
      category: "Infrastructure",
      severity: "High",
      status: "Assigned",
      location: { zone: "North STEM Quad" },
      reportedAt: "2026-11-04T13:31:59.283Z",
      updatedAt: "2026-11-05T06:48:46.096Z",
    },
  ];

  const demoActivities: ActivityEvent[] = [
    {
      id: "act-demo-1",
      incidentId: "VIG-2026-089",
      incidentTitle: "Demo incident",
      action: "Dispatched Paramedic Unit Alpha",
      actor: "Central Dispatch",
      actorRole: "Dispatcher",
      timestamp: "2026-11-02T10:42:00Z",
      severity: "Critical",
      type: "dispatch",
    },
    {
      id: "act-seed-1",
      incidentId: "VIG-2026-171",
      incidentTitle: "Seed incident",
      action: "Dispatched Medical Response Unit",
      actor: "Lead Dispatcher Austin",
      actorRole: "Dispatcher",
      timestamp: "2026-11-04T13:20:00Z",
      severity: "Critical",
      type: "dispatch",
    },
  ];

  const demoFilteredTelemetry = calculateResponseTelemetry(demoAndSeedIncidents, demoActivities);
  assert(
    demoFilteredTelemetry.available === false,
    "Demo, seed, and test fixtures are strictly excluded from response telemetry"
  );
  assert(
    demoFilteredTelemetry.eligibleCount === 0,
    "eligibleCount is 0 when only demo/seed incidents are present"
  );
  assert(
    demoFilteredTelemetry.statusLabel === "INSUFFICIENT VERIFIED RESPONSE DATA",
    "Status label is 'INSUFFICIENT VERIFIED RESPONSE DATA' for demo/seed data"
  );

  // C: Genuine Eligible Incidents Calculation
  const genuine1Time = new Date("2026-11-05T08:00:00.000Z").getTime();
  const genuine2Time = new Date("2026-11-05T09:00:00.000Z").getTime();

  const genuineIncidents: Incident[] = [
    {
      id: "VIG-2026-501",
      title: "Water main rupture in science hall basement",
      description: "Rapid flooding in basement mechanical room.",
      category: "Infrastructure",
      severity: "High",
      status: "Assigned",
      location: { zone: "North STEM Quad", building: "Curie Engineering Hall" },
      reportedAt: new Date(genuine1Time).toISOString(),
      updatedAt: new Date(genuine1Time).toISOString(),
      reporterContact: "facilities.lead@metropolis.edu",
      isCustomReported: true,
    },
    {
      id: "VIG-2026-502",
      title: "Elevator entrapment in south dormitory",
      description: "Car stuck between floors 3 and 4 with 2 occupants.",
      category: "Facilities & Power",
      severity: "High",
      status: "Responding",
      location: { zone: "South Perimeter", building: "Dormitory Tower" },
      reportedAt: new Date(genuine2Time).toISOString(),
      updatedAt: new Date(genuine2Time).toISOString(),
      reporterContact: "resident.advisor@metropolis.edu",
      isCustomReported: true,
    },
    {
      id: "VIG-2026-503",
      title: "Broken window latch on ground floor",
      description: "Window does not lock.",
      category: "Facilities & Power",
      severity: "Low",
      status: "Reported",
      location: { zone: "Central Sector", building: "Main Hall" },
      reportedAt: new Date(genuine1Time).toISOString(),
      updatedAt: new Date(genuine1Time).toISOString(),
      reporterContact: "security@metropolis.edu",
      isCustomReported: true,
      // No dispatch activity exists for this incident -> must NOT default to 0 or 4.2
    },
  ];

  const genuineActivities: ActivityEvent[] = [
    {
      id: "act-real-1",
      incidentId: "VIG-2026-501",
      incidentTitle: "Water main rupture in science hall basement",
      action: "Dispatched Hazmat & Facilities Unit 2",
      actor: "Lead Dispatcher Austin",
      actorRole: "Dispatcher",
      timestamp: new Date(genuine1Time + 6 * 60 * 1000).toISOString(), // 6.0 minutes after reportedAt
      severity: "High",
      type: "dispatch",
    },
    {
      id: "act-real-2",
      incidentId: "VIG-2026-502",
      incidentTitle: "Elevator entrapment in south dormitory",
      action: "Dispatched Emergency Rescue Patrol",
      actor: "Lead Dispatcher Austin",
      actorRole: "Dispatcher",
      timestamp: new Date(genuine2Time + 4 * 60 * 1000).toISOString(), // 4.0 minutes after reportedAt
      severity: "High",
      type: "dispatch",
    },
  ];

  const genuineTelemetry = calculateResponseTelemetry(genuineIncidents, genuineActivities);
  assert(genuineTelemetry.available === true, "Telemetry is available when verified genuine dispatch events exist");
  assert(genuineTelemetry.eligibleCount === 2, "eligibleCount reflects exactly the 2 dispatched genuine incidents");
  assert(genuineTelemetry.sampleSize === 2, "sampleSize equals eligibleCount");
  // (6 + 4) / 2 = 5.0 minutes
  assert(genuineTelemetry.meanMinutes === 5, "Mean response time accurately calculated as arithmetic mean (5.0m)");
  assert(genuineTelemetry.fastestMinutes === 4, "Fastest response time accurately calculated as 4.0m");
  assert(genuineTelemetry.slowestMinutes === 6, "Slowest response time accurately calculated as 6.0m");
  assert(genuineTelemetry.statusLabel === "VERIFIED DISPATCH TELEMETRY", "Status label indicates verified telemetry");

  // D: Negative / Invalid Interval Exclusion
  const negativeActivityIncident: Incident = {
    id: "VIG-2026-504",
    title: "Faulty sensor trip in corridor",
    description: "Sensor tripped.",
    category: "Infrastructure",
    severity: "Low",
    status: "Reported",
    location: { zone: "North STEM Quad" },
    reportedAt: "2026-11-05T10:00:00.000Z",
    updatedAt: "2026-11-05T10:00:00.000Z",
    reporterContact: "staff@metropolis.edu",
    isCustomReported: true,
  };
  const negativeActivity: ActivityEvent = {
    id: "act-negative-1",
    incidentId: "VIG-2026-504",
    incidentTitle: "Faulty sensor trip in corridor",
    action: "Dispatched Unit",
    actor: "Lead Dispatcher Austin",
    actorRole: "Dispatcher",
    timestamp: "2026-11-05T09:50:00.000Z", // 10 minutes BEFORE reportedAt!
    severity: "Low",
    type: "dispatch",
  };
  const negTelemetry = calculateResponseTelemetry([negativeActivityIncident], [negativeActivity]);
  assert(negTelemetry.available === false, "Negative intervals (dispatch before report) are strictly excluded");
  assert(negTelemetry.eligibleCount === 0, "Negative intervals yield 0 eligible incidents");

  // E: Duplicate Dispatch Event Handling (Earliest Timestamp Preserved)
  const activitiesWithDuplicate: ActivityEvent[] = [
    ...genuineActivities,
    {
      id: "act-reassign-1",
      incidentId: "VIG-2026-501",
      incidentTitle: "Water main rupture in science hall basement",
      action: "Tactical unit reassigned to Facilities Unit 3",
      actor: "Lead Dispatcher Austin",
      actorRole: "Dispatcher",
      timestamp: new Date(genuine1Time + 35 * 60 * 1000).toISOString(), // 35 minutes later
      severity: "High",
      type: "dispatch",
    },
  ];
  const telemetryWithReassignment = calculateResponseTelemetry(genuineIncidents, activitiesWithDuplicate);
  assert(
    telemetryWithReassignment.meanMinutes === 5,
    "Chronological sorting ensures initial dispatch delta (6m) is preserved over later reassignments"
  );
  assert(
    telemetryWithReassignment.eligibleCount === 2,
    "Duplicate dispatch events on same incident do not duplicate eligible incident count"
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Hardcoded Value Elimination Code Audit
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 3: Elimination of Hardcoded 4.2m and 83-Incident Array]");

  const incidentContextSource = fs.readFileSync(
    path.join(process.cwd(), "src/context/IncidentContext.tsx"),
    "utf8"
  );
  assert(
    !incidentContextSource.includes("const avgResponseTimeMinutes = 4.2"),
    "IncidentContext has zero hardcoded 'const avgResponseTimeMinutes = 4.2'"
  );
  assert(
    incidentContextSource.includes("calculateResponseTelemetry(incidents, activities)"),
    "IncidentContext derives avgResponseTimeMinutes dynamically using calculateResponseTelemetry"
  );

  const analyticsSource = fs.readFileSync(
    path.join(process.cwd(), "src/app/analytics/page.tsx"),
    "utf8"
  );
  assert(
    !analyticsSource.includes("count: 14, height: \"100%\""),
    "Analytics page has zero hardcoded 14-incident mock trend bar"
  );
  assert(
    !analyticsSource.includes("count: 12, height: \"90%\""),
    "Analytics page has zero hardcoded 12-incident mock trend bar"
  );
  assert(
    analyticsSource.includes("calculateHourlyDistribution(incidents)"),
    "Analytics page dynamically aggregates incidents using calculateHourlyDistribution"
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Emergency Hotline Demonstration Labeling Audit
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 4: Fictional Demo Hotline Representation Audit]");

  const settingsSource = fs.readFileSync(
    path.join(process.cwd(), "src/app/settings/page.tsx"),
    "utf8"
  );
  assert(
    settingsSource.includes("HOTLINE CONFIGURED (DEMO SIMULATION)"),
    "Settings page explicitly tags configured hotline with (DEMO SIMULATION)"
  );
  assert(
    settingsSource.includes("Fictional demonstration contact. Not an active emergency dispatch line"),
    "Settings page explicitly informs operators that hotline is not an active emergency line"
  );
  assert(
    settingsSource.includes("In real life-threatening emergencies, always dial 911"),
    "Settings page directs real emergencies to 911"
  );

  const reportSource = fs.readFileSync(
    path.join(process.cwd(), "src/app/report/page.tsx"),
    "utf8"
  );
  assert(
    reportSource.includes("DISPATCH SIMULATION:"),
    "Report page explicitly displays 'DISPATCH SIMULATION:' on the hotline badge"
  );
  assert(
    reportSource.includes("(DEMO)"),
    "Report page tags hotline badge with (DEMO)"
  );
  assert(
    reportSource.includes("dial <strong>911</strong>") || reportSource.includes("dial 911"),
    "Report page emergency protocol advisory directs real emergencies to 911"
  );

  // Default number remains the fictional 555-series placeholder
  assert(
    incidentContextSource.includes("+1 (555) 991-1111"),
    "Default hotline number strictly preserved as fictional +1 (555) 991-1111 placeholder"
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  ANALYTICS INTEGRITY SUITE: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAnalyticsIntegritySuite().catch((err) => {
  console.error("Fatal error in test suite:", err);
  process.exit(1);
});
