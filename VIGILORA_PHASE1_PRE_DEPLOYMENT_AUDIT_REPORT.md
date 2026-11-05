# VIGILORA Phase 1: Pre-Deployment Source Code Audit Report

**Document**: `VIGILORA_PHASE1_PRE_DEPLOYMENT_AUDIT_REPORT.md`  
**Date**: November 4, 2026  
**Status**: STRICT READ-ONLY AUDIT COMPLETE — PENDING OPERATOR AUTHORIZATION  
**Target AWS Region**: `eu-north-1` (Stockholm)  
**Target Account**: `399527676157`  
**Auditor**: Antigravity Technical Lead  

---

## Executive Summary & Audit Verdict Matrix

Prior to executing Phase 1 implementation for AWS ECS Fargate deployment, a strict read-only audit of the VIGILORA codebase was conducted. No files were modified, created, deleted, or renamed. No AWS resources, IAM roles, or policies were altered.

| Audit Focus | Scope | Result | Key Operational Finding |
|---|---|:---:|---|
| **Audit 1: Health Endpoint** | `src/app/api/health/*` | **FAIL** | `GET /api/health` **does not exist** (returns 404). Existing `GET /api/health/aws` requires Supervisor session auth and queries downstream AWS services; it is completely unsuitable for ALB health checks. |
| **Audit 2: Existing Upload** | `src/app/api/upload/route.ts`, S3/DDB flow | **PASS** | Current workflow is robust, secure, and authenticated, but buffers up to 10 MB in Node.js server RAM before writing to S3 and DynamoDB. |
| **Audit 3: Object-Key Format** | S3 key generator & `src/lib/validation.ts` | **FAIL** | Keys **do not** follow `evidence/<campus>/<incident>/<uuid>.<ext>`. The real generator enforces `evidence/<cleanCampus>/<cleanInc>/<timestamp>-<uuid>.<ext>`. Omitting the timestamp prefix causes `validateS3Key()` to reject the key. |
| **Audit 4: Presigned Upload** | Compatibility for Option A endpoints | **PASS** | Fully compatible with zero breaking changes to `EvidenceViewer.tsx` or `report/page.tsx`. Requires installing `@aws-sdk/s3-presigned-post` and adding the two endpoints. |
| **Audit 5: IAM and KMS** | Task Execution Role & SSM KMS Decrypt | **PASS** | Verified against AWS ECS documentation: `kms:Decrypt` is required **only** when using a Customer-Managed Key (CMK), and must be omitted if using the default AWS-managed key `alias/aws/ssm`. |

---

## 1. Audit 1 — Health Endpoint Deep Dive

### 1.1 Existing Route Inventory
Inspection of `src/app/api/` reveals that **no route handler exists at `src/app/api/health/route.ts`**.
A request to `GET /api/health` currently results in **HTTP 404 Not Found**.

The only existing health check endpoint is:
`src/app/api/health/aws/route.ts` (`GET /api/health/aws`)

### 1.2 Inspection of `GET /api/health/aws`
```typescript
// src/app/api/health/aws/route.ts (lines 5-10)
export async function GET(request: Request) {
  // Enforce verified Supervisor-only authorization
  const authResult = await authenticateRequest(request, ["Supervisor"]);
  if ("errorResponse" in authResult) {
    return authResult.errorResponse;
  }
  // ... executes checkAwsHealth() which calls DescribeTable and HeadBucket ...
```

### 1.3 Assessment Criteria Evaluation:
1. **Does `GET /api/health` exist?**  
   **NO**. It returns HTTP 404.
2. **Can it return HTTP 200 without requiring authentication?**  
   **NO**. The existing `/api/health/aws` route strictly enforces `authenticateRequest(request, ["Supervisor"])`. Any unauthenticated request receives **HTTP 401 Unauthorized**.
3. **Does it expose secrets, database details, or internal infrastructure information?**  
   **YES**. `/api/health/aws` returns the exact DynamoDB table name (`VIGILORA-Main`), table status (`ACTIVE`), S3 bucket name (`vigilora-evidence-399527676157-eu-north-1-an`), AWS region (`eu-north-1`), and the checking supervisor's email address.
4. **Is it suitable for an ALB health check?**  
   **DEFINITIVELY NO**:
   - **Fatal Failure Loop**: The AWS Application Load Balancer probe does not carry session cookies. Pointing the ALB target group to `/api/health/aws` causes the ALB to receive HTTP 401 on every check, marking all ECS tasks as `Unhealthy` and triggering continuous task replacement and service downtime.
   - **Deep Dependency Polling**: An ALB health check must be a shallow liveness probe verifying that the container's Node.js HTTP server is accepting connections on port 3000. It must **not** perform active DynamoDB `DescribeTable` and S3 `HeadBucket` queries on every 15-30 second interval across multiple tasks, which wastes AWS API rate limits and creates synthetic failures if AWS experiences transient latency.

### 1.4 Required Action:
Create a dedicated, lightweight `GET /api/health` endpoint at `src/app/api/health/route.ts` that:
- Requires **zero authentication**.
- Performs **zero downstream AWS calls**.
- Returns HTTP 200 with `{ "status": "ok", "timestamp": "..." }`.
- Completes in < 5 milliseconds with zero information exposure.

---

## 2. Audit 2 — Existing Evidence Upload Workflow

### 2.1 Complete Request-to-Storage Architecture
The current upload pipeline operates as a **server-mediated buffer proxy**:

```
[Browser: report/page.tsx]
       │
       ▼  1. POST /api/incidents (Commit INCIDENT#<id> to DynamoDB)
[DynamoDB: VIGILORA-Main]
       │
       ▼  2. POST /api/upload (Multipart form data: 'file' + 'incidentId')
[Next.js Server: api/upload/route.ts]
       ├─► 3. authenticateRequest(request, ["Supervisor","Dispatcher","Responder","Reporter"])
       ├─► 4. Verify incidentId exists in caller's campus (DynamoDB GetCommand)
       ├─► 5. Validate MIME (image/jpeg, image/png, image/webp) & Size (100B - 10MB)
       ├─► 6. Buffer entire file in server RAM: const buffer = Buffer.from(await file.arrayBuffer())
       ├─► 7. validateImageMagicBytes(buffer, reportedMime)
       ├─► 8. Generate safe S3 key: evidence/<cleanCampus>/<cleanInc>/<timestamp>-<uuid>.<ext>
       ├─► 9. Upload buffer to S3: s3Client.send(new PutObjectCommand({ ... ServerSideEncryption: "AES256" }))
       ├─► 10. Atomic DynamoDB TransactWriteCommand:
       │        - Insert EVIDENCE#<evidenceId> record
       │        - Update INCIDENT#<incidentId> (hasPhoto=true, photoUrl=/api/evidence/<id>)
       └─► 11. [Failure Handler]: If TransactWriteCommand fails, execute DeleteObjectCommand on S3 (Rollback)
       │
       ▼  12. Client receives { success: true, data: { id, url: "/api/evidence/<id>" } }
```

### 2.2 Evidence Retrieval Workflow
1. The frontend (`EvidenceViewer.tsx`) renders:
   ```tsx
   <img src={photoUrl} ... />
   ```
   where `photoUrl` is `/api/evidence/${evidenceId}`.
2. The browser requests `GET /api/evidence/[id]` with its HttpOnly session cookie.
3. `src/app/api/evidence/[id]/route.ts`:
   - Authenticates the session and checks campus boundary (`pk: auth.user.campusId`, `sk: EVIDENCE#${id}`).
   - Verifies the associated incident exists in the caller's campus.
   - Validates S3 key format with `validateS3Key(key)`.
   - Fetches the object via `GetObjectCommand` from private S3 and streams it as a Web `ReadableStream` with strict security headers (`X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `X-Frame-Options: DENY`).

### 2.3 Strengths & Bottlenecks
- **Strengths**: Campus isolation is strictly enforced; magic bytes are verified; atomic transactions prevent inconsistent incident states; orphaned S3 objects are rolled back on database failure.
- **Bottlenecks**: Up to 10 MB of binary image data passes through Node.js container memory twice (upload buffer and streaming retrieval). In a 0.5 GB RAM Fargate container, concurrent 10 MB uploads create memory pressure and risk container OOM kills.

---

## 3. Audit 3 — Exact S3 Object-Key Generator & Schema Verification

### 3.1 Actual Code Implementation
The generator is located in `src/app/api/upload/route.ts` lines 166-170:

```typescript
const cleanCampus = auth.user.campusId.replace(/[^a-zA-Z0-9_-]/g, "_");
const cleanInc = incidentId.replace(/[^a-zA-Z0-9_-]/g, "_");
const uniqueSegment = `${Date.now()}-${crypto.randomUUID()}`;
const s3Key = `evidence/${cleanCampus}/${cleanInc}/${uniqueSegment}.${ext}`;
```

### 3.2 Key Validation Rule
The format is strictly enforced by `validateS3Key()` in `src/lib/validation.ts` line 63-64:

```typescript
export const S3_KEY_REGEX =
  /^evidence\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[0-9]+-[0-9a-fA-F-]+\.(jpg|jpeg|png|webp)$/;

export function validateS3Key(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  return S3_KEY_REGEX.test(key);
}
```

### 3.3 Comparison with Hypothetical Format

| Component | Assumed Format (`evidence/<campus>/<incident>/<uuid>.<ext>`) | Actual Implementation | Impact of Discrepancy |
|---|---|---|---|
| **Campus Segment** | `<campus>` | `<cleanCampus>` (all non-alphanumeric chars replaced with `_`) | `CAMPUS#METROPOLIS` becomes `CAMPUS_METROPOLIS`. Passing `#` breaks regex. |
| **Incident Segment** | `<incident>` | `<cleanInc>` (sanitized alphanumeric/dash) | Sanitized against directory traversal. |
| **File Identifier** | `<uuid>.<ext>` | **`${Date.now()}-${crypto.randomUUID()}.${ext}`** | **CRITICAL**: The regex `[0-9]+-[0-9a-fA-F-]+` **mandates** the numeric timestamp prefix (`Date.now()-`). |

> [!CAUTION]
> If `POST /api/upload/authorize` generates keys using the simplified format `evidence/<campus>/<incident>/<uuid>.<ext>` without `${Date.now()}-`, **`validateS3Key(s3Key)` will evaluate to FALSE**. This will cause `POST /api/upload/complete` and `GET /api/evidence/[id]` to reject valid uploads with HTTP 400 (`"Invalid storage key reference"`). The generator in the proposed authorize route **must strictly use `${Date.now()}-${crypto.randomUUID()}`**.

---

## 4. Audit 4 — Presigned Upload Compatibility (Option A)

### 4.1 Proposed Endpoints
1. `POST /api/upload/authorize`: Generates S3 Presigned POST policy and fields.
2. `POST /api/upload/complete`: Verifies S3 upload integrity and commits DynamoDB metadata transaction.

### 4.2 Preservation of Security Invariants

| Security Invariant | How It Is Preserved in Option A |
|---|---|
| **Campus Isolation** | Both `/authorize` and `/complete` call `authenticateRequest()`, binding operations strictly to `auth.user.campusId`. S3 key is constructed server-side; the client cannot choose its own S3 key. |
| **Incident Ownership** | `/authorize` verifies `INCIDENT#${incidentId}` in DynamoDB under the caller's campus PK before issuing presigned credentials. |
| **MIME Type Validation** | Presigned POST policy condition: `['eq', '$Content-Type', mimeType]`. S3 edge rejects mismatched Content-Type. |
| **Size Limit (100B - 10MB)** | Presigned POST policy condition: `['content-length-range', 100, 10485760]`. S3 terminates transfers exceeding 10 MB with `400 EntityTooLarge` directly at the storage edge. |
| **Magic-Byte Integrity** | In `/complete`, server executes `GetObjectCommand` with `Range: "bytes=0-63"`. Only **64 bytes** are downloaded over internal AWS fiber ($0.00 data transfer, <20ms, negligible RAM). `validateImageMagicBytes()` inspects the header. If invalid, `DeleteObjectCommand` purges the S3 object and returns HTTP 400. |
| **DynamoDB Metadata** | `/complete` executes the identical `TransactWriteCommand` (`EVIDENCE#${evidenceId}` + `INCIDENT#${incidentId}`). |
| **Orphan Cleanup** | If magic bytes fail or DynamoDB transaction fails, server executes `DeleteObjectCommand`. Uncommitted S3 objects (uploaded but `/complete` never called) are covered by S3 lifecycle rules. |
| **EvidenceViewer Functionality** | **100% Unchanged**. `EvidenceViewer.tsx` continues to point to `/api/evidence/${id}`. No raw S3 URLs are exposed to the client. |

### 4.3 Missing Dependencies & Frontend Changes
- **Missing Dependency**: `@aws-sdk/s3-presigned-post` is **not installed** in `package.json` or `node_modules`. It must be added to dependencies before implementing `createPresignedPost`.
- **Frontend Components**:
  - `src/components/evidence/EvidenceViewer.tsx`: **ZERO changes required**.
  - `src/app/report/page.tsx`: **ZERO changes required** (continues calling `uploadEvidence(incidentId, file)`).
  - `src/context/IncidentContext.tsx`: Update `uploadEvidence` internal implementation to execute:
    1. `fetch('/api/upload/authorize', ...)`
    2. `fetch(s3Url, { method: 'POST', body: s3FormData })`
    3. `fetch('/api/upload/complete', ...)`

---

## 5. Audit 5 — IAM and KMS Resolution Mechanics

### 5.1 AWS ECS Documentation Verification
According to AWS ECS documentation on *Specifying sensitive data using Systems Manager Parameter Store*:

1. **Default AWS-Managed Key (`alias/aws/ssm`)**:
   - Systems Manager automatically grants the ECS task execution role access to decrypt parameters encrypted with the default AWS-managed KMS key.
   - **`kms:Decrypt` permission is NOT required** in the Task Execution Role when using the default key.
   - Attempting to attach an explicit `kms:Decrypt` statement on `alias/aws/ssm` will fail or cause policy validation errors because alias ARNs are invalid in IAM `Resource` fields.
2. **Customer-Managed Keys (CMK)**:
   - If the parameter is encrypted with a Customer-Managed Key (CMK), the task execution role **must** have explicit `kms:Decrypt` permission.
   - The IAM policy `Resource` field **must specify the exact Key ARN** (`arn:aws:kms:region:account:key/<UUID>`), never an alias.

### 5.2 Required Policy Alignment in Plan:
The master deployment plan must conditionally specify:
- **Case A (Standard - Default Key)**: Omit `KmsDecryptSecret` statement from `VigiloraEcsTaskExecutionRole`.
- **Case B (Custom CMK)**: Include `KmsDecryptSecret` scoped strictly to `arn:aws:kms:eu-north-1:399527676157:key/<RESOLVED_CMK_UUID>`.

---

## 6. Exact Files Requiring Modification or Creation

```
+──────────────────────────────────────────+─────────────────+─────────────────────────────────────────────────────────+
| FILE PATH                                | ACTION          | PURPOSE                                                 |
+──────────────────────────────────────────+─────────────────+─────────────────────────────────────────────────────────+
| src/app/api/health/route.ts              | CREATE (NEW)    | Unauthenticated ALB liveness probe (HTTP 200)           |
| src/app/api/upload/authorize/route.ts    | CREATE (NEW)    | Authenticated S3 Presigned POST policy generator         |
| src/app/api/upload/complete/route.ts     | CREATE (NEW)    | S3 magic-byte range verifier & DynamoDB transaction     |
| package.json                             | MODIFY          | Add @aws-sdk/s3-presigned-post dependency               |
| src/context/IncidentContext.tsx          | MODIFY          | Refactor uploadEvidence() to orchestrate presigned flow |
| VIGILORA_ECS_PRODUCTION_DEPLOYMENT_PLAN  | MODIFY          | Refine KMS guidance (AWS-managed vs. CMK)               |
+──────────────────────────────────────────+─────────────────+─────────────────────────────────────────────────────────+
```

### Files Verified as 100% Intact (Zero Modifications Required):
- `src/components/evidence/EvidenceViewer.tsx` (Retains `/api/evidence/${id}`)
- `src/app/report/page.tsx` (Retains `uploadEvidence(created.id, selectedFile)`)
- `src/app/api/evidence/[id]/route.ts` (Retains secure authenticated streaming proxy)
- `src/lib/validation.ts` (Retains `S3_KEY_REGEX`, magic-byte checks, size limits)
- `src/lib/auth.ts` (Retains session extraction, CSRF, and RBAC guards)
- `src/app/api/upload/route.ts` (Retained as a backward-compatible fallback)

---

## 7. Security Risks & Mitigations

1. **Information Leakage via Health Route**:
   - *Risk*: An unauthenticated health route could expose internal hostnames, database connection strings, or system metrics.
   - *Mitigation*: `GET /api/health` returns only `{ "status": "ok", "timestamp": "..." }`. No database queries, no environment variables, and no system metrics are emitted.
2. **Direct S3 Upload Tampering**:
   - *Risk*: A malicious client could bypass browser validation and upload non-image binaries or oversized files directly to S3.
   - *Mitigation*: The S3 Presigned POST policy strictly enforces `content-length-range` [100, 10485760] and exact `Content-Type` at the S3 edge. In `/api/upload/complete`, the server reads the first 64 bytes via S3 byte-range request and verifies real magic bytes (`validateImageMagicBytes`). Corrupted or forged files are immediately purged via `DeleteObjectCommand` and never committed to DynamoDB.
3. **Cross-Campus Evidence Tampering**:
   - *Risk*: A user from Campus A attaches evidence to an incident in Campus B.
   - *Mitigation*: Both `/authorize` and `/complete` verify that `INCIDENT#${incidentId}` exists under `pk: auth.user.campusId`. S3 keys are strictly scoped with `cleanCampus`.
4. **Orphaned S3 Object Accumulation**:
   - *Risk*: A client obtains an authorized presigned URL, uploads to S3, but never calls `/complete`.
   - *Mitigation*: Uncommitted objects have zero pointers in DynamoDB and cannot be resolved by `/api/evidence/[id]`. A standard S3 bucket lifecycle rule (expiring uncommitted objects or aborting incomplete uploads after 24-48 hours) ensures storage hygiene.

---

## 8. Backward-Compatibility Risks & Mitigations

1. **Object Key Regex Breakage**:
   - *Risk*: If `/authorize` generates keys omitting the timestamp prefix (`Date.now()-`), `validateS3Key()` rejects them, causing `/complete` and `/api/evidence/[id]` to fail.
   - *Mitigation*: The key generator in `/authorize` will strictly replicate `src/app/api/upload/route.ts`:
     `evidence/${cleanCampus}/${cleanInc}/${Date.now()}-${crypto.randomUUID()}.${ext}`.
2. **Disrupting Existing Components**:
   - *Risk*: Changing component props or context signatures could break the incident report page or tactical dashboard.
   - *Mitigation*: `uploadEvidence()` in `IncidentContext.tsx` preserves its exact signature and return type: `Promise<{ success: boolean; evidenceId?: string; url?: string; error?: string }>`. `EvidenceViewer.tsx` and `report/page.tsx` require zero modifications.
3. **Legacy API Compatibility**:
   - *Risk*: Removing `POST /api/upload` would break any direct API callers or automated test suites.
   - *Mitigation*: `src/app/api/upload/route.ts` remains intact alongside the new presigned endpoints.

---

## 9. Recommended Implementation Sequence

```
[STEP 1: HEALTH LIVENESS PROBE]
Create src/app/api/health/route.ts returning HTTP 200 { status: "ok" }.
Verify with unauthenticated curl.

[STEP 2: DEPENDENCY INSTALLATION]
Install @aws-sdk/s3-presigned-post in package.json.
Verify clean build output.

[STEP 3: PRESIGNED AUTHORIZE ROUTE]
Create src/app/api/upload/authorize/route.ts with campus validation,
exact key generation (${Date.now()}-${uuid}), and 5-minute expiry.

[STEP 4: PRESIGNED COMPLETE ROUTE]
Create src/app/api/upload/complete/route.ts with S3 Range: "bytes=0-63"
magic-byte validation, DeleteObjectCommand rollback, and TransactWriteCommand.

[STEP 5: INCIDENT CONTEXT REFACTOR]
Update uploadEvidence() in src/context/IncidentContext.tsx to orchestrate
the 3-stage presigned upload flow.

[STEP 6: LOCAL END-TO-END VERIFICATION]
Execute test suite verifying health checks, auth guards, image validation,
size limits, and EvidenceViewer display.
```

---

## 10. Required Test Matrix Before Production Deployment

| Test Case | Method | Expected Result |
|---|---|---|
| **T1: ALB Liveness Probe** | `curl -i http://localhost:3000/api/health` (no auth) | HTTP 200, `{"status":"ok"}`, latency < 10ms |
| **T2: Unauthenticated Authorize** | `curl -X POST http://localhost:3000/api/upload/authorize` (no auth) | HTTP 401 Unauthorized |
| **T3: Cross-Campus Authorization** | `POST /api/upload/authorize` with foreign `incidentId` | HTTP 404 Incident Not Found |
| **T4: Key Format Conformance** | Verify returned S3 key in `/authorize` response | Matches `S3_KEY_REGEX` with numeric timestamp |
| **T5: S3 Edge Size Enforcement** | Direct S3 POST with payload > 10 MB | HTTP 400 EntityTooLarge (rejected at S3 boundary) |
| **T6: Magic-Byte Tamper Rejection** | Upload renamed .txt to S3, call `/complete` | HTTP 400 Bad Request, S3 object purged via DeleteObject |
| **T7: End-to-End Image Flow** | Upload valid JPEG/PNG/WebP from UI | HTTP 201, DynamoDB updated, displayed in `EvidenceViewer` |
| **T8: Standalone Docker Build** | `docker build` & run on port 3000 | Container boots cleanly, responds to `/api/health` |

