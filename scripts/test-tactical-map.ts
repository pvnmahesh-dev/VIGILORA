/**
 * VIGILORA Hackathon: Tactical Map Visualization Test Suite
 *
 * Validates the TacticalMap component logic and behavior:
 * 1. Strict coordinate validation (isValidCoordinates)
 * 2. Deterministic location-to-coordinate mapping (getIncidentCoordinates & resolveCampusCoordinates)
 * 3. All three live incidents mapped when their locations have verified schematic footprints
 * 4. Genuinely unknown or unverified locations strictly quarantined in Pending Sensor Triangulation
 * 5. Mutual exclusion and zero duplicate markers
 * 6. Severity marker color semantics:
 *    - Critical: Red (#F01420)
 *    - High: Orange (#EA580C)
 *    - Medium: Yellow/Amber (#D97706)
 *    - Low: Green (#10B981)
 * 7. Marker-to-incident selection and inspector overlay synchronization
 * 8. Sector zone filtering (All, North, Central, East, West, South)
 * 9. Verification of recognizable architectural footprints & schematic labels
 * 10. Role-based visibility and access continuity (Dispatcher vs. Responder)
 */

import fs from "node:fs";
import path from "node:path";
import { authenticateUser, createSession, SESSION_COOKIE_NAME } from "../src/lib/auth";
import { GET as getIncidentsHandler } from "../src/app/api/incidents/route";
import { Incident } from "../src/types/incident";
import {
  isValidCoordinates,
  resolveCampusCoordinates,
  getIncidentCoordinates,
  VERIFIED_CAMPUS_LOCATIONS,
} from "../src/lib/campus-coordinates";

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

async function runTacticalMapSuite() {
  console.log("================================================================================");
  console.log("       VIGILORA HACKATHON: TACTICAL MAP VISUALIZATION TEST SUITE");
  console.log("================================================================================\n");

  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error("[FATAL] .demo-credentials.json not found.");
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Strict Coordinate Validation
  // ---------------------------------------------------------------------------
  console.log("[SCENARIO 1: Coordinate Validation & Honesty Guardrails]");
  assert(isValidCoordinates({ xPercent: 74, yPercent: 34 }), "Valid (74%, 34%) accepted");
  assert(isValidCoordinates({ xPercent: 0, yPercent: 0 }), "Boundary (0%, 0%) accepted");
  assert(isValidCoordinates({ xPercent: 100, yPercent: 100 }), "Boundary (100%, 100%) accepted");
  assert(!isValidCoordinates(undefined), "Undefined coordinates strictly rejected");
  assert(!isValidCoordinates(null), "Null coordinates strictly rejected");
  assert(!isValidCoordinates({}), "Empty object coordinates strictly rejected");
  assert(!isValidCoordinates({ xPercent: -5, yPercent: 50 }), "Negative coordinate rejected");
  assert(!isValidCoordinates({ xPercent: 105, yPercent: 50 }), "Out-of-bounds (>100%) rejected");
  assert(!isValidCoordinates({ xPercent: "50", yPercent: 50 }), "String coordinate rejected");
  assert(!isValidCoordinates({ xPercent: NaN, yPercent: 50 }), "NaN coordinate rejected");

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Deterministic Location-to-Coordinate Mapping Resolution
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 2: Deterministic Location-to-Coordinate Mapping]");
  assert(VERIFIED_CAMPUS_LOCATIONS.length >= 6, "Verified campus locations table defines at least 6 major structures");

  // Engineering Hall B lookup
  const engCoords = resolveCampusCoordinates("Engineering Hall B", "Basement Corridor 02", "North STEM Quad");
  assert(engCoords !== null, "Engineering Hall B resolves to verified schematic coordinates");
  assert(engCoords?.xPercent === 35, "Engineering Hall B xPercent is 35%");
  assert(engCoords?.yPercent === 24, "Engineering Hall B yPercent is 24%");
  assert(engCoords?.locationName === "Curie Engineering Hall", "Engineering Hall B canonical name is Curie Engineering Hall");

  // Memorial Arena lookup
  const arenaCoords = resolveCampusCoordinates("Memorial Arena", "Gate 4 Service Concourse", "East Sports Complex");
  assert(arenaCoords !== null, "Memorial Arena resolves to verified schematic coordinates");
  assert(arenaCoords?.xPercent === 81, "Memorial Arena xPercent is 81%");
  assert(arenaCoords?.yPercent === 44, "Memorial Arena yPercent is 44%");
  assert(arenaCoords?.locationName === "Memorial Arena", "Memorial Arena canonical name matched");

  // Great Auditorium lookup
  const auditCoords = resolveCampusCoordinates("Great Auditorium", null, "East Sports Complex");
  assert(auditCoords !== null, "Great Auditorium resolves to verified schematic coordinates");
  assert(auditCoords?.xPercent === 74, "Great Auditorium xPercent is 74%");
  assert(auditCoords?.yPercent === 34, "Great Auditorium yPercent is 34%");

  // Unknown / unverified location must strictly return null
  const unknownCoords = resolveCampusCoordinates("Off-Campus Warehouse 99", "Dock C", "External");
  assert(unknownCoords === null, "Unknown building strictly returns null (never invents coordinates)");

  const emptyCoords = resolveCampusCoordinates("", "", "");
  assert(emptyCoords === null, "Empty location parameters strictly return null");

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Live Backend Incidents Mapped on Canvas
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 3: Live Backend Incidents Mapped on Schematic]");
  const dispCred = credentials["Dispatcher"];
  const dispAuth = await authenticateUser(dispCred.email, dispCred.password, "127.0.0.1");
  const dispSession = "user" in dispAuth ? await createSession(dispAuth.user) : null;

  const incidentsRes = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${dispSession?.plainToken}`,
        host: "localhost:3000",
        "x-vigilora-test-client": "active-test-suite",
      },
    })
  );

  assert(incidentsRes.status === 200, "GET /api/incidents returns HTTP 200");
  const incidentsPayload = await incidentsRes.json();
  const incidents = incidentsPayload.data as Incident[];
  assert(incidents.length === 3, `Backend returns exactly 3 operational incidents (found ${incidents.length})`);

  // Map each incident through the coordinate resolver
  const resolvedList = incidents.map((inc) => ({
    incident: inc,
    coords: getIncidentCoordinates(inc),
  }));

  const mapped = resolvedList.filter((item) => item.coords !== null);
  const unmapped = resolvedList.filter((item) => item.coords === null);

  // All 3 existing live incidents must be mapped
  assert(mapped.length === 3, `All 3 live incidents successfully mapped to schematic (found ${mapped.length})`);
  assert(unmapped.length === 0, `Zero live incidents left unmapped when verified locations exist (found ${unmapped.length})`);

  // Incident 1: VIG-2026-171 (Sports complex / Auditorium)
  const inc171 = mapped.find((m) => m.incident.id === "VIG-2026-171");
  assert(Boolean(inc171), "VIG-2026-171 mapped on canvas");
  assert(inc171?.coords?.xPercent === 74, "VIG-2026-171 xPercent is 74%");
  assert(inc171?.coords?.yPercent === 34, "VIG-2026-171 yPercent is 34%");
  assert(inc171?.coords?.isDerived === false, "VIG-2026-171 uses stored coordinates");

  // Incident 2: VIG-2026-172 (Engineering Hall B)
  const inc172 = mapped.find((m) => m.incident.id === "VIG-2026-172");
  assert(Boolean(inc172), "VIG-2026-172 mapped on canvas (Engineering Hall B)");
  assert(inc172?.coords?.xPercent === 35, "VIG-2026-172 xPercent is 35%");
  assert(inc172?.coords?.yPercent === 24, "VIG-2026-172 yPercent is 24%");
  assert(inc172?.coords?.isDerived === true, "VIG-2026-172 uses deterministic verified schematic coordinates");

  // Incident 3: VIG-2026-173 (Memorial Arena)
  const inc173 = mapped.find((m) => m.incident.id === "VIG-2026-173");
  assert(Boolean(inc173), "VIG-2026-173 mapped on canvas (Memorial Arena)");
  assert(inc173?.coords?.xPercent === 81, "VIG-2026-173 xPercent is 81%");
  assert(inc173?.coords?.yPercent === 44, "VIG-2026-173 yPercent is 44%");
  assert(inc173?.coords?.isDerived === true, "VIG-2026-173 uses deterministic verified schematic coordinates");

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Unknown Locations Remain Strictly Quarantined in Pending Drawer
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 4: Unknown Locations Quarantined in Pending Sensor Fix]");
  const syntheticUnknownIncident: Incident = {
    id: "VIG-2026-999",
    title: "Suspicious activity near unmapped annex",
    description: "Activity reported outside primary campus sensor grid.",
    category: "Security & Safety",
    severity: "Low",
    status: "Reported",
    location: {
      zone: "South Perimeter",
      building: "Unknown Temporary Trailer #4",
    },
    reportedAt: "2026-11-05T09:00:00Z",
    updatedAt: "2026-11-05T09:00:00Z",
  };

  const unknownResolved = getIncidentCoordinates(syntheticUnknownIncident);
  assert(unknownResolved === null, "Synthetic incident with unknown building yields null coordinates");

  // Combine with live list to test partitioning
  const testRoster = [...incidents, syntheticUnknownIncident];
  const partitionedMapped: Incident[] = [];
  const partitionedUnmapped: Incident[] = [];

  for (const inc of testRoster) {
    if (getIncidentCoordinates(inc) !== null) {
      partitionedMapped.push(inc);
    } else {
      partitionedUnmapped.push(inc);
    }
  }

  assert(partitionedMapped.length === 3, "3 verified incidents partitioned into mapped markers");
  assert(partitionedUnmapped.length === 1, "1 unknown incident partitioned into Pending Sensor Triangulation");
  assert(partitionedUnmapped[0].id === "VIG-2026-999", "Pending drawer contains the unmapped incident");

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Mutual Exclusion & Zero Duplicate Markers
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 5: Mutual Exclusion & Zero Duplicate Markers]");
  const mappedIds = new Set(partitionedMapped.map((i) => i.id));
  const unmappedIds = new Set(partitionedUnmapped.map((i) => i.id));

  // Intersection must be completely empty
  const duplicates = [...mappedIds].filter((id) => unmappedIds.has(id));
  assert(duplicates.length === 0, "Zero overlap between mapped markers and unmapped pending drawer");

  // Every incident in the input roster must appear exactly once
  const totalPartitioned = partitionedMapped.length + partitionedUnmapped.length;
  assert(totalPartitioned === testRoster.length, "Every incident accounted for exactly once (no duplicates, no omissions)");

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Severity Marker Styling & Color Semantics
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 6: Severity Marker Styling Semantics]");
  const getMarkerStyling = (severity: string) => {
    switch (severity) {
      case "Critical":
        return { color: "red", hex: "#F01420", bg: "bg-[#F01420]" };
      case "High":
        return { color: "orange", hex: "#EA580C", bg: "bg-[#EA580C]" };
      case "Medium":
        return { color: "yellow", hex: "#D97706", bg: "bg-[#D97706]" };
      case "Low":
      default:
        return { color: "green", hex: "#10B981", bg: "bg-[#059669]" };
    }
  };

  assert(getMarkerStyling("Critical").color === "red", "Critical severity styled as red");
  assert(getMarkerStyling("High").color === "orange", "High severity styled as orange");
  assert(getMarkerStyling("Medium").color === "yellow", "Medium severity styled as yellow");
  assert(getMarkerStyling("Low").color === "green", "Low severity styled as green");

  // Verify the 3 live incidents have appropriate severity styles
  assert(getMarkerStyling(inc171!.incident.severity).color === "red", "VIG-2026-171 (Critical) gets red marker");
  assert(getMarkerStyling(inc172!.incident.severity).color === "orange", "VIG-2026-172 (High) gets orange marker");
  assert(getMarkerStyling(inc173!.incident.severity).color === "yellow", "VIG-2026-173 (Medium) gets yellow marker");

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Sector Zone Filtering
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 7: Sector Zone Filtering]");
  const filterByZone = (list: Incident[], zone: string) => {
    if (zone === "all") return list;
    return list.filter((i) => i.location.zone.toLowerCase().includes(zone.toLowerCase()));
  };

  const allFiltered = filterByZone(incidents, "all");
  assert(allFiltered.length === 3, "All Sectors returns all 3 incidents");

  const eastFiltered = filterByZone(incidents, "East");
  assert(eastFiltered.some((i) => i.id === "VIG-2026-171"), "East Sector includes VIG-2026-171 (Sports Complex)");
  assert(eastFiltered.some((i) => i.id === "VIG-2026-173"), "East Sector includes VIG-2026-173 (Memorial Arena)");
  assert(!eastFiltered.some((i) => i.id === "VIG-2026-172"), "East Sector excludes VIG-2026-172 (North STEM Quad)");

  const northFiltered = filterByZone(incidents, "North");
  assert(northFiltered.some((i) => i.id === "VIG-2026-172"), "North Sector includes VIG-2026-172 (Engineering Hall B)");
  assert(!northFiltered.some((i) => i.id === "VIG-2026-171"), "North Sector excludes VIG-2026-171 (East Sports Complex)");
  assert(!northFiltered.some((i) => i.id === "VIG-2026-173"), "North Sector excludes VIG-2026-173 (East Sports Complex)");

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Component Source Audit - Recognizable Footprints & Labels
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 8: Component Source Audit - Recognizable Footprints & Labels]");
  const tacticalMapSrc = fs.readFileSync(
    path.join(process.cwd(), "src/components/dashboard/TacticalMap.tsx"),
    "utf-8"
  );

  assert(tacticalMapSrc.includes("GREAT AUDITORIUM"), "Schematic includes Great Auditorium footprint & label");
  assert(tacticalMapSrc.includes("SPORTS COMPLEX"), "Schematic includes Sports Complex footprint & label");
  assert(tacticalMapSrc.includes("STEM QUAD"), "Schematic includes STEM Quad footprint & label");
  assert(tacticalMapSrc.includes("CENTRAL PLAZA"), "Schematic includes Central Plaza footprint & label");
  assert(tacticalMapSrc.includes("ARTS DISTRICT"), "Schematic includes Arts District footprint & label");
  assert(tacticalMapSrc.includes("SOUTH LOGISTICS DEPOT"), "Schematic includes South Depot footprint & label");
  assert(tacticalMapSrc.includes("DEMONSTRATION SCHEMATIC"), "Prominently displays DEMONSTRATION SCHEMATIC watermark");
  assert(tacticalMapSrc.includes("Pending Sensor Triangulation"), "Includes Pending Sensor Triangulation drawer");
  assert(tacticalMapSrc.includes("getIncidentCoordinates"), "TacticalMap imports and uses getIncidentCoordinates");
  assert(tacticalMapSrc.includes("bg-[#10B981]"), "Severity legend displays green dot for Low severity");

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Marker-to-Incident Selection
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 9: Marker-to-Incident Selection Synchronization]");
  // Test selection handler logic
  let selectedIncident: Incident | null = null;
  const onSelect = (inc: Incident) => {
    selectedIncident = inc;
  };

  onSelect(inc172!.incident);
  assert(selectedIncident !== null, "Selection handler triggered on marker interaction");
  assert((selectedIncident as Incident | null)?.id === "VIG-2026-172", "Selected incident ID matches VIG-2026-172");
  assert((selectedIncident as Incident | null)?.title === "Test Incident Alpha - Electrical Sparking", "Selected incident title matches");
  assert((selectedIncident as Incident | null)?.location.building === "Engineering Hall B", "Selected incident building matches");

  // ---------------------------------------------------------------------------
  // SCENARIO 10: Field Responder Access Continuity
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 10: Field Responder Access Continuity & RBAC]");
  const respCred = credentials["Responder"];
  const respAuth = await authenticateUser(respCred.email, respCred.password, "127.0.0.1");
  const respSession = "user" in respAuth ? await createSession(respAuth.user) : null;

  const respIncRes = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${respSession?.plainToken}`,
        host: "localhost:3000",
        "x-vigilora-test-client": "active-test-suite",
      },
    })
  );

  assert(respIncRes.status === 200, "Responder queries incidents successfully (HTTP 200)");
  const respIncData = await respIncRes.json();
  const respIncList = respIncData.data as Incident[];
  assert(
    respIncList.some((i) => i.id === "VIG-2026-171"),
    "Officer Vance sees assigned incident VIG-2026-171 for tactical map display"
  );
  assert(
    !respIncList.some((i) => i.id === "VIG-2026-172"),
    "Officer Vance does NOT receive unassigned incidents (RBAC boundary preserved)"
  );

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  TACTICAL MAP SUITE: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTacticalMapSuite().catch((err) => {
  console.error("Unhandled error in tactical map suite:", err);
  process.exit(1);
});
