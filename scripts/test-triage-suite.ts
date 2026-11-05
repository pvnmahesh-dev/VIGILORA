/**
 * VIGILORA Intelligent Incident Auto-Triage Automated Test Suite
 *
 * Validates:
 * 1. Fire incident triage
 * 2. Medical emergency triage
 * 3. Security threat triage
 * 4. Infrastructure damage triage
 * 5. Ambiguous description triage (confidence score must be null)
 * 6. Empty / whitespace description validation
 * 7. AI provider unavailable graceful fallback
 * 8. Invalid model response schema validation
 */

import {
  classifyIncidentWithCalibratedEngine,
  validateModelTriageResponse,
  TriageResult,
} from "../src/lib/triage-engine";
import { POST as triageHandler } from "../src/app/api/incidents/triage/route";

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

async function runTestSuite() {
  console.log("================================================================================");
  console.log("       VIGILORA HACKATHON: INTELLIGENT INCIDENT AUTO-TRIAGE TEST SUITE");
  console.log("================================================================================\n");

  // TEST 1: Fire Incident
  console.log("[SCENARIO 1: Fire Incident Triage]");
  {
    const narrative =
      "Dense black smoke and visible flames spreading from sub-panel breaker box 3B in Curie Engineering Hall. Strong burning ozone smell.";
    const result = classifyIncidentWithCalibratedEngine(narrative, "Electrical smoke and flame");

    assert(result.category === "Fire and Hazard", "Categorized as 'Fire and Hazard'");
    assert(result.severity === "Critical", "Severity evaluated as 'Critical'");
    assert(result.isLifeThreatening === true, "Life-threatening hazard flag is TRUE");
    assert(
      Boolean(result.safetyAdvisory && result.safetyAdvisory.includes("911")),
      "Emergency safety advisory included"
    );
    assert(
      result.immediateAction.includes("evacuation") || result.immediateAction.includes("fire alarm"),
      "Immediate action recommends fire alarm/evacuation"
    );
    assert(
      typeof result.confidenceScore === "number" &&
        result.confidenceScore >= 0.7 &&
        result.confidenceScore <= 1.0,
      `Calibrated confidence score is genuine probability (${result.confidenceScore})`
    );
    assert(result.detectedKeywords.includes("smoke"), "Detected 'smoke' indicator");
    assert(result.detectedKeywords.includes("flames"), "Detected 'flames' indicator");
  }

  // TEST 2: Medical Emergency
  console.log("\n[SCENARIO 2: Medical Emergency Triage]");
  {
    const narrative =
      "Student collapsed against concourse pillar near Gate 4, unconscious and not breathing, severe head injury with massive bleeding.";
    const result = classifyIncidentWithCalibratedEngine(narrative, "Unresponsive student");

    assert(result.category === "Medical", "Categorized as 'Medical'");
    assert(result.severity === "Critical", "Severity evaluated as 'Critical'");
    assert(result.isLifeThreatening === true, "Life-threatening flag is TRUE");
    assert(
      result.immediateAction.includes("Paramedic") || result.immediateAction.includes("CPR"),
      "Immediate action recommends Paramedic ALS / CPR"
    );
    assert(
      typeof result.confidenceScore === "number" && result.confidenceScore >= 0.8,
      `Calibrated confidence score is high (${result.confidenceScore})`
    );
    assert(
      result.detectedKeywords.includes("unconscious") || result.detectedKeywords.includes("not breathing"),
      "Detected 'unconscious' / 'not breathing' indicators"
    );
  }

  // TEST 3: Security Threat
  console.log("\n[SCENARIO 3: Security Threat Triage]");
  {
    const narrative =
      "Individual spotted with a firearm attempting forced entry through South Perimeter security fence, shots fired near depot.";
    const result = classifyIncidentWithCalibratedEngine(narrative, "Armed intruder perimeter breach");

    assert(result.category === "Security", "Categorized as 'Security'");
    assert(result.severity === "Critical", "Severity evaluated as 'Critical'");
    assert(result.isLifeThreatening === true, "Life-threatening flag is TRUE");
    assert(
      result.immediateAction.includes("lockdown") || result.immediateAction.includes("tactical"),
      "Immediate action recommends sector lockdown / tactical response"
    );
    assert(
      typeof result.confidenceScore === "number" && result.confidenceScore >= 0.75,
      `Calibrated confidence score is genuine (${result.confidenceScore})`
    );
    assert(
      result.detectedKeywords.includes("firearm") || result.detectedKeywords.includes("shots fired"),
      "Detected weapon/shooting indicators"
    );
  }

  // TEST 4: Infrastructure Damage
  console.log("\n[SCENARIO 4: Infrastructure Damage Triage]");
  {
    const narrative =
      "Water pipe burst on 3rd floor causing major flooding into hallway and ceiling structural damage above lab.";
    const result = classifyIncidentWithCalibratedEngine(narrative, "Pipe burst flood");

    assert(result.category === "Infrastructure", "Categorized as 'Infrastructure'");
    assert(
      result.severity === "High" || result.severity === "Critical",
      `Severity evaluated as High/Critical (${result.severity})`
    );
    assert(
      result.immediateAction.includes("facilities") || result.immediateAction.includes("repair"),
      "Immediate action recommends facilities crew deployment"
    );
    assert(
      typeof result.confidenceScore === "number" && result.confidenceScore >= 0.7,
      `Calibrated confidence score is genuine (${result.confidenceScore})`
    );
  }

  // TEST 5: Ambiguous Description (Never Invent Confidence)
  console.log("\n[SCENARIO 5: Ambiguous Description - Strict Confidence Integrity]");
  {
    const ambiguousText =
      "Someone was standing around near the courtyard and maybe something happened earlier today.";
    const result = classifyIncidentWithCalibratedEngine(ambiguousText);

    assert(
      result.confidenceScore === null,
      "Confidence score is strictly NULL (never invented for ambiguous descriptions)"
    );
    assert(
      result.explanation.includes("insufficient emergency domain keywords") ||
        result.explanation.includes("Manual operator review"),
      "Explanation honestly identifies lack of domain indicators"
    );
    assert(result.isLifeThreatening === false, "Life-threatening flag is FALSE");
    assert(result.severity === "Low", "Defaults to routine low severity");
  }

  // TEST 6: Empty & Whitespace Validation (API Route Level)
  console.log("\n[SCENARIO 6: Empty & Whitespace Input Validation]");
  {
    // Empty description
    const req1 = new Request("http://localhost:3000/api/incidents/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "" }),
    });
    const res1 = await triageHandler(req1);
    const body1 = await res1.json();

    assert(res1.status === 400, "Empty description rejected with HTTP 400");
    assert(body1.success === false, "Response body contains success: false");
    assert(
      body1.error.includes("narrative description is required"),
      "Error specifies description is required"
    );

    // Whitespace-only description
    const req2 = new Request("http://localhost:3000/api/incidents/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "     " }),
    });
    const res2 = await triageHandler(req2);
    assert(res2.status === 400, "Whitespace-only description rejected with HTTP 400");

    // Invalid JSON body
    const req3 = new Request("http://localhost:3000/api/incidents/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "INVALID_JSON",
    });
    const res3 = await triageHandler(req3);
    assert(res3.status === 400, "Malformed JSON rejected with HTTP 400");
  }

  // TEST 7: AI Provider Unavailable Graceful Fallback
  console.log("\n[SCENARIO 7: AI Provider Unavailable Fallback]");
  {
    // Even if no external AI API key is set, the API route succeeds seamlessly via calibrated engine
    const req = new Request("http://localhost:3000/api/incidents/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Smell of burning wires",
        description: "Breaker box is buzzing with electrical sparks in North STEM Quad.",
      }),
    });
    const res = await triageHandler(req);
    const body = await res.json();

    assert(res.status === 200, "Returns HTTP 200 when external AI is unavailable");
    assert(body.success === true, "Response success is true");
    assert(body.data.category === "Fire and Hazard", "Correctly identified 'Fire and Hazard'");
    assert(body.data.engineUsed === "calibrated-nlp", "Engine used reported as 'calibrated-nlp'");
    assert(Boolean(body.disclaimer), "Transparency disclaimer is present");
  }

  // TEST 8: Invalid Model Response Schema Validation
  console.log("\n[SCENARIO 8: Invalid Model Response Schema Validation]");
  {
    // Invalid category
    const badCategory = {
      category: "Alien Invasion",
      severity: "Critical",
      urgency: "High",
      immediateAction: "Run",
      explanation: "Aliens",
    };
    assert(validateModelTriageResponse(badCategory) === null, "Rejects invalid category");

    // Invalid severity
    const badSeverity = {
      category: "Medical",
      severity: "SUPER_DUPER_URGENT",
      urgency: "High",
      immediateAction: "Help",
      explanation: "Injured",
    };
    assert(validateModelTriageResponse(badSeverity) === null, "Rejects invalid severity");

    // Missing immediateAction
    const missingAction = {
      category: "Medical",
      severity: "Critical",
      urgency: "High",
      explanation: "Injured",
    };
    assert(validateModelTriageResponse(missingAction) === null, "Rejects missing immediateAction");

    // Non-object payload
    assert(validateModelTriageResponse("not an object") === null, "Rejects string payload");
    assert(validateModelTriageResponse(null) === null, "Rejects null payload");

    // Valid model response
    const validModelResp = {
      category: "Medical",
      severity: "Critical",
      urgency: "Immediate Paramedic Response Required",
      immediateAction: "Dispatch ALS unit with AED",
      explanation: "Classified as Critical Medical due to cardiac symptoms.",
      confidenceScore: 0.95,
      isLifeThreatening: true,
      safetyAdvisory: "Call 911 immediately.",
      detectedKeywords: ["cardiac", "unresponsive"],
    };
    const validated = validateModelTriageResponse(validModelResp);
    assert(validated !== null, "Accepts valid compliant model response");
    assert(validated?.engineUsed === "external-ai", "Engine stamped as 'external-ai'");
    assert(validated?.confidenceScore === 0.95, "Preserves valid confidence score");
  }

  console.log("\n================================================================================");
  console.log(`  TRIAGE SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

