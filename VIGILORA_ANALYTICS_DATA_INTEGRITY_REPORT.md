# VIGILORA — Analytics & Settings Data Integrity Audit Report

**Date**: November 5, 2026  
**Audit Scope**: Read-Only Data Integrity Audit of Analytics Page & Emergency Contact Settings  
**Mode**: READ-ONLY AUDIT (Zero application code modified, zero database records modified, zero AWS mutations executed)  
**Status**: AWAITING USER APPROVAL PRIOR TO IMPLEMENTATION  

---

## 1. Executive Summary

A comprehensive, line-by-line inspection was conducted across the VIGILORA Analytics subsystem, the incident context state provider, the PDF export telemetry engine, and the emergency configuration settings.

The audit confirmed three distinct data integrity discrepancies:
1. **Hourly Incident Distribution**: The chart renders hardcoded mock data representing **83 simulated incident occurrences** (peaking at 14), in direct contradiction with the live KPI card displaying **3 Total Logged Reports**.
2. **Mean Response Time**: The Analytics and Dashboard UI display a static literal **4.2 minutes** hardcoded in `IncidentContext.tsx`, whereas the PDF export calculation is dynamic and the integration test verified a synthetic **3.0-minute** benchmark.
3. **Emergency Hotline**: The `+1 (555) 991-1111` number is a standard fictional North American `555` demonstration placeholder. However, the Settings UI marks it with a green `"HOTLINE CONFIGURED"` badge without making its simulated demonstration nature explicit.

Detailed code references, mathematical traces, and exact proposed remediation plans are provided below.

---

## 2. Issue 1: Hourly Incident Distribution (24-Hour Cycle)

### 2.1 Code Trace & Source Analysis
- **File**: `src/app/analytics/page.tsx`
- **Lines**: 67–80 and 282–301
- **Exact Code**:
  ```ts
  const hourlyTrends = [
    { hour: "00:00", count: 2, height: "15%" },
    { hour: "02:00", count: 1, height: "8%" },
    { hour: "04:00", count: 0, height: "4%" },
    { hour: "06:00", count: 3, height: "22%" },
    { hour: "08:00", count: 6, height: "45%" },
    { hour: "10:00", count: 12, height: "90%" },
    { hour: "12:00", count: 9, height: "65%" },
    { hour: "14:00", count: 11, height: "80%" },
    { hour: "16:00", count: 8, height: "58%" },
    { hour: "18:00", count: 14, height: "100%" },
    { hour: "20:00", count: 10, height: "72%" },
    { hour: "22:00", count: 7, height: "50%" },
  ];
  ```

### 2.2 Audit Findings
1. **Are these values calculated from actual DynamoDB incidents?**  
   **NO.** The `hourlyTrends` array is an isolated, static in-memory constant defined directly within the React component body. It does not read `incidents`, `activities`, or any API response.
2. **Are they hardcoded, seeded, or simulated?**  
   **Hardcoded.** The counts are hardcoded integers that sum to **83 incidents**:
   $$\sum_{i=1}^{12} \text{count}_i = 2 + 1 + 0 + 3 + 6 + 12 + 9 + 11 + 8 + 14 + 10 + 7 = 83$$
3. **Why is it misleading?**  
   The Analytics page renders the KPI card `"Total Logged Reports: 3"` right above this chart. Presenting 83 occurrences with bars labeled `"12"` and `"14"` severely compromises data integrity and creates an obvious contradiction during hackathon evaluations.
4. **Hardcoded Subtitle**:  
   Line 274 displays: `"Peak density observed between 18:00 and 21:00 during evening campus operations"`, which is also a static hardcoded claim unrelated to live incident records.

### 2.3 Proposed Dynamic Solution (Upon Approval)
Replace the static array with a dynamic `useMemo` computation derived strictly from `incidents`:

```ts
const hourlyTrends = useMemo(() => {
  // 12 two-hour buckets covering the 24-hour cycle
  const buckets: { hour: string; count: number }[] = [
    { hour: "00:00", count: 0 },
    { hour: "02:00", count: 0 },
    { hour: "04:00", count: 0 },
    { hour: "06:00", count: 0 },
    { hour: "08:00", count: 0 },
    { hour: "10:00", count: 0 },
    { hour: "12:00", count: 0 },
    { hour: "14:00", count: 0 },
    { hour: "16:00", count: 0 },
    { hour: "18:00", count: 0 },
    { hour: "20:00", count: 0 },
    { hour: "22:00", count: 0 },
  ];

  // Aggregate incidents by reportedAt timestamp
  for (const inc of incidents) {
    if (!inc.reportedAt) continue;
    const date = new Date(inc.reportedAt);
    if (isNaN(date.getTime())) continue;
    const h = date.getHours();
    const bucketIndex = Math.floor(h / 2);
    if (bucketIndex >= 0 && bucketIndex < buckets.length) {
      buckets[bucketIndex].count += 1;
    }
  }

  const maxCount = Math.max(...buckets.map((b) => b.count), 0);

  return buckets.map((b) => ({
    hour: b.hour,
    count: b.count,
    height: maxCount > 0 && b.count > 0 
      ? `${Math.max(Math.round((b.count / maxCount) * 85 + 10), 10)}%` 
      : "4%",
  }));
}, [incidents]);
```

- **Invariant Guaranteed**: $\sum \text{bar counts} \le \text{total incidents}$. With 3 incidents in DynamoDB, the sum across all bars will be exactly 3.
- **Dynamic Subtitle**: Display dynamic text such as `"Reflecting active session chronology (3 verified incident timestamps)"` or `"Awaiting longitudinal incident telemetry"` when empty.

---

## 3. Issue 2: Mean Response Time Discrepancy (4.2m vs 3.0m vs Live Calculation)

### 3.1 Code Trace & Source Analysis

#### A. Analytics UI & Dashboard KPI Source
- **File**: `src/context/IncidentContext.tsx`
- **Line**: 765
- **Exact Code**:
  ```ts
  const avgResponseTimeMinutes = 4.2;
  ```
- **Consumer Components**:
  - `src/app/page.tsx:346`: `{metrics.avgResponseTimeMinutes}m`
  - `src/app/analytics/page.tsx:227`: `{metrics.avgResponseTimeMinutes}m`

#### B. PDF Export Real Telemetry Engine Source
- **File**: `src/lib/pdf-export.ts`
- **Lines**: 26–94 (`calculateResponseTelemetry`)
- **Formula**:
  1. For each incident $i$ in `incidents`, parse `reportedMs = new Date(i.reportedAt).getTime()`.
  2. Find matching activity $a$ in `activities` where $a.\text{incidentId} == i.\text{id}$ and $a.\text{type} == \text{"dispatch"}$ (or action contains `"assigned"` / `"dispatched"`).
  3. Compute $\Delta t = \frac{\text{dispatchMs} - \text{reportedMs}}{60000}$ (in minutes).
  4. Filter valid window ($0 \le \Delta t \le 1440$ minutes).
  5. Calculate:
     $$\text{Mean} = \frac{\sum \Delta t}{N}, \quad \text{where } N = \text{valid dispatch events}$$
  6. If $N = 0$, returns `{ available: false, sampleSize: 0, description: "Not available (No verified dispatch events recorded)" }`.

#### C. Test Assertion Source
- **File**: `scripts/test-pdf-export.ts`
- **Lines**: 177–197
- **Exact Code**:
  ```ts
  // Synthetic activity injected specifically for unit verification of math formula:
  const syntheticActivities: ActivityEvent[] = [
    {
      id: "act-1",
      incidentId: firstIncident.id,
      timestamp: new Date(new Date(firstIncident.reportedAt).getTime() + 180000).toISOString(), // exactly +3.0 min
      type: "dispatch",
      ...
    },
  ];
  const calculatedTelemetry = calculateResponseTelemetry(liveIncidents, syntheticActivities);
  assert(calculatedTelemetry.meanMinutes === 3, "Calculated mean response time is exactly 3.0 minutes");
  ```

### 3.2 Audit Findings
1. **Why do the values differ?**
   - **4.2 minutes** in the UI is a **hardcoded fallback literal** in `IncidentContext.tsx:765`. It is never computed from database records or activities.
   - **3.0 minutes** in the test was a **controlled synthetic test fixture** (+180,000ms delta) designed solely to test the mathematics of `calculateResponseTelemetry`.
2. **What does the real DynamoDB data yield?**
   - When `calculateResponseTelemetry(incidents, activities)` is evaluated against the 50 most recent live activities from DynamoDB, incident `VIG-2026-171` was reported at `13:16 UTC` and dispatched at `17:35 UTC` during verification, yielding an elapsed delta of **259.5 minutes**.
   - If evaluated with incidents that have no verified dispatch timestamp, the genuine calculation returns `available: false` (`"Not available"`).

### 3.3 Recommended Consistent Fix (Upon Approval)
1. **Single Source of Truth**:
   - Utilize `calculateResponseTelemetry` (exported from `@/lib/pdf-export` or moved to a shared `@/lib/telemetry.ts`) directly inside `IncidentContext.tsx`.
2. **Update `IncidentContext.tsx`**:
   ```ts
   const responseTelemetry = useMemo(
     () => calculateResponseTelemetry(incidents, activities),
     [incidents, activities]
   );

   const avgResponseTimeMinutes = responseTelemetry.available && responseTelemetry.meanMinutes !== undefined
     ? responseTelemetry.meanMinutes
     : null;
   ```
3. **Update UI Rendering in Dashboard & Analytics**:
   - If `avgResponseTimeMinutes !== null`: Render `{avgResponseTimeMinutes}m`.
   - If `avgResponseTimeMinutes === null`: Render `--` or `N/A` with label `"Awaiting dispatch"`.
   - This ensures **100% mathematical consistency** across the Dashboard KPI, the Analytics Page, and the downloaded PDF summary report.

---

## 4. Issue 3: Emergency Hotline (+1 (555) 991-1111)

### 4.1 Code Trace & Source Analysis
- **Code Locations**:
  - `src/context/IncidentContext.tsx:88`: `DEFAULT_SETTINGS.dispatchHotline = "+1 (555) 991-1111"`
  - `src/app/api/settings/route.ts:10`: `DEFAULT_SETTINGS.dispatchHotline = "+1 (555) 991-1111"`
  - `src/app/settings/page.tsx:151–190`: Input field labeled `"Campus Emergency Dispatch Hotline"` with `"HOTLINE CONFIGURED"` badge.
  - `src/app/report/page.tsx:394`: Display badge `"DISPATCH: +1 (555) 991-1111"`.
  - DynamoDB Table `VIGILORA-Main` (`CONFIG#SETTINGS`): `dispatchHotline: "+1 (555) 991-1111"`.

### 4.2 Audit Findings
1. **Is this a demonstration placeholder?**  
   **YES.** The `+1 (555)` exchange is explicitly reserved under North American Numbering Plan (NANPA) conventions for fictitious, entertainment, and test telephone numbers (specifically `555-0100` through `555-0199` and general fictitious numbers). It does not route to any active telephone subscriber or emergency call center.
2. **Is it currently represented as a real emergency contact?**  
   - In `src/app/settings/page.tsx`, the field is accompanied by a bright green badge: `HOTLINE CONFIGURED`. This gives the impression that a live telephone integration or external PSAP bridge is actively operating.
   - In `src/app/report/page.tsx`, line 386 clearly specifies: `"Internal simulation terminal. In real life-threatening distress, dial 911 or campus dispatch hotline."` However, the badge next to it reads `"DISPATCH: +1 (555) 991-1111"`, which could cause confusion if a user tries to dial it.
3. **Guardrail Check**:  
   We must **NEVER** replace this with an invented real phone number or actual emergency service number.

### 4.3 Recommended Fix (Upon Approval)
1. **Preserve the Fictional Number**: Retain `+1 (555) 991-1111` as the default test configuration.
2. **Explicit Demonstration Labeling in Settings (`src/app/settings/page.tsx`)**:
   - Change the badge to: `HOTLINE CONFIGURED (DEMO SIMULATION)`
   - Add clear helper text: `"Fictional 555-series demonstration number. Not an active emergency telephony bridge. In real life-threatening emergencies, always dial 911."`
3. **Explicit Demonstration Labeling on Public Report Form (`src/app/report/page.tsx`)**:
   - Change the badge to: `DISPATCH SIMULATION: +1 (555) 991-1111 (DEMO)`
   - Maintain the prominent emergency advisory directing real emergencies to 911 / Local Emergency Services.

---

## 5. Summary Matrix & Proposed Implementation Plan

| Issue | Current State | Root Cause | Proposed Solution |
| :--- | :--- | :--- | :--- |
| **1. Hourly Distribution** | Values reach 12–14 (83 total) while KPI shows 3 incidents | Hardcoded `hourlyTrends` array in `src/app/analytics/page.tsx` | Dynamically aggregate `incidents.reportedAt` into 2-hour buckets; $\sum \text{bars} = \text{total}$ |
| **2. Mean Response Time** | UI shows 4.2m; test asserted 3.0m; real data shows 259.5m | UI has hardcoded `4.2` in `IncidentContext.tsx`; test used synthetic +3m fixture; PDF uses real timestamps | Use `calculateResponseTelemetry(incidents, activities)` in `IncidentContext.tsx`; display `null`/`--` if unverified |
| **3. Emergency Hotline** | Displays `+1 (555) 991-1111` with `"HOTLINE CONFIGURED"` badge | Fictional 555 demo number lacks explicit simulation disclaimer in Settings UI | Retain fictional 555 number; add explicit `(DEMO SIMULATION)` badges and PSAP disclaimers in Settings & Report |

---

## 6. Request for User Approval

As per instructions, **no application code or database records have been modified**. 

Awaiting your confirmation to implement the recommended fixes above.

