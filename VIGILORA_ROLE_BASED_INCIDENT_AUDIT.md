# VIGILORA — Role-Based Incident Count & Metrics Audit Report

**Date of Audit:** November 5, 2026  
**Auditor:** Antigravity Advanced Agentic Engineering  
**System Under Audit:** VIGILORA Campus Incident Command & Emergency Dispatch Grid  
**Mode:** Investigation Only (Zero Code, Database, or Infrastructure Modifications)

---

## 1. Executive Verdict & Bottom-Line Assessment

### Is the differing incident count between Admin, Dispatcher, and Responder correct or a bug?

> **VERDICT: THE DIFFERING INCIDENT COUNT IS INTENDED AND CORRECT RBAC BEHAVIOR.**

The observed counts:
- **ADMIN (Supervisor):** 3 total incidents (2 active, 1 resolved) — **CORRECT**
- **DISPATCHER:** 3 total incidents (2 active, 1 resolved) — **CORRECT**
- **RESPONDER:** 1 total incident (0 active, 1 resolved) — **CORRECT**

This behavior is **not a bug**. It is the direct result of VIGILORA's zero-trust Role-Based Access Control (RBAC) architecture enforced at the server API layer (`src/app/api/incidents/route.ts:42-53`):
1. **Admin / Supervisor** (`Chief Inspector Helena Vance`) and **Dispatcher** (`Lead Dispatcher Austin`) are campus-wide coordinators and are authorized to see all incidents across all campus zones.
2. **Responder** (`Officer Vance`, callsign `UNIT-ALPHA-1`, team `MED-01`) is a tactical field unit and is strictly restricted to viewing incidents assigned to `MED-01`.

However, the audit identified **two secondary data-state anomalies** that explain the response time variance (`648.1m` vs. `259.4m`) and an orphaned incident status.

---

## 2. Investigation Phase 1: Detailed Findings (Questions 1–10)

### 1. How incidents are fetched for Admin, Dispatcher, and Responder

1. **Client Hydration:**
   - In `src/context/IncidentContext.tsx`, `refreshAll()` initiates an authenticated `GET /api/incidents` request carrying the browser's HttpOnly session cookie (`vigilora_session`).
2. **Server-Side Authentication & Query:**
   - In `src/app/api/incidents/route.ts`, `authenticateRequest(request, ["Supervisor", "Dispatcher", "Responder"])` verifies the session token against DynamoDB (`SESSION#<hash>`).
   - The route executes a scan-free DynamoDB `QueryCommand` bounded by the campus partition key (`pk = "CAMPUS#METROPOLIS"`, `sk begins_with "INCIDENT#"`).
3. **Role-Based Server-Side Filtering (`src/app/api/incidents/route.ts:42-53`):**
   ```typescript
   // RBAC: Responders may ONLY access incidents assigned to their tactical unit
   if (auth.user.role === "Responder") {
     const responderTeamId = auth.user.teamId;
     const responderCallsign = auth.user.callsign;
     incidents = incidents.filter((i) => {
       if (!i.assignedTeamId && !i.assignedResponder) return false;
       return (
         (responderTeamId && i.assignedTeamId === responderTeamId) ||
         (responderCallsign && i.assignedTeamId === responderCallsign)
       );
     });
   }
   ```
   - **Admin / Dispatcher:** Bypasses this block completely. All queried campus incidents are returned.
   - **Responder:** Filtered strictly to incidents where `assignedTeamId === "MED-01"`.

---

### 2. Authenticated User Profiles & Team Assignments

From `.demo-credentials.json` and session records in DynamoDB:

| Role Key | Name | Authenticated Role (`auth.user.role`) | Assigned Team ID (`auth.user.teamId`) | Tactical Callsign | Authorization Scope |
|:---|:---|:---|:---|:---|:---|
| **Admin** | Chief Inspector Helena Vance | `"Supervisor"` | `undefined` (None) | `CHIEF-SUPERVISOR-1` | Campus-Wide (All Units & Sectors) |
| **Dispatcher** | Lead Dispatcher Austin | `"Dispatcher"` | `undefined` (None) | `DISPATCH-LEAD-1` | Campus-Wide (All Units & Sectors) |
| **Responder** | Officer Vance (Alpha Patrol) | `"Responder"` | `"MED-01"` | `UNIT-ALPHA-1` | Unit Restricted (`MED-01` only) |

---

### 3. Persisted Incident Manifest in DynamoDB

There are currently **three** incident items stored in the production DynamoDB table (`pk = "CAMPUS#METROPOLIS"`):

| Incident ID | Title | Status | Severity | Assigned Team ID | Assigned Responder Name | Reported At (UTC) |
|:---|:---|:---|:---|:---|:---|:---|
| **VIG-2026-171** | Student collapsed near the auditorium | `"Resolved"` | Critical | `"MED-01"` | Medical Response Unit | `2026-11-04T13:16:16.819Z` |
| **VIG-2026-172** | Test Incident Alpha - Electrical Sparking | `"Assigned"` | High | `undefined` (None) | `undefined` (None) | `2026-11-04T13:31:59.283Z` |
| **VIG-2026-173** | Test Incident Beta - Blocked Fire Exit | `"Reported"` | Medium | `undefined` (None) | `undefined` (None) | `2026-11-04T13:32:00.389Z` |

---

### 4. Incident Visibility Matrix by Role

| Incident ID | Title | Admin (Supervisor) | Dispatcher | Responder (`MED-01`) | Reason for Visibility / Exclusion |
|:---|:---|:---:|:---:|:---:|:---|
| **VIG-2026-171** | Student collapsed near auditorium | **VISIBLE** | **VISIBLE** | **VISIBLE** | Assigned to `MED-01`; matches Responder's `teamId`. |
| **VIG-2026-172** | Test Incident Alpha - Electrical Sparking | **VISIBLE** | **VISIBLE** | **HIDDEN** | No team assigned; filtered out by Responder RBAC. |
| **VIG-2026-173** | Test Incident Beta - Blocked Fire Exit | **VISIBLE** | **VISIBLE** | **HIDDEN** | Unassigned in queue; filtered out by Responder RBAC. |
| **Total Visible** | — | **3** | **3** | **1** | **Strict RBAC boundary working as designed.** |

---

### 5. Metric Breakdown & Consistency Across Datasets

In `src/context/IncidentContext.tsx:754-766`, all metrics are calculated from the single role-authorized `incidents` array:

```typescript
const totalIncidents = incidents.length;
const resolvedIncidents = incidents.filter((i) => i.status === "Resolved").length;
const activeIncidents = incidents.filter((i) => i.status !== "Resolved").length;
const criticalIncidents = incidents.filter((i) => i.severity === "Critical" && i.status !== "Resolved").length;
```

#### Comparison Table:

| Metric | Formula | Admin | Dispatcher | Responder | Consistency Check |
|:---|:---|:---:|:---:|:---:|:---|
| **Total Incidents** | `incidents.length` | **3** | **3** | **1** | Consistent with visible set. |
| **Active Incidents** | `status !== "Resolved"` | **2** | **2** | **0** | $172 + 173$ active for Admin; 0 for Responder. |
| **Resolved Incidents** | `status === "Resolved"` | **1** | **1** | **1** | $171$ is Resolved across all roles. |
| **Critical Incidents (Active)** | `severity === "Critical" && status !== "Resolved"` | **0** | **0** | **0** | $171$ is Critical but Resolved, so active critical is 0. |
| **Sum Invariant** | `Active + Resolved === Total` | $2 + 1 = 3$ | $2 + 1 = 3$ | $0 + 1 = 1$ | **100% Invariant Preserved**. |

---

### 6. Severity Filter & Interactive Filtering Behavior

In `src/app/page.tsx`:
1. **Top KPI Strip (Total, Active, Critical, Resolved, Avg Response):**
   - Reflects the **total baseline dataset authorized for that role**.
   - It is intentionally stationary so operators always know their shift workload total regardless of temporary filter clicks.
2. **Queue Data Table & Tactical Campus Map:**
   - Dynamically filtered by `selectedSeverities`, `selectedCategory`, `selectedStatus`, and `searchQuery`.
   - If an Admin checks `"Critical"`, the table displays only `VIG-2026-171`.
   - If a Responder checks `"Critical"`, the table displays `VIG-2026-171`.
   - If a Responder checks `"High"` or `"Medium"`, the table displays 0 records (since $172$ and $173$ are not in the Responder's authorized dataset).
   - This filtering behavior is consistent across all views.

---

### 7. How Average Response Time is Calculated for Each Role

Response telemetry is evaluated by `calculateResponseTelemetry(incidents, activities)` in `src/lib/telemetry.ts`:
1. The calculation takes the user's role-authorized `incidents` list.
2. For each incident in that list, it looks for verified dispatch activity in `activities`.
3. It finds the **earliest initial dispatch timestamp** ($T_{\text{dispatch}}$) and calculates:
   $$\Delta = T_{\text{dispatch}} - T_{\text{reported}}$$
4. It computes the arithmetic mean:
   $$\text{Mean} = \frac{\sum \Delta}{N}$$

Because the Responder's `incidents` list contains only 1 incident (`VIG-2026-171`), while the Admin's list contains 3 incidents, the calculation operates over different sample sets.

---

### 8. Why Admin and Dispatcher Showed 648.1m while Responder Showed 259.4m

This was an exact mathematical consequence of two test activities in DynamoDB:

1. **Incident VIG-2026-171 (Assigned to MED-01):**
   - Reported at: `2026-11-04T13:16:16.819Z`
   - Initial test dispatch activity: `2026-11-04T17:35:40.000Z`
   - Elapsed delta: $17:35:40 - 13:16:16 = \mathbf{259.4\text{ minutes}}$ (4 hours, 19.4 minutes).

2. **Incident VIG-2026-172 (Test Incident Alpha):**
   - Reported at: `2026-11-04T13:31:59.283Z`
   - Status transitioned to `"Assigned"` during test suite: `2026-11-05T06:48:44.925Z`
   - Elapsed delta: $06:48:44 \text{ (Nov 5)} - 13:31:59 \text{ (Nov 4)} = \mathbf{1036.8\text{ minutes}}$ (17 hours, 16.8 minutes).

3. **Incident VIG-2026-173 (Test Incident Beta):**
   - Status is `"Reported"`; no dispatch activity exists (omitted from delta calculations).

#### The Role-Based Calculation:
- **For Responder (`Officer Vance`):**
  - Only `VIG-2026-171` is visible.
  - Eligible deltas: `[259.4]`
  - Displayed Mean: $\frac{259.4}{1} = \mathbf{259.4\text{m}}$
- **For Admin / Dispatcher:**
  - Both `VIG-2026-171` and `VIG-2026-172` are visible.
  - Eligible deltas: `[259.4, 1036.8]`
  - Displayed Mean: $\frac{259.4 + 1036.8}{2} = \frac{1296.2}{2} = \mathbf{648.1\text{m}}$

#### Why This Was Misleading:
The 259.4m and 1036.8m deltas were **synthetic test artifacts** created when automated test scripts updated historical seed records hours or days after their reported timestamps. 

Under the strict real-data rules implemented in `src/lib/telemetry.ts`, seed and test fixture records (`VIG-2026-171`, `VIG-2026-172`, `VIG-2026-173`) are now quarantined. In a live system without genuine non-seed dispatches, both roles now honestly display `--` alongside `INSUFFICIENT VERIFIED RESPONSE DATA`.

---

### 9. Whether Demo/Seed Records Are Included in Operational Analytics

- **In Response Telemetry:** **NO.** Seed records (`VIG-2026-171`, `172`, `173`) and demo fixtures (`VIG-2026-079`–`089`) are strictly quarantined and excluded by `isGenuineIncident()`.
- **In Analytics Overview (`src/app/analytics/page.tsx`):**
  - **Category Breakdown & Sector Density:** Currently aggregates the raw `incidents` returned by `GET /api/incidents`. Therefore, the 3 seed items are included in the category distribution and sector density for Admin/Dispatcher, and 1 seed item is included for Responder.
  - **Resolution Rate:** Computed as $\frac{\text{Resolved}}{\text{Total}}$. Admin/Dispatcher displays $1/3 = 33\%$; Responder displays $1/1 = 100\%$.
- **In Dashboard Visualizations (`IncidentTrendChart` and `IncidentActivityHeatmap`):**
  - These two standalone components currently render static aesthetic reference matrices (`TREND_DATA` and `HEATMAP_MATRIX`) rather than live DynamoDB data.

---

### 10. Audit of Missing, Duplicated, or Incorrectly Assigned Incidents

1. **Missing Incidents:** **None.** All 3 persisted incidents in DynamoDB are retrieved and accounted for.
2. **Duplicated Incidents:** **None.** Each incident ID appears exactly once in the dataset.
3. **Assignment Anomalies Identified:**
   - **`VIG-2026-172` Orphaned Status:** Status is `"Assigned"`, but `assignedTeamId` is `undefined`. This occurred because a past test or PATCH request transitioned status to `"Assigned"` without executing a transactional unit assignment through `/api/incidents/[id]/assign`.
   - **`VIG-2026-171` Historical Assignment:** Status is `"Resolved"`, but `assignedTeamId` remains `"MED-01"`. The team `MED-01` itself is correctly set to `"Available"` in the team roster. Preserving historical `assignedTeamId` on resolved records is why Responder sees 1 resolved incident.

---

## 3. Comparison Summary Table

| Feature / Metric | Admin (Supervisor) | Lead Dispatcher | Field Responder (`MED-01`) | Status / Assessment |
|:---|:---:|:---:|:---:|:---|
| **Incident Scope** | Campus-Wide (3 items) | Campus-Wide (3 items) | Unit Assigned (1 item) | **Correct RBAC** |
| **Total Incidents** | 3 | 3 | 1 | **Correct** |
| **Active Incidents** | 2 | 2 | 0 | **Correct** |
| **Resolved Incidents** | 1 | 1 | 1 | **Correct** |
| **Critical Incidents (Active)** | 0 | 0 | 0 | **Correct** |
| **Resolution Rate** | 33% (1/3) | 33% (1/3) | 100% (1/1) | **Mathematically Sound** |
| **Legacy Response Time** | 648.1m | 648.1m | 259.4m | **Resolved via Strict Real-Data Quarantining** |
| **Current Response Time** | `--` | `--` | `--` | **Strict Real-Data Honesty Standard** |

---

## 4. Confirmed Bugs & Recommended Fixes

### Confirmed Issues:

| Issue | Severity | Root Cause | Recommended Fix |
|:---|:---:|:---|:---|
| **1. Orphaned "Assigned" Status on VIG-2026-172** | Low | Incident status was set to `"Assigned"` via direct PATCH without assigning a tactical unit (`assignedTeamId: undefined`). | Update `VIG-2026-172` status to `"Under review"` or assign an available tactical unit (e.g., `SEC-01` or `FIRE-01`) through the assign transaction. |
| **2. Synthetic Test Delays in Historical Data** | Low | Automated test scripts dispatched units hours/days after reported timestamps, causing artificial 259m and 1036m response times. | Handled by `isGenuineIncident()` quarantining; for future production testing, ensure synthetic test events are isolated to test campuses (`CAMPUS#TEST`). |
| **3. Static Dashboard Trend & Heatmap Charts** | Low | `IncidentTrendChart` and `IncidentActivityHeatmap` use hardcoded demo arrays instead of deriving from live `incidents`. | (Optional future improvement) Wire `IncidentTrendChart` to live daily counts and `IncidentActivityHeatmap` to actual sector-by-day activity. |

---

## 5. Final Conclusion for Operators & Evaluators

1. **The incident counts are correct:** Admin (3), Dispatcher (3), and Responder (1) reflect correct, verified role-based access control. No code change is needed for incident counts.
2. **The metrics are consistent:** All counts ($Active + Resolved = Total$) derive from the exact same role-authorized dataset.
3. **Response time variance is resolved:** The 648.1m vs. 259.4m discrepancy was caused by historical test delays on seed records and is now strictly suppressed to `--` with `INSUFFICIENT VERIFIED RESPONSE DATA` until genuine real incidents are dispatched.

