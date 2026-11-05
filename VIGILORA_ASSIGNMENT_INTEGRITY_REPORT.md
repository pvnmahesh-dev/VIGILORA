# VIGILORA — Incident Assignment Integrity & Workflow Fix Report

**Date**: 2026-11-05  
**Audit Context**: Investigation and remediation of inconsistent incident `VIG-2026-172` (`Status: Assigned`, `assignedTeamId: undefined`)  
**Status**: COMPLETE & VERIFIED (63/63 Regression Tests Passed, Clean TypeScript Typecheck, Production Next.js Build Succeeded)

---

## 1. Executive Summary & Root Cause Analysis

### The Inconsistency
During the role-based incident count and RBAC audit, incident **`VIG-2026-172`** was identified in DynamoDB with:
- `id`: `VIG-2026-172`
- `status`: `"Assigned"`
- `assignedTeamId`: `undefined`
- `assignedResponder`: `undefined`

### Root Cause
1. **Unchecked Status Transition in `PATCH /api/incidents/[id]`**:
   In `src/app/api/incidents/[id]/route.ts`, the standard incident update route accepted `{ status: "Assigned" }` or `{ status: "Responding" }`. While it passed the status transition state machine (`"Reported" -> "Assigned"` was defined as an allowed state in `VALID_STATUS_TRANSITIONS`), the validation function **never verified whether an assigned tactical unit existed** on the incident.
2. **Missing Assignment Invariant Guard**:
   The `PATCH` handler executed a DynamoDB `TransactWriteCommand` updating `status` to `"Assigned"`, while leaving `assignedTeamId` completely absent.
3. **Bypass of Atomic Dispatch Workflow**:
   The proper dispatch workflow was implemented in `POST /api/incidents/[id]/assign`, which performs atomic transactions across both the Incident item and the Team item. However, the generic `PATCH` route allowed callers (or manual test scripts) to set the status string directly without dispatching a unit.

---

## 2. Structural Fixes & Invariant Enforcement

### Invariant 1: State Machine Transition Guard (`src/lib/validation.ts`)
Updated `validateIncidentStatusTransition` to accept the boolean parameter `hasAssignedTeam?: boolean`. If a caller attempts to transition an incident into `"Assigned"` or `"Responding"` without an assigned tactical unit, the transition is strictly rejected:

```typescript
// src/lib/validation.ts
export function validateIncidentStatusTransition(
  currentStatus: IncidentStatus,
  targetStatus: IncidentStatus,
  userRole: string,
  hasAssignedTeam?: boolean
): { valid: boolean; error?: string } {
  // ... allowed state machine checks ...

  // Invariant: An incident cannot enter "Assigned" or "Responding" without a valid assigned tactical unit
  if ((targetStatus === "Assigned" || targetStatus === "Responding") && !hasAssignedTeam) {
    return {
      valid: false,
      error: `Cannot transition incident to "${targetStatus}" without an assigned tactical response unit. Use the tactical unit assignment workflow.`,
    };
  }

  return { valid: true };
}
```

### Invariant 2: Backend API Rejection (`src/app/api/incidents/[id]/route.ts`)
1. In `PATCH /api/incidents/[id]`, passes `Boolean(current.assignedTeamId)` into `validateIncidentStatusTransition`.
2. Added an explicit guard:
   ```typescript
   // Explicit invariant: An unassigned incident cannot enter "Assigned" or "Responding" status via PATCH
   if ((updates.status === "Assigned" || updates.status === "Responding") && !current.assignedTeamId) {
     return NextResponse.json(
       {
         success: false,
         error: `Cannot transition incident to "${updates.status}" without an assigned tactical response unit. Use the tactical unit assignment workflow.`,
         currentStatus: current.status,
         attemptedStatus: updates.status,
       },
       { status: 422 }
     );
   }
   ```
   Any attempt to transition an unassigned incident to `"Assigned"` or `"Responding"` returns **HTTP 422 Unprocessable Entity**.

### Invariant 3: Robust Team Validation in Dispatch Endpoint (`src/app/api/incidents/[id]/assign/route.ts`)
All unit assignments are strictly channeled through `POST /api/incidents/[id]/assign`:
- **Team ID Requirement**: Must be non-empty string; rejects with **HTTP 400**.
- **Resolved Incident Protection**: Rejects assignment to resolved incidents with **HTTP 409 Conflict**.
- **DynamoDB Roster Existence**: Looks up target team strictly in DynamoDB (`getTeam(teamId, campusId)`); rejects non-existent teams with **HTTP 404 Not Found**.
- **Off-Duty Guard**: Rejects assignment of off-duty units with **HTTP 409 Conflict**.
- **Availability / Concurrency Check**: If the unit is already committed to another active incident, rejects with **HTTP 409 Conflict** (`Tactical unit ... is currently committed to incident ...`).
- **Atomic Multi-Item Transaction**: Updates Incident item, Team item (`status: "En Route"`, `activeIncidentId`), and generates an audit activity (`type: "dispatch"`) inside a single atomic DynamoDB `TransactWriteCommand`. If any check fails, the transaction is aborted with zero mutations.
- **Unassign Invariant**: Unassigning a unit automatically reverts an incident from `"Assigned"` back to `"Under review"` and returns the tactical unit to `"Available"`.

### Invariant 4: Frontend Client Guards (`src/context/IncidentContext.tsx` & `src/app/incidents/page.tsx`)
1. **`IncidentContext.tsx`**: `updateIncidentStatus` validates `currentInc?.assignedTeamId` before sending a network request when moving to `"Assigned"` or `"Responding"`.
2. **`src/app/incidents/page.tsx`**: In `handleUpdateStatus`, clicking `"Assigned"` or `"Responding"` on an unassigned incident triggers an immediate warning:
   > *"Cannot transition incident to '{status}' without an assigned tactical unit. Please dispatch a unit from the roster below."*

---

## 3. Strict Database & Entity Preservation

In strict accordance with requirements:
- **`VIG-2026-172` Record Preserved**: No automatic or arbitrary assignment was made to `VIG-2026-172`.
- **Zero Unauthorized Mutations**: DynamoDB records were inspected via scan-free queries and left in their exact authentic state.
- **Current Live Status in DynamoDB**:
  - `VIG-2026-171`: `Resolved` (assigned: `none`, unit was released upon resolution)
  - `VIG-2026-172`: `Assigned` (assigned: `none` — awaiting operator direction)
  - `VIG-2026-173`: `Reported` (assigned: `none`)
  - Response Units: `FIRE-01` (Available), `MED-01` (Available), `SEC-01` (Available)

### Recommended Action for `VIG-2026-172` (Upon Operator Approval)
When approved, an operator can simply:
1. Dispatch an appropriate unit (e.g., `SEC-01` or `FIRE-01`) via the Dispatcher UI or `POST /api/incidents/VIG-2026-172/assign`, which will populate `assignedTeamId` atomically; **OR**
2. Move `VIG-2026-172` to `"Under review"` via `PATCH /api/incidents/VIG-2026-172` with `{ status: "Under review" }` (allowed by the state machine), returning it to a valid unassigned state.

---

## 4. RBAC Preservation & Permissions Matrix

| Capability | Supervisor (Admin) | Dispatcher | Responder (Officer Vance, MED-01) |
| :--- | :---: | :---: | :---: |
| **Incident Visibility** | Campus-wide (All incidents) | Campus-wide (All incidents) | Assigned incidents only (`MED-01`) |
| **Assign / Dispatch Units** | Authorized | Authorized | **Forbidden (HTTP 403)** |
| **Unassign Units** | Authorized | Authorized | **Forbidden (HTTP 403)** |
| **Update Incident Narrative/Details** | Authorized | Authorized | **Forbidden (HTTP 403)** |
| **Update Operational Status** | Authorized | Authorized (non-resolved) | Authorized (assigned incident only) |
| **Re-open Resolved Incidents** | Authorized | **Forbidden (HTTP 422)** | **Forbidden (HTTP 403)** |

---

## 5. Verification & Test Battery Results

A comprehensive automated regression suite was created in [`scripts/test-assignment-integrity.ts`](file:///c:/Users/testp/Desktop/PROJECTS/VIGILORA/scripts/test-assignment-integrity.ts).

### Test Suite Execution Summary

```
================================================================================
     VIGILORA — INCIDENT ASSIGNMENT INTEGRITY REGRESSION TEST SUITE
================================================================================

[SETUP: Authenticating Test Sessions]
  [PASS] Supervisor/Admin session authenticated
  [PASS] Dispatcher session authenticated
  [PASS] Field Responder session authenticated (Officer Vance, MED-01)

[SCENARIO 1: Assigned Incident with Valid Team]
  [PASS] Created test incident VIG-2026-196
  [PASS] Initial status is 'Reported'
  [PASS] Initial assignedTeamId is undefined
  [PASS] POST /assign returns HTTP 200 for valid team SEC-01
  [PASS] Assignment reports success = true
  [PASS] Incident status transitioned to 'Assigned'
  [PASS] assignedTeamId is 'SEC-01'
  [PASS] assignedResponder is 'Campus Security Unit'
  [PASS] Activity event of type 'dispatch' created
  [PASS] Persistent status in DynamoDB is 'Assigned'
  [PASS] Persistent assignedTeamId in DynamoDB is 'SEC-01'
  [PASS] SEC-01 status transitioned to 'En Route'
  [PASS] SEC-01 activeIncidentId is VIG-2026-196
  [PASS] Unassigned SEC-01 successfully (HTTP 200)
  [PASS] Unassign reverts incident status to 'Under review'
  [PASS] assignedTeamId cleared after unassign

[SCENARIO 2: Assigned Incident Without a Team — Invariant Rejection]
  [PASS] Created test incident VIG-2026-197
  [PASS] validateIncidentStatusTransition rejects 'Assigned' when hasAssignedTeam=false
  [PASS] Validation error mentions tactical response unit requirement
  [PASS] validateIncidentStatusTransition permits 'Assigned' when hasAssignedTeam=true
  [PASS] validateIncidentStatusTransition rejects 'Responding' when hasAssignedTeam=false
  [PASS] PATCH /api/incidents/[id] with status='Assigned' on unassigned incident returns HTTP 422
  [PASS] Response reports success = false
  [PASS] Clear structured error returned: "Cannot transition incident to 'Assigned' without an assigned tactical response unit. Use the tactical unit assignment workflow."
  [PASS] PATCH /api/incidents/[id] with status='Responding' on unassigned incident returns HTTP 422
  [PASS] Incident in DynamoDB remains 'Reported'
  [PASS] Incident in DynamoDB assignedTeamId remains undefined

[SCENARIO 3: Invalid Team ID Rejection]
  [PASS] Created test incident VIG-2026-198
  [PASS] POST /assign with non-existent team returns HTTP 404
  [PASS] Response reports success = false
  [PASS] Clear 404 error returned: "Target tactical unit 'PHANTOM-UNIT-999' was not found in campus roster."
  [PASS] POST /assign with empty teamId returns HTTP 400
  [PASS] Incident status remains 'Reported' after invalid assignment
  [PASS] Incident assignedTeamId remains undefined

[SCENARIO 4: Failed Assignment Preserves Previous Incident State]
  [PASS] POST /assign to already resolved incident returns HTTP 409 Conflict
  [PASS] Clear 409 error: "Cannot assign tactical unit to an already resolved incident."
  [PASS] VIG-2026-171 remains 'Resolved'
  [PASS] Created test incident VIG-2026-199
  [PASS] Created test incident VIG-2026-200
  [PASS] FIRE-01 assigned to VIG-2026-199
  [PASS] Assigning committed unit returns HTTP 409 Conflict
  [PASS] Clear 409 error: "Tactical unit 'Fire & Safety Response Unit' (FIRE-01) is currently committed to incident VIG-2026-199."
  [PASS] Target incident status remains 'Reported'
  [PASS] Target incident assignedTeamId remains undefined
  [PASS] Unassigning an unassigned incident returns HTTP 400
  [PASS] Clear error message: "Incident does not have a tactical unit currently assigned."

[SCENARIO 5: Responder Visibility After Assignment]
  [PASS] Created test incident VIG-2026-201
  [PASS] GET /api/incidents as Responder returns HTTP 200
  [PASS] Unassigned incident is NOT visible to Responder
  [PASS] VIG-2026-172 (unassigned) is NOT visible to Responder
  [PASS] VIG-2026-173 (unassigned) is NOT visible to Responder
  [PASS] MED-01 assigned to incident VIG-2026-201
  [PASS] Assigned incident is NOW visible to Responder (MED-01)
  [PASS] Returned incident has assignedTeamId='MED-01'
  [PASS] MED-01 unassigned from VIG-2026-201
  [PASS] Unassigned incident is immediately NO LONGER visible to Responder
  [PASS] Field Responder is FORBIDDEN from assigning teams (HTTP 403 Forbidden)

[CLEANUP: Removing Temporary Test Incidents]
  Cleaned up 6 temporary test records.
  [PASS] Team FIRE-01 returned to safe status (Available)
  [PASS] Team MED-01 returned to safe status (Available)
  [PASS] Team SEC-01 returned to safe status (Available)

================================================================================
  ASSIGNMENT INTEGRITY REGRESSION SUITE: 63 PASSED | 0 FAILED
================================================================================
```

### Full Regression Test Summary
- **Assignment Integrity Suite**: 63 PASSED | 0 FAILED ([`scripts/test-assignment-integrity.ts`](file:///c:/Users/testp/Desktop/PROJECTS/VIGILORA/scripts/test-assignment-integrity.ts))
- **Role Indicator Suite**: 56 PASSED | 0 FAILED ([`scripts/test-role-indicator.ts`](file:///c:/Users/testp/Desktop/PROJECTS/VIGILORA/scripts/test-role-indicator.ts))
- **Analytics Data Integrity Suite**: 50 PASSED | 0 FAILED ([`scripts/test-analytics-integrity.ts`](file:///c:/Users/testp/Desktop/PROJECTS/VIGILORA/scripts/test-analytics-integrity.ts))
- **TypeScript Typecheck (`npx tsc --noEmit`)**: 0 errors
- **Production Build (`npm run build`)**: 28/28 routes compiled cleanly, exit code 0

