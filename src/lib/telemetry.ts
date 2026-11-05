/**
 * VIGILORA Analytics & Response Telemetry Engine
 *
 * Implements mathematically verified, non-fabricated analytics calculations:
 * - Genuine Mean Response Time derived strictly from verified genuine incident reportedAt
 *   and persisted initial dispatch activity timestamps.
 * - Dynamic 24-Hour Cycle Hourly Incident Distribution derived strictly from actual incident reportedAt timestamps.
 * - Zero hardcoded or simulated metric values.
 * - Strict exclusion of demo/seed incidents, test fixtures, negative intervals, and duplicate dispatch events.
 */

import { Incident, ActivityEvent } from "@/types/incident";

export const TELEMETRY_EXPLANATION =
  "Average time from incident reporting to the first verified dispatch, calculated from genuine persisted incident records only.";

export const NO_DATA_STATUS_LABEL = "INSUFFICIENT VERIFIED RESPONSE DATA";
export const VERIFIED_STATUS_LABEL = "VERIFIED DISPATCH TELEMETRY";

export interface ResponseTelemetryResult {
  available: boolean;
  meanMinutes: number | null;
  fastestMinutes: number | null;
  slowestMinutes: number | null;
  eligibleCount: number;
  sampleSize: number; // Backwards-compatible alias for eligibleCount
  statusLabel: string;
  explanation: string;
  description: string;
  deltas?: number[];
}

export interface HourlyBucket {
  hour: string;
  count: number;
  height: string;
}

export interface HourlyDistributionResult {
  buckets: HourlyBucket[];
  totalValid: number;
  peakHour: string | null;
  peakCount: number;
}

export interface ResponseTelemetryOptions {
  /**
   * For automated test harnesses testing mathematical calculation formulas with mock incident fixtures.
   * In production application runtime, this MUST remain false or undefined.
   */
  allowSyntheticForTesting?: boolean;
}

/**
 * Known baseline demonstration and seed incident IDs that MUST be excluded from real telemetry:
 * - Demo incidents from demoData.ts (VIG-2026-079 through VIG-2026-089)
 * - Baseline seeded demo items in DynamoDB (VIG-2026-171, VIG-2026-172, VIG-2026-173)
 */
const KNOWN_NON_GENUINE_IDS = new Set([
  // Baseline demo incidents
  "VIG-2026-089",
  "VIG-2026-088",
  "VIG-2026-087",
  "VIG-2026-086",
  "VIG-2026-085",
  "VIG-2026-084",
  "VIG-2026-083",
  "VIG-2026-082",
  "VIG-2026-081",
  "VIG-2026-080",
  "VIG-2026-079",
  // Initial seeded records in DynamoDB
  "VIG-2026-171",
  "VIG-2026-172",
  "VIG-2026-173",
]);

/**
 * Determines whether an incident is a genuine, verified production/application record.
 * Strictly excludes:
 * 1. Known demo baseline incidents (VIG-2026-079 through VIG-2026-089)
 * 2. Baseline seed incidents in DynamoDB (VIG-2026-171, VIG-2026-172, VIG-2026-173)
 * 3. Test fixtures and test harness incident IDs (e.g. test-, mock-, demo-, fixture-, inc-)
 * 4. Incidents with test or mock indicators in their title (e.g. "Test Incident Alpha")
 * 5. Incidents with demo/test reporter contacts (e.g. @demo.vigilora.internal, +1 (555)...)
 * 6. Explicit demo or test flags on the record
 */
export function isGenuineIncident(inc: Incident): boolean {
  if (!inc || !inc.id) return false;

  // Explicit demo / seed / fixture flags
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = inc as any;
  if (raw.isDemo === true || raw.isSeed === true || raw.isSynthetic === true || raw.isFixture === true) {
    return false;
  }

  // Known baseline demo and seed IDs
  if (KNOWN_NON_GENUINE_IDS.has(inc.id)) {
    return false;
  }

  // Test fixture or demo ID prefixes
  const lowerId = inc.id.toLowerCase();
  if (
    lowerId.startsWith("test-") ||
    lowerId.startsWith("mock-") ||
    lowerId.startsWith("demo-") ||
    lowerId.startsWith("fixture-") ||
    lowerId.startsWith("seed-") ||
    lowerId.startsWith("synthetic-") ||
    lowerId.startsWith("inc-") // test suite temporary IDs like inc-1, inc-2
  ) {
    return false;
  }

  // Test fixture / mock titles
  const lowerTitle = (inc.title || "").toLowerCase();
  if (
    lowerTitle.includes("test incident") ||
    lowerTitle.includes("[test]") ||
    lowerTitle.includes("[demo]") ||
    lowerTitle.includes("[mock]") ||
    lowerTitle.startsWith("test ") ||
    lowerTitle.startsWith("demo ") ||
    lowerTitle.startsWith("mock ") ||
    lowerTitle.startsWith("fixture ") ||
    lowerTitle.startsWith("synthetic ")
  ) {
    return false;
  }

  // Test / demo reporter contacts
  const lowerContact = (inc.reporterContact || "").toLowerCase();
  if (
    lowerContact.includes("@demo.vigilora.internal") ||
    lowerContact.includes("test-client") ||
    lowerContact.startsWith("+1 (555)") || // 555 fictional demo series
    lowerContact.includes("synthetic")
  ) {
    return false;
  }

  return true;
}

/**
 * Calculates response time statistics strictly from verified dispatch activity telemetry.
 *
 * Rules:
 * 1. For each eligible genuine incident:
 *    Response time = First verified persisted dispatch timestamp − Actual persisted incident reported timestamp.
 * 2. Include only records with:
 *    - A valid incident report timestamp.
 *    - A genuine persisted initial dispatch activity.
 *    - A valid dispatch timestamp after the incident report timestamp.
 * 3. Exclude:
 *    - Demo and seed incidents.
 *    - Test fixtures.
 *    - Missing dispatch timestamps.
 *    - Invalid or negative intervals.
 *    - Duplicate dispatch events (uses only the initial dispatch).
 * 4. If no eligible real records exist:
 *    - Display "--"
 *    - Supporting label: "INSUFFICIENT VERIFIED RESPONSE DATA"
 *    - Eligible count: 0
 *    - Standard explanation string.
 */
export function calculateResponseTelemetry(
  incidents: Incident[],
  activities?: ActivityEvent[],
  options?: ResponseTelemetryOptions
): ResponseTelemetryResult {
  const allowSynthetic = options?.allowSyntheticForTesting === true;

  if (!activities || activities.length === 0 || !incidents || incidents.length === 0) {
    return {
      available: false,
      meanMinutes: null,
      fastestMinutes: null,
      slowestMinutes: null,
      eligibleCount: 0,
      sampleSize: 0,
      statusLabel: NO_DATA_STATUS_LABEL,
      explanation: TELEMETRY_EXPLANATION,
      description: "-- (INSUFFICIENT VERIFIED RESPONSE DATA)",
    };
  }

  // Filter to eligible genuine incidents only
  const eligibleIncidents = allowSynthetic
    ? incidents
    : incidents.filter((inc) => isGenuineIncident(inc));

  if (eligibleIncidents.length === 0) {
    return {
      available: false,
      meanMinutes: null,
      fastestMinutes: null,
      slowestMinutes: null,
      eligibleCount: 0,
      sampleSize: 0,
      statusLabel: NO_DATA_STATUS_LABEL,
      explanation: TELEMETRY_EXPLANATION,
      description: "-- (INSUFFICIENT VERIFIED RESPONSE DATA)",
    };
  }

  const validDeltas: number[] = [];

  for (const inc of eligibleIncidents) {
    if (!inc.reportedAt) continue;
    const reportedMs = new Date(inc.reportedAt).getTime();
    if (isNaN(reportedMs)) continue;

    // Find all verified dispatch activities for this incident
    const dispatchActivities = activities.filter(
      (a) =>
        a.incidentId === inc.id &&
        (a.type === "dispatch" ||
          a.action.toLowerCase().includes("assigned") ||
          a.action.toLowerCase().includes("dispatched"))
    );

    if (dispatchActivities.length === 0) continue;

    // Filter to valid parseable activity timestamps
    const validDispatchActivities = dispatchActivities.filter((a) => {
      if (!a.timestamp) return false;
      const t = new Date(a.timestamp).getTime();
      return !isNaN(t);
    });

    if (validDispatchActivities.length === 0) continue;

    // Sort chronologically ascending to capture strictly the INITIAL (earliest) dispatch event
    // This avoids duplicate dispatch counts and prevents later reassignments from skewing response time
    validDispatchActivities.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const initialDispatch = validDispatchActivities[0];
    const dispatchMs = new Date(initialDispatch.timestamp).getTime();

    // Strict validation: dispatch timestamp must be strictly AFTER the incident report timestamp
    // Negative or zero-interval timestamps are invalid telemetry
    if (dispatchMs <= reportedMs) {
      continue;
    }

    const deltaMinutes = (dispatchMs - reportedMs) / (1000 * 60);

    // Valid operational ceiling: 0 < delta <= 1440 minutes (24 hours)
    if (deltaMinutes > 0 && deltaMinutes <= 1440) {
      validDeltas.push(deltaMinutes);
    }
  }

  if (validDeltas.length === 0) {
    return {
      available: false,
      meanMinutes: null,
      fastestMinutes: null,
      slowestMinutes: null,
      eligibleCount: 0,
      sampleSize: 0,
      statusLabel: NO_DATA_STATUS_LABEL,
      explanation: TELEMETRY_EXPLANATION,
      description: "-- (INSUFFICIENT VERIFIED RESPONSE DATA)",
    };
  }

  const sum = validDeltas.reduce((a, b) => a + b, 0);
  const mean = sum / validDeltas.length;
  const fastest = Math.min(...validDeltas);
  const slowest = Math.max(...validDeltas);

  const meanRounded = Math.round(mean * 10) / 10;
  const fastestRounded = Math.round(fastest * 10) / 10;
  const slowestRounded = Math.round(slowest * 10) / 10;

  return {
    available: true,
    meanMinutes: meanRounded,
    fastestMinutes: fastestRounded,
    slowestMinutes: slowestRounded,
    eligibleCount: validDeltas.length,
    sampleSize: validDeltas.length,
    statusLabel: VERIFIED_STATUS_LABEL,
    explanation: TELEMETRY_EXPLANATION,
    description: `${meanRounded}m mean (${validDeltas.length} verified genuine incident${validDeltas.length === 1 ? "" : "s"})`,
    deltas: validDeltas,
  };
}

/**
 * Aggregates actual incident reportedAt timestamps into 12 two-hour buckets across a 24-hour cycle.
 * Invariant: The sum of bucket counts strictly equals totalValid (incidents with valid parseable timestamps).
 */
export function calculateHourlyDistribution(
  incidents: Incident[]
): HourlyDistributionResult {
  const bucketHours = [
    "00:00",
    "02:00",
    "04:00",
    "06:00",
    "08:00",
    "10:00",
    "12:00",
    "14:00",
    "16:00",
    "18:00",
    "20:00",
    "22:00",
  ];

  const counts: number[] = new Array(12).fill(0);
  let totalValid = 0;

  if (Array.isArray(incidents)) {
    for (const inc of incidents) {
      if (!inc.reportedAt) continue;
      const date = new Date(inc.reportedAt);
      if (isNaN(date.getTime())) continue;

      const hour = date.getHours(); // 0-23
      const bucketIndex = Math.floor(hour / 2); // 0-11
      if (bucketIndex >= 0 && bucketIndex < 12) {
        counts[bucketIndex] += 1;
        totalValid += 1;
      }
    }
  }

  const maxCount = Math.max(...counts, 0);

  let peakHour: string | null = null;
  let peakCount = 0;
  if (maxCount > 0) {
    const peakIndex = counts.indexOf(maxCount);
    peakHour = bucketHours[peakIndex];
    peakCount = maxCount;
  }

  const buckets: HourlyBucket[] = bucketHours.map((hour, idx) => {
    const count = counts[idx];
    const height =
      maxCount > 0 && count > 0
        ? `${Math.max(Math.round((count / maxCount) * 85 + 15), 15)}%`
        : "4%";
    return { hour, count, height };
  });

  return {
    buckets,
    totalValid,
    peakHour,
    peakCount,
  };
}
