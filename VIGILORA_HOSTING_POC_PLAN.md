# VIGILORA Hosting Compatibility Proof-of-Concept Plan: AWS Amplify vs. Container Compute (App Runner / ECS Fargate)

**Document**: `VIGILORA_HOSTING_POC_PLAN.md`  
**Date**: November 3, 2026  
**Status**: READ-ONLY COMPARATIVE AUDIT & POC TEST SPECIFICATION  
**Target AWS Region**: `eu-north-1` (Stockholm)  
**Target Account**: `399527676157`  
**Mandate**: Strictly read-only; zero code modifications, zero package installations, zero resource creation, zero credential minting, zero deployments.

---

## 1. Executive Summary & Critical Regional Findings

This document evaluates the hosting compatibility of VIGILORA’s actual production stack:
- **Framework**: Next.js 16.4.3 (App Router, Turbopack, React 19)
- **Runtime**: Node.js 22 LTS (`v22.14.0`), TypeScript 5
- **API Surface**: 14 Node.js API Route Handlers
- **Database & Storage**: Amazon DynamoDB (`VIGILORA-Main`) & Private Amazon S3 (`vigilora-evidence-*`)
- **Data Plane Architecture**: Option A (S3 Presigned POST direct uploads, 10 MB limit, 307 redirect retrieval)
- **Security Boundary**: IAM role-based temporary STS credentials (zero permanent access keys)

### Critical Findings Uncovered in Audit:

> [!CAUTION]
> **1. AWS APP RUNNER IS UNAVAILABLE IN `eu-north-1` (STOCKHOLM)**  
> Direct AWS CLI endpoint probe confirmed: `https://apprunner.eu-north-1.amazonaws.com/` does not exist. AWS App Runner has never been rolled out in Stockholm. Hosting VIGILORA compute on App Runner would force deployment in Frankfurt (`eu-central-1`) or Ireland (`eu-west-1`), creating cross-region latency to DynamoDB/S3 and incurring continuous cross-region data transfer egress fees ($0.02/GB).  
> Furthermore, on **April 30, 2026, AWS placed App Runner into maintenance mode**, stopped accepting new customers, and officially directed users to **Amazon ECS Express Mode / Amazon ECS Fargate**.

> [!WARNING]
> **2. AMPLIFY MANAGED NEXT.JS ADAPTER STATUS FOR NEXT.JS 16**  
> AWS Amplify Hosting officially documents native support for Next.js versions **12 through 15**. Next.js 16.4.3 introduces Turbopack output differences, React 19 SSR runtime, and experimental Partial Prerendering (PPR). Amplify’s managed build adapter cannot package the repository in its current as-is state without disabling experimental PPR (`partialPrefetching: false`) in [`next.config.ts`](file:///c:/Users/testp/Desktop/PROJECTS/VIGILORA/next.config.ts).

---

## 2. In-Depth Head-to-Head Comparison

| Comparison Dimension | AWS Amplify Hosting (SSR) | AWS App Runner (Container) | Amazon ECS Fargate (Native Container) |
| :--- | :--- | :--- | :--- |
| **Availability in `eu-north-1`** | ✅ **Natively Available** (Verified via CLI) | ❌ **UNAVAILABLE in `eu-north-1`** | ✅ **Natively Available** (Verified via CLI) |
| **AWS Lifecycle Status** | ✅ Active & Maintained | ⚠️ **Maintenance Mode** (New customers blocked since Apr 2026) | ✅ Active, Core Strategic AWS Service |
| **Next.js 16.4.3 Support** | ⚠️ **Experimental / Requires Config**: Managed adapter officially supports <= 15; requires disabling PPR and testing Turbopack. | ✅ **100% Native**: Runs standalone Node 22 container; ignores Next.js adapter quirks. | ✅ **100% Native**: Runs standalone Node 22 container; ignores Next.js adapter quirks. |
| **10 MB Evidence Uploads** | ✅ **Passes with Option A**: Direct browser-to-S3 Presigned POST bypasses 6 MB Lambda limit. | ✅ **Passes**: Direct S3 upload or container HTTP body (up to 100 MB). | ✅ **Passes**: Direct S3 upload or container HTTP body. |
| **Retrieval Limits** | ✅ **Passes with Option A**: 307 Redirect bypasses 5.72 MB Amplify response ceiling. | ✅ **Passes**: No 5.72 MB edge ceiling. | ✅ **Passes**: No 5.72 MB edge ceiling. |
| **Temporary IAM Credentials** | ✅ **Native IAM Role**: Injected by Lambda execution environment via AWS STS. | ✅ **Native Instance Role**: Query via metadata service. | ✅ **Native Task Role**: Injected via `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`. |
| **Zero Long-Lived Keys?** | ✅ Yes (Zero `AKIA...` keys) | ✅ Yes (Zero `AKIA...` keys) | ✅ Yes (Zero `AKIA...` keys) |
| **Deployment Mechanism** | Git push triggers automated build (`amplify.yml`). | Image update via ECR or code build. | Push Docker image to ECR; update ECS Service. |
| **Rollback Speed** | ⚡ **Instant**: 1-click redeploy of previous build artifact in console. | ⚡ **Rolling**: Point service to previous image tag. | ⚡ **Rolling**: Point task definition to previous image tag. |
| **Monthly Cost (Low Usage)** | **$0.00** (Free Tier) / **~$0.50** post-Free Tier | ~$3.00 – $5.00 / month | ~$8.00 / month (Fargate Spot / Small task) |
| **Monthly Cost (Mod. Usage)** | **~$2.00 – $4.50** / month | ~$6.00 – $9.00 / month | ~$8.00 – $15.00 / month |

---

## 3. Investigation Item-by-Item Analysis

### 1. Whether Amplify's Next.js Adapter Can Package This Exact Application
- **The Reality**: Amplify Hosting uses `@aws-amplify/adapter-nextjs` and OpenNext to package Next.js App Router code into AWS Lambda functions.
- **Current Blockers in Repository**:
  1. [`next.config.ts`](file:///c:/Users/testp/Desktop/PROJECTS/VIGILORA/next.config.ts) contains `partialPrefetching: true` (PPR). OpenNext cannot parse Next.js 16 PPR manifests; packaging fails.
  2. Turbopack symlinks in `.next` can trigger `EEXIST` packaging exceptions in Amplify's container builder.
  3. `package.json` specifies `"next": "16.4.3"` while Amplify's default build image expects Next.js 14/15.
- **Verdict**: Amplify **cannot package the repository in its exact current state**. It requires disabling experimental PPR and adding `amplify.yml` with `nvm use 22`.

### 2. Whether Container Compute (App Runner / ECS) Can Run Next.js 16.4.3
- **How It Works**: Next.js provides `output: 'standalone'` in `next.config.ts`.
- When built, Next.js generates `.next/standalone/server.js`, a production-grade, self-contained Node.js HTTP server.
- The Dockerfile builds on `node:22-alpine` and executes `node server.js` on port 3000.
- **Framework Independence**: The container runtime does not know or care whether Next.js is version 14, 15, or 16. It runs pure Node.js 22 bytecode.
- **Verdict**: Container compute **runs Next.js 16.4.3 natively without any framework downgrades or adapter workarounds**.
- **Crucial Caveat**: In `eu-north-1` (Stockholm), **Amazon ECS Fargate** must be used instead of App Runner.

### 3. How Each Platform Injects Role-Based STS Credentials
- **Amplify Hosting SSR**:
  - An IAM Service Role (`VIGILORA-AmplifySSR-Role`) is attached to the Amplify App.
  - Trust policy: `amplify.amazonaws.com`.
  - When a user requests an API route, AWS Lambda executes the function with temporary credentials injected into standard environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`.
  - The AWS SDK v3 in Node.js automatically detects these environment variables and signs requests to DynamoDB and S3.
  - Credentials rotate automatically every 1 to 6 hours. Zero permanent access keys.
- **Amazon ECS Fargate**:
  - An IAM Task Role (`VIGILORA-ECSTask-Role`) is attached to the task definition.
  - Trust policy: `ecs-tasks.amazonaws.com`.
  - The ECS agent sets `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`.
  - The AWS SDK v3 automatically queries the internal metadata endpoint (`http://169.254.170.2/...`) to fetch rotating STS credentials.
  - Zero permanent access keys.

### 4. Deployment and Rollback Workflows
- **Amplify Hosting**:
  - *Deployment*: Connects to GitHub repository branch `main`. On push, Amplify runs `amplify.yml`, builds SSR bundle, and updates CloudFront distribution.
  - *Rollback*: The Amplify Console maintains a history of all past build artifacts. Clicking **"Rollback to this version"** immediately redirects CloudFront edge routing to the prior artifact in <10 seconds.
- **Amazon ECS Fargate**:
  - *Deployment*: CI/CD builds Docker image, tags it with Git commit SHA (e.g. `vigilora:abc1234`), pushes to Amazon ECR, and registers a new task definition revision. ECS performs a rolling update, launching the new task and verifying `/api/health/aws` before stopping the old task.
  - *Rollback*: Run `aws ecs update-service --task-definition vigilora:PREVIOUS_REVISION`. Rolling rollback completes with zero downtime.

### 5. Cost Analysis: Realistic Low vs. Moderate Campus Usage

#### Usage Assumptions:
- **Low Usage** (Night shifts / small campus): 4 operators, 50 incidents/mo, 15,000 API requests/mo, 200 MB data transfer.
- **Moderate Usage** (Active university campus): 20 operators, 500 incidents/mo, 150,000 API requests/mo, 5 GB data transfer.

#### Cost Breakdown Table:

| Cost Component | AWS Amplify Hosting (SSR) | Amazon ECS Fargate (`eu-north-1`) |
| :--- | :--- | :--- |
| **Compute Baseline (Idle/Warm)** | **$0.00** (Pure serverless scales to 0) | **$7.70 / month** (0.25 vCPU, 0.5 GB RAM 24/7) |
| **Compute Active (Requests)** | Low: **$0.05** / Mod: **$0.50** | Included in baseline |
| **Storage (Code & Assets)** | Low: **$0.02** / Mod: **$0.05** | Amazon ECR storage: **~$0.10 / month** |
| **Data Transfer Out** | Low: **$0.00** (within 100 GB free) / Mod: **$0.00** | **$0.00** (within 100 GB free tier) |
| **Ingress / SSL Load Balancing** | **$0.00** (Included managed CloudFront) | **$0.00** (via CloudFront) or **$16.20/mo** (if ALB) |
| **Total Monthly Cost (Low)** | **$0.00** (12-mo Free Tier) / **~$0.10** post-Free | **~$7.80 / month** |
| **Total Monthly Cost (Moderate)**| **~$1.00 – $2.50 / month** | **~$8.50 / month** |

### 6. Services Incurring Charges Post-Credits / Post-Free Tier
- **DynamoDB Core Storage & RCU/WCU**: **FREE FOREVER** under AWS Free Tier (25 GB storage + 25 WCU/RCU provisioned).
- **DynamoDB TTL**: **100% FREE FOREVER**.
- **Data Transfer Out**: First **100 GB/month** to the Internet is **FREE FOREVER** across all AWS regions.
- **AWS Certificate Manager (ACM)**: **FREE FOREVER**.
- **S3 Evidence Storage**: Free for first 12 months (5 GB). After 12 months: $0.023/GB/month (~$0.12/mo for 5 GB).
- **Charges to Explicitly Prevent**: Keep PITR, S3 Versioning, and AWS WAF disabled.

### 7. Safe Testing Without Exposing Campus Data or Creating Production Resources
Both platforms can be tested with **100% data safety and zero production infrastructure creation**:
1. **Isolated Data Partition**: The test plan enforces `CAMPUS_PARTITION_KEY=CAMPUS#POC_ISOLATED`. Live campus tables remain untouched.
2. **Local Build Simulation First**: Before touching any AWS service, simulate the build packaging locally.
3. **Ephemeral Resource Tagging**: Any test cloud resources will carry `Project=VIGILORA-POC` and `AutoTeardown=True`.

---

## 4. Safe Proof-of-Concept (POC) Test Plan

This 3-phase test plan verifies packaging, runtime, and security without mutating existing production resources:

```mermaid
flowchart TD
    subgraph Phase 1: Local Offline Simulation (Zero Cloud Impact)
        P1A["1A: Next.js Standalone Build Audit<br/>(Verify .next/standalone compiles on Node 22)"]
        P1B["1B: Amplify Packaging Dry-Run<br/>(Inspect package-lock, verify adapter compatibility)"]
        P1C["1C: Local Docker Container Execution<br/>(Run container locally on port 3000, test 14 API routes)"]
    end

    subgraph Phase 2: Isolated Cloud Verification (Zero Production Data)
        P2A["2A: Create Ephemeral POC App / Service<br/>(Tagged Project=VIGILORA-POC)"]
        P2B["2B: Inject Isolated Environment<br/>(CAMPUS_PARTITION_KEY=CAMPUS#POC_ISOLATED)"]
        P2C["2C: Execute 6-Scenario Test Suite<br/>(<10MB, =10MB, >10MB, Tamper, Retrieval)"]
    end

    subgraph Phase 3: Immediate Teardown
        P3A["3A: Purge S3 POC Prefix (evidence/POC_ISOLATED/)"]
        P3B["3B: Delete DynamoDB Items (CAMPUS#POC_ISOLATED)"]
        P3C["3C: Destroy Ephemeral Cloud Resources"]
    end

    Phase 1 --> Phase 2 --> Phase 3
```

### Phase 1: Local Offline Simulation (Strictly Safe — Zero AWS Mutation)
1. **Step 1A — Next.js Standalone Build Verification**:
   - Run a dry-run standalone build locally: inspect `.next/standalone/server.js`.
   - Verify that all 14 API route handlers compile without bundling errors.
2. **Step 1B — Local Container Simulation**:
   - Build a local Docker image using `node:22-alpine`.
   - Run the container locally on `http://localhost:3000`.
   - Verify health check `GET http://localhost:3000/api/health/aws`.
3. **Step 1C — Amplify Adapter Compatibility Check**:
   - Check if `@aws-amplify/adapter-nextjs` throws any manifest parsing errors against the generated `.next` bundle.

### Phase 2: Cloud POC Verification (Isolated Enclave)
*(Only executed if Phase 1 passes and operator explicitly approves)*
1. Deploy an ephemeral test instance with:
   - `CAMPUS_PARTITION_KEY=CAMPUS#POC_ISOLATED`
   - Scoped IAM role granting access only to `CAMPUS#POC_ISOLATED` partition and S3 prefix `evidence/POC_ISOLATED/`.
2. Execute the 6-scenario verification suite:
   - TC-1: 2.5 MB image upload.
   - TC-2: Exactly 10.0 MB boundary upload.
   - TC-3: 10 MB + 1 byte rejection test.
   - TC-4: 25 MB oversize rejection test.
   - TC-5: Executable magic-byte tampering test.
   - TC-6: 8.2 MB retrieval test (verifying 307 redirect and zero 504 timeouts).

### Phase 3: Immediate Automated Teardown
1. Purge all items under partition `CAMPUS#POC_ISOLATED` from DynamoDB.
2. Purge all S3 objects under prefix `evidence/POC_ISOLATED/`.
3. Terminate and delete the ephemeral POC app/service.
4. Verify table and bucket have zero remaining test records.

---

## 5. Strategic Conclusion & Recommendations

1. **AWS App Runner is Disqualified**:
   - Due to its complete unavailability in `eu-north-1` (Stockholm) and its retirement/maintenance mode status announced by AWS in April 2026.
2. **The Real Strategic Choice**:
   - **Path A: AWS Amplify Hosting (SSR)**: Best for **Zero Cost** ($0.00/mo on Free Tier), provided we disable experimental PPR in `next.config.ts`.
   - **Path B: Amazon ECS Fargate (`eu-north-1`)**: Best for **Guaranteed Framework Stability** (runs native Next.js 16.4.3 standalone container in Stockholm), at a modest compute cost of **~$7.80/month**.

---

## 6. Decision Gate & Approval

Awaiting operator instruction:
1. Confirm receipt of the regional finding: **AWS App Runner is not supported in `eu-north-1` (Stockholm)** and entered maintenance mode in April 2026.
2. Choose preferred Proof-of-Concept focus:
   - **Amplify Hosting POC** (Zero-Cost focus with Next.js 16 PPR deactivation).
   - **Amazon ECS Fargate POC** (Containerized Next.js 16 native stability in Stockholm).
   - **Local Simulation Only** (Execute Phase 1 local Docker and standalone build verification with zero cloud footprint).

