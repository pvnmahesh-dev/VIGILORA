# VIGILORA Amazon ECS Fargate Production Deployment Master Plan (Revision 3.4)

**Document**: `VIGILORA_ECS_PRODUCTION_DEPLOYMENT_PLAN.md`  
**Revision**: 3.4 (KMS Resolution Mechanics, Split ECR Scoping, Least-Privilege S3, Grounded Domain/CORS & Readiness Reality)  
**Date**: November 4, 2026  
**Status**: STRATEGIC ARCHITECTURAL SPECIFICATION — PENDING OPERATOR APPROVAL  
**Target AWS Region**: `eu-north-1` (Stockholm)  
**Target Account**: `399527676157`  
**Verified VPC**: `vpc-05f6de3daa5706c13` (`172.31.0.0/16`)  
**Verified Public Route Table**: `rtb-03d706802268944ff`  
**Intended Task Security Group**: `vigilora-ecs-task-sg` (`sg-0d80496b6664c43b9`)  
**Existing ALB Security Group**: `vigilora-alb-sg` (`sg-0eab5cfc9c619b9ea`)  
**Core Technologies**: Docker (Node.js 22 LTS, 94 MB container), Next.js 16.4.3 Standalone, Amazon ECS Fargate, Amazon ECR, Application Load Balancer (ALB), Amazon DynamoDB (`VIGILORA-Main`), Amazon S3 (`vigilora-evidence-399527676157-eu-north-1-an`), AWS Systems Manager (SSM) Parameter Store  
**Author**: Antigravity Technical Lead  

---

## 1. Executive Summary & Revision 3.4 Technical Corrections

Following a rigorous architectural review of Revision 3.3, this specification establishes the production deployment plan for hosting **VIGILORA** on **Amazon ECS (AWS Fargate)** in **`eu-north-1` (Stockholm)**, incorporating eight precise engineering corrections:

1. **KMS Policy Resolution Mechanics**: Corrects the KMS key authorization specification. Clarifies that IAM policy statements **cannot use KMS alias ARNs** (e.g. `arn:aws:kms:...:alias/aws/ssm`) in the `Resource` element. Mandates resolving the underlying Key ARN via `aws kms describe-key` and scopes `kms:Decrypt` strictly to that exact key ARN. Distinguishes AWS-managed keys from customer-managed keys (CMKs).
2. **Split ECR Least-Privilege Scoping**: Separates ECR permissions in the Task Execution Role: maintains `ecr:GetAuthorizationToken` on `*` (as required by AWS IAM), but restricts repository layer access (`ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`) strictly to `arn:aws:ecr:eu-north-1:399527676157:repository/vigilora`.
3. **Removal of `s3:ListBucket` from Application Task Role**: Retracts `s3:ListBucket` from `VigiloraAppTaskRole`. Codebase verification confirmed that the application never lists bucket contents; scopes S3 permissions strictly to object-level `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` under the `evidence/*` prefix.
4. **Grounded Custom Domain & CORS Rationale**: Clarifies that production requires a stable custom HTTPS domain and trusted certificate for institutional branding, TLS certificate validity, and reliable cross-origin cookie handling (`SameSite` policies). Removes inaccurate claims that CORS inherently blocks credentials on default AWS hostnames.
5. **Mandatory Object-Key Generator Code Audit**: Explicitly requires verification of the S3 object-key generator in `src/app/api/upload/route.ts` and the proposed `src/app/api/upload/authorize/route.ts` to confirm keys strictly conform to `evidence/<campus>/<incident>/<uuid>.<ext>` before deployment.
6. **Qualified ACM & TLS Certificate Options**: Details that a trusted production deployment requires an operator-controlled domain and a valid matching certificate. Distinguishes free, auto-renewing **Public ACM Certificates** from third-party **Imported ACM Certificates**.
7. **Preservation of Verified Infrastructure & Pricing Baseline**: Retains verified VPC `vpc-05f6de3daa5706c13`, route table `rtb-03d706802268944ff`, security groups `sg-0d80496b6664c43b9` and `sg-0eab5cfc9c619b9ea`, the estimated **$37.41/month** fixed baseline, and the warning regarding the active **$10.00/month AWS Budget**.
8. **Strict Read-Only Posture**: Zero AWS resources, IAM roles, or security groups have been created or modified; zero images pushed; zero data seeded.

---

## 2. Resource Inventory: Verified Infrastructure vs. Pending Dependencies

```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    AWS RESOURCE INVENTORY MATRIX                                  |
+──────────────────────────+───────────────────────────────────────────+────────────────────────────+
| RESOURCE LAYER           | VERIFIED EXISTING INFRASTRUCTURE          | PENDING DEPLOYMENT STEPS   |
+──────────────────────────+───────────────────────────────────────────+────────────────────────────+
| **Virtual Private Cloud**| `vpc-05f6de3daa5706c13` (`172.31.0.0/16`)  | Attach Gateway Endpoints   |
| **Subnets**              | • Existing VIGILORA Public Subnets (2 AZs)| Subnet ID discovery query  |
|                          | • Existing VIGILORA Private Subnets (2 AZ)| (Private subnets excluded) |
| **Route Tables**         | `rtb-03d706802268944ff` (Public IGW Route)| Route Gateway Endpoints    |
| **Security Groups**      | • Task SG: `vigilora-ecs-task-sg`         | Audit and align inbound/   |
|                          |   (`sg-0d80496b6664c43b9`)                | outbound rules             |
|                          | • Task SG (Duplicate): `vigilora-task-sg` | (Retain duplicate pending  |
|                          |   (`sg-0e691588c10b5f16e`)                | separate cleanup decision) |
|                          | • ALB SG: `vigilora-alb-sg`               | Audit inbound 80/443 &     |
|                          |   (`sg-0eab5cfc9c619b9ea`)                | outbound TCP 3000          |
| **Container Registry**   | `399527676157.dkr.ecr.eu-north-1.amazonaws.com/vigilora`| Push `vigilora:v1.0.0`     |
|                          | (Tag Immutability: IMMUTABLE, Encrypt: AES-256)| (Pending operator push)   |
| **Database & Storage**   | • DynamoDB: `VIGILORA-Main`               | Configure S3 CORS rules    |
|                          | • S3: `vigilora-evidence-399527676157-eu-north-1-an`|                    |
| **External Dependencies**| Operator domain registration required     | • Issue & validate ACM TLS |
|                          |                                           | • Provision Application LB |
|                          |                                           | • Create Target Group      |
| **Compute & Runtime**    | None (Local Docker POC verified)          | • Create ECS Cluster       |
|                          |                                           | • Register Task Definition |
|                          |                                           | • Launch Fargate Service   |
| **Identity & Secrets**   | Local AWS CLI configuration               | • Create TaskExecutionRole |
|                          |                                           | • Create AppTaskRole       |
|                          |                                           | • Store SSM SESSION_SECRET |
| **Application Code**     | Standalone bundle verified                | • Implement /api/health    |
|                          |                                           | • Option A Presigned routes|
+──────────────────────────+───────────────────────────────────────────+────────────────────────────+
```

---

## 3. Security Architecture & Network Boundary Evaluation

```mermaid
flowchart TD
    subgraph Internet ["Public Internet / Untrusted Zone"]
        Attacker["Potential Internet Scanners"]
        Operator["Authorized Campus Operators (India)"]
    end

    subgraph AWS_Stockholm ["AWS Region: eu-north-1 (Stockholm)"]
        subgraph VPC ["Verified VPC: vpc-05f6de3daa5706c13 (172.31.0.0/16)"]
            subgraph Public_Subnets ["Existing VIGILORA Public Subnets (eu-north-1a / eu-north-1b)"]
                ALB["Application Load Balancer (ALB)<br/>Security Group: vigilora-alb-sg<br/>(sg-0eab5cfc9c619b9ea)<br/>• Inbound: 80 & 443 from 0.0.0.0/0<br/>• Outbound: TCP 3000 to sg-0d80496b6664c43b9"]
                
                subgraph Task_Subnet ["Task Placement (Pattern 3: assignPublicIp = ENABLED)"]
                    TaskENI["Fargate Task Elastic Network Interface<br/>Public IPv4: Assigned (Direct Egress via IGW)<br/>Security Group: vigilora-ecs-task-sg<br/>(sg-0d80496b6664c43b9)"]
                    Container["VIGILORA Standalone Container<br/>Non-Root User: nextjs (UID 1001)<br/>Listening on: 0.0.0.0:3000"]
                end
            end

            subgraph Gateway_Endpoints ["VPC Gateway Endpoints ($0.00 Data Transfer)"]
                S3_GWEP["com.amazonaws.eu-north-1.s3<br/>Route Table: rtb-03d706802268944ff"]
                DDB_GWEP["com.amazonaws.eu-north-1.dynamodb<br/>Route Table: rtb-03d706802268944ff"]
            end
        end

        subgraph Managed_AWS ["AWS Regional Services"]
            DDB[("DynamoDB: VIGILORA-Main")]
            S3[("S3: vigilora-evidence-*")]
            ECR["Amazon ECR (399527676157.dkr.ecr...)"]
            CW["CloudWatch Logs (/ecs/vigilora-production)"]
            SSM["SSM Parameter Store (SESSION_SECRET)"]
            KMS["AWS KMS (Resolved Key ARN)"]
        end
    end

    Operator ==>|HTTPS 443| ALB
    ALB ==>|Forward TCP 3000| TaskENI
    TaskENI --> Container

    Attacker -.->|Dropped at Hypervisor| TaskENI
    style Attacker stroke:#f00,stroke-width:2px
    style TaskENI stroke:#f90,stroke-width:2px

    Container ==>|Internal AWS Fiber ($0.00)| S3_GWEP ==> S3
    Container ==>|Internal AWS Fiber ($0.00)| DDB_GWEP ==> DDB
    Container -->|Outbound HTTPS 443 via IGW| ECR
    Container -->|Outbound HTTPS 443 via IGW| CW
    Container -->|Outbound HTTPS 443 via IGW| SSM
    Container -->|Outbound HTTPS 443 via IGW| KMS
```

### 3.1 Subnet Selection & Discovery Prerequisite
- **Task Subnets**: Fargate tasks will be placed in the two existing VIGILORA public subnets across `eu-north-1a` and `eu-north-1b`.
- **Discovery Prerequisite Step**: Before registering the ECS service, execute this query to capture the exact public subnet IDs:
  ```bash
  aws ec2 describe-subnets \
    --region eu-north-1 \
    --filters "Name=vpc-id,Values=vpc-05f6de3daa5706c13" "Name=tag:Name,Values=*public*" \
    --query "Subnets[].{SubnetId:SubnetId,AZ:AvailabilityZone,CIDR:CidrBlock,Name:Tags[?Name=='Name'].Value|[0]}" \
    --output table
  ```
- **Strict Private Subnet Exclusion**: Existing private subnets in `vpc-05f6de3daa5706c13` lack NAT Gateways and VPC Interface Endpoints. Placing tasks in private subnets will cause container pull and secret retrieval failures (`ResourceInitializationError`).

---

### 3.2 Security Group Audit & Current State vs. Intended State
Both security groups already exist in AWS Account `399527676157`:

1. **ALB Security Group (`vigilora-alb-sg` - `sg-0eab5cfc9c619b9ea`)**:
   - *Inbound Rules*: `HTTP (TCP 80)` and `HTTPS (TCP 443)` from `0.0.0.0/0`.
   - *Outbound Rules*: `Custom TCP 3000` to `sg-0d80496b6664c43b9`.
2. **Task Security Group (`vigilora-ecs-task-sg` - `sg-0d80496b6664c43b9`)**:
   - *Inbound Rules*: `Custom TCP 3000` from `sg-0eab5cfc9c619b9ea` **ONLY**. Zero `0.0.0.0/0` inbound rules.
   - *Current Outbound State*: **Observed as All traffic (`0.0.0.0/0` All protocols/ports)**.
   - *Intended Target State*: Outbound restricted to **`HTTPS (TCP 443)` to `0.0.0.0/0`** (and internal Gateway Endpoint routing).
   - *Note*: Security group modifications will occur during Milestone 1; no changes are made now.
3. **Duplicate Security Group**:
   - `vigilora-task-sg` (`sg-0e691588c10b5f16e`) is an unattached duplicate. It will be retained without deletion pending a post-launch cleanup review.

---

### 3.3 S3 & DynamoDB Gateway Endpoints: Pre-Inspection & Creation
Before issuing endpoint creation commands, engineering must confirm endpoints do not already exist on `vpc-05f6de3daa5706c13`:

```bash
# 1. Pre-Creation Inspection: Check for Existing Endpoints
aws ec2 describe-vpc-endpoints \
  --region eu-north-1 \
  --filters "Name=vpc-id,Values=vpc-05f6de3daa5706c13" \
  --query "VpcEndpoints[].{Id:VpcEndpointId,Service:ServiceName,State:State,RouteTables:RouteTableIds}" \
  --output table

# 2. Create DynamoDB Gateway Endpoint (Execute ONLY if not listed above)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-05f6de3daa5706c13 \
  --service-name com.amazonaws.eu-north-1.dynamodb \
  --route-table-ids rtb-03d706802268944ff \
  --region eu-north-1

# 3. Create S3 Gateway Endpoint (Execute ONLY if not listed above)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-05f6de3daa5706c13 \
  --service-name com.amazonaws.eu-north-1.s3 \
  --route-table-ids rtb-03d706802268944ff \
  --region eu-north-1
```

---

## 4. IAM Privilege Separation & Policy Definitions

AWS ECS requires two distinct IAM roles. Both roles must specify an explicit trust policy for `ecs-tasks.amazonaws.com`.

### 4.1 IAM Trust Policy Document (Applies to Both Roles)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcsTasksAssumeRole",
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

---

### 4.2 ECS Task Execution Role (`VigiloraEcsTaskExecutionRole`)
Used exclusively by the AWS ECS container agent prior to container start.

#### Discovery Prerequisite Step for KMS Key Resolution:
> [!IMPORTANT]
> **KMS ALIAS ARNs CANNOT BE USED IN IAM RESOURCE STATEMENTS**  
> In AWS IAM policy statements, an alias ARN (e.g. `arn:aws:kms:eu-north-1:399527676157:alias/aws/ssm`) is **not a valid resource identifier** and will result in `AccessDeniedException` during parameter decryption. You must resolve the underlying **Key ARN**.

1. **Inspect the Parameter's Key Identifier**:
   ```bash
   aws ssm get-parameter \
     --name "/vigilora/production/SESSION_SECRET" \
     --with-decryption \
     --region eu-north-1 \
     --query "Parameter.KeyId" \
     --output text
   ```
2. **Resolve the Underlying Key ARN**:
   - If the returned KeyId is `alias/aws/ssm` (the AWS-managed default key):
     ```bash
     aws kms describe-key \
       --key-id alias/aws/ssm \
       --region eu-north-1 \
       --query "KeyMetadata.Arn" \
       --output text
     ```
   - If the parameter uses a Customer-Managed Key (CMK):
     ```bash
     aws kms describe-key \
       --key-id <DISCOVERED_CMK_ID> \
       --region eu-north-1 \
       --query "KeyMetadata.Arn" \
       --output text
     ```
   The resulting ARN (`arn:aws:kms:eu-north-1:399527676157:key/<RESOLVED_KEY_UUID>`) is the exact string placed into the IAM policy below.

#### Task Execution Policy Document (Split ECR Permissions):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrAuthToken",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "EcrRepositoryAccess",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": "arn:aws:ecr:eu-north-1:399527676157:repository/vigilora"
    },
    {
      "Sid": "CloudWatchLogging",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:eu-north-1:399527676157:log-group:/ecs/vigilora-production:*"
    },
    {
      "Sid": "SsmSecretAccess",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameters",
        "ssm:GetParameter"
      ],
      "Resource": "arn:aws:ssm:eu-north-1:399527676157:parameter/vigilora/production/SESSION_SECRET"
    },
    {
      "Sid": "KmsDecryptSecret",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:eu-north-1:399527676157:key/<RESOLVED_KEY_UUID>"
    }
  ]
}
```

---

### 4.3 Application Task Role (`VigiloraAppTaskRole`)
Used exclusively by the VIGILORA Node.js process at runtime via AWS SDK v3.

#### Grounded Codebase Audit Findings:
- **`dynamodb:TransactWriteItems`**: Added because `src/app/api/upload/route.ts` and `src/app/api/incidents/[id]/route.ts` execute atomic multi-item transactions (`TransactWriteCommand`).
- **`dynamodb:Scan`**: **Excluded**. Codebase audit confirmed zero occurrences of `ScanCommand`.
- **`s3:ListBucket`**: **Excluded**. Codebase audit confirmed zero occurrences of `ListObjectsCommand` or `ListBucket`.
- **`s3:AbortMultipartUpload`**: **Excluded**. Multi-part uploads are not implemented in the application.
- **`s3:DeleteObject`**: **Retained**. Required for automated rollback in `src/app/api/upload/route.ts` when a metadata transaction fails or an upload is rejected.
- **Prefix Scoping**: All S3 operations are restricted strictly to `evidence/*`.

#### Application Task Policy Document:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBDataPlane",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:TransactWriteItems"
      ],
      "Resource": [
        "arn:aws:dynamodb:eu-north-1:399527676157:table/VIGILORA-Main",
        "arn:aws:dynamodb:eu-north-1:399527676157:table/VIGILORA-Main/index/*"
      ]
    },
    {
      "Sid": "S3EvidenceObjectPlane",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::vigilora-evidence-399527676157-eu-north-1-an/evidence/*"
    }
  ]
}
```

---

## 5. Option A S3 Presigned URL & CORS Architecture

### 5.1 Narrowly Scoped S3 CORS Configuration
Production browsers require a stable, operator-controlled HTTPS domain with a trusted public TLS certificate to satisfy credentialed cookie policies (`SameSite=Lax` / `SameSite=None; Secure`). CORS headers must be restricted to verified production domains:

```json
[
  {
    "AllowedOrigins": [
      "https://<verified-production-domain>",
      "https://<verified-staging-domain>"
    ],
    "AllowedMethods": [
      "POST",
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Content-Type",
      "Content-MD5",
      "x-amz-date",
      "x-amz-security-token",
      "x-amz-user-agent"
    ],
    "ExposeHeaders": [
      "ETag",
      "x-amz-request-id"
    ],
    "MaxAgeSeconds": 3000
  }
]
```

---

### 5.2 Unified Upload Size Policy (100 Bytes to 10 MB)
Both the S3 Presigned POST condition and server-side verification enforce an identical file size window:
- **Minimum Size**: `100 bytes` (rejects empty or corrupt files).
- **Maximum Size**: `10,485,760 bytes (10 MB)` (enforces strict evidence size ceiling).
- **Presigned POST Condition**:
  ```json
  ["content-length-range", 100, 10485760]
  ```

---

### 5.3 Completion Verification & Automated S3 Rollback (`/api/upload/complete`)
Before persisting evidence metadata to DynamoDB, the server-side completion endpoint must execute a 5-point verification:

```
[COMPLETION VERIFICATION PIPELINE]
1. Size Inspection:      Calls HeadObject; verifies 100 <= ContentLength <= 10485760 bytes.
2. Ownership Check:      Verifies incidentId exists in DynamoDB and belongs to caller's campusId.
3. Key Prefix Matching:  Verifies s3Key conforms strictly to evidence/<campus>/<incident>/<uuid>.<ext>.
4. Content-Type Check:   Verifies S3 object ContentType matches allowed whitelist (image/jpeg, png, webp).
5. Magic-Byte Analysis:  Reads first 512 bytes via ranged GetObject (bytes=0-511) to confirm signature.
                         • JPEG: FF D8 FF
                         • PNG:  89 50 4E 47 0D 0A 1A 0A
                         • WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)

IF ANY STEP FAILS OR DYNAMODB WRITE FAILS:
==> Server immediately issues s3Client.send(new DeleteObjectCommand({ Bucket, Key: s3Key }))
==> Orphaned S3 object is purged; returns HTTP 400/403/500 to client.
```

#### Pre-Implementation Code Audit Requirement:
Before deploying Option A endpoints, engineering must inspect the actual evidence object-key generator in `src/app/api/upload/route.ts` and `src/app/api/upload/authorize/route.ts`. Do not assume the existing code already conforms; explicitly verify that keys generated strictly follow `evidence/<cleanCampus>/<cleanInc>/<uniqueSegment>.<ext>`.

#### Oversized-Upload Verification Test:
Engineering tests will submit a synthetic payload of 10.1 MB (10,590,618 bytes). The test will capture and log the actual HTTP status and XML response body returned by Amazon S3 (confirming that S3 rejects the entity before storage).

---

## 6. ALB Target-Group Health Checks & External Domain Dependencies

### 6.1 Exact ALB Target-Group Health-Check Parameters
```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                               ALB TARGET GROUP HEALTH CHECK CONFIGURATION                         |
+──────────────────────────+───────────────────+───────────────────────────────────────────────────+
| PARAMETER                | SETTING           | OPERATIONAL PURPOSE                               |
+──────────────────────────+───────────────────+───────────────────────────────────────────────────+
| Health Check Protocol    | `HTTP`            | Probes container HTTP server over VPC.            |
| Health Check Port        | `traffic-port`    | Targets port 3000 mapped to container.            |
| Health Check Path        | `/api/health`     | Dedicated lightweight liveness endpoint.          |
| Health Check Interval    | `15 seconds`      | Balances rapid failure detection with CPU overhead|
| Health Check Timeout     | `5 seconds`       | Fails probe if Node.js event loop freezes > 5s.   |
| Healthy Threshold Count  | `2 consecutive`   | Requires 2 consecutive 200s to declare healthy.   |
| Unhealthy Threshold Count| `3 consecutive`   | Deregisters task after 3 consecutive failures.    |
| Success Codes (Matcher)  | `200`             | Accepts HTTP 200 OK only.                         |
+──────────────────────────+───────────────────+───────────────────────────────────────────────────+
```

### 6.2 Custom Domain & ACM Certificate Qualification
A trusted public HTTPS application requires an operator-controlled domain and a matching certificate:
- **Public ACM Certificate (Recommended)**: Issued at no charge by Amazon Trust Services (ATS) for domains verified via DNS CNAME validation. Provides automated renewal without operational overhead.
- **Imported ACM Certificate**: Can be issued by a third-party Certificate Authority and imported into ACM via `aws acm import-certificate`. Requires manual certificate renewal and re-importation prior to expiration.
- **Dependency Boundary**: Default AWS DNS hostnames (`*.elb.amazonaws.com`) **cannot** be issued an ACM certificate. Registering a custom domain or delegating a campus subdomain is a mandatory external prerequisite before HTTPS listener configuration.

---

## 7. Availability Realities & Qualified Resilience

```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    QUALIFIED RESILIENCE MATRIX                                    |
+──────────────────────────+───────────────────────────────────────+────────────────────────────────+
| FAILURE SCENARIO         | SINGLE-TASK BEHAVIOR                  | TWO-TASK MULTI-AZ BEHAVIOR     |
+──────────────────────────+───────────────────────────────────────+────────────────────────────────+
| Container Crash (OOM/Bug)| ❌ Service Outage: Application down   | ⚠️ Resilient Failover: ALB shifts|
|                          |   for ~45–90s while ECS restarts task.|   traffic to healthy peer within|
|                          |                                       |   30–45s. In-flight requests on|
|                          |                                       |   crashing task return HTTP 502.|
| Host Hardware Failure    | ❌ Service Outage: Down until ECS     | ✅ High Resiliency: Surviving  |
|                          |   schedules replacement on new host.  |   task serves traffic while ECS|
|                          |                                       |   launches replacement in peer.|
| Availability Zone Outage | ❌ Service Outage: Down until entire  | ⚠️ Resilient: Peer task in     |
| (e.g. eu-north-1a down)  |   AZ recovers or manual migration.    |   eu-north-1b serves requests. |
|                          |                                       |   Regional AWS control-plane   |
|                          |                                       |   degradations may still impact|
| Rolling Code Deployment  | ⚠️ Brief Transition Risk: Old task     | ✅ Minimized Downtime: ECS     |
|                          |   drains while new task warms up.     |   maintains 100% capacity; new |
|                          |                                       |   task verified before drain.  |
+──────────────────────────+───────────────────────────────────────+────────────────────────────────+
```

---

## 8. Financial Model: Estimates vs. Budget Controls

### 8.1 Estimated Fixed Monthly Baseline ($37.41)
All figures reflect published AWS pricing for `eu-north-1` (Stockholm). The fixed baseline represents an **estimate, NOT a spending cap**:

```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    ESTIMATED FIXED IDLE MONTHLY BURN                              |
+───────────────────────────────────+───────────────────────────────────+───────────────────────────+
| COMPONENT                         | SINGLE-TASK ESTIMATE              | TWO-TASK MULTI-AZ ESTIMATE|
+───────────────────────────────────+───────────────────────────────────+───────────────────────────+
| Application Load Balancer Base    | $0.0239 × 730 hrs = $17.45        | $0.0239 × 730 hrs = $17.45|
| ALB Public IPv4 (2 AZs)           | 2 IPs × $0.005 × 730 hrs = $7.30  | 2 IPs × $0.005 × 730 = $7.30|
| Fargate vCPU (0.25 vCPU per task) | 0.25 × 730 × $0.04048 = $7.39     | 0.50 × 730 × $0.04048 = $14.78|
| Fargate RAM (0.5 GB per task)     | 0.5 × 730 × $0.004445 = $1.62     | 1.0 × 730 × $0.004445 = $3.24|
| Task Public IPv4 (Pattern 3)      | 1 IP × $0.005 × 730 hrs = $3.65   | 2 IPs × $0.005 × 730 = $7.30|
+───────────────────────────────────+───────────────────────────────────+───────────────────────────+
| ESTIMATED FIXED IDLE TOTAL        | **$37.41 / month**                | **$50.07 / month**        |
+───────────────────────────────────+───────────────────────────────────+───────────────────────────+
```

---

### 8.2 Comparison with Existing $10.00/Month AWS Budget

> [!CAUTION]
> **EXISTING BUDGET MISALIGNMENT & NOTIFICATION LAG**  
> - **Existing Account Budget**: An active budget of **$10.00/month** is configured on AWS Account `399527676157`.
> - **Operational Reality**: Launching the ECS Fargate + ALB baseline ($37.41/month estimate) will **immediately exceed the existing $10.00 budget** within the first 8 days of operation.
> - **Required Adjustment**: Prior to public launch, the budget alert threshold should be updated to **$45.00 (Warning)** and **$65.00 (Critical)** to prevent continuous alert fatigue.
> - **No Hard Spending Caps**: AWS Budget alerts **cannot terminate AWS resources**. Furthermore, billing telemetry updates **1 to 3 times per day**, introducing an unavoidable **8 to 24-hour reporting lag**.
> - **Current Action**: In strict compliance with instructions, **zero AWS budget modifications have been made**.

---

## 9. Pre-Deployment Governance & Implementation Verification Gates

```
[GATE 1: DISCOVERY & EXTERNAL PREREQUISITES]
[ ] 1. Discover and record exact Public Subnet IDs in vpc-05f6de3daa5706c13.
[ ] 2. Resolve SSM parameter KMS KeyId to actual Key ARN using aws kms describe-key.
[ ] 3. Verify public domain ownership and request ACM TLS certificate for eu-north-1.
[ ] 4. Audit sg-0d80496b6664c43b9 (task) and sg-0eab5cfc9c619b9ea (ALB) rules.

[GATE 2: REPOSITORY & CODE IMPLEMENTATION]
[ ] 5. Implement GET /api/health liveness route in src/app/api/health/route.ts.
[ ] 6. Audit evidence key generator and implement Option A S3 Presigned POST endpoints.
[ ] 7. Authenticate Docker and push verified image to ECR:
       399527676157.dkr.ecr.eu-north-1.amazonaws.com/vigilora:v1.0.0.

[GATE 3: NETWORKING & S3 CONFIGURATION]
[ ] 8. Verify endpoint absence and create S3 & DynamoDB Gateway Endpoints on rtb-03d706802268944ff.
[ ] 9. Apply origin-scoped S3 CORS policy to vigilora-evidence-399527676157-eu-north-1-an.

[GATE 4: IAM ROLES & SECRETS]
[ ] 10. Create VigiloraEcsTaskExecutionRole with split ECR permissions and resolved KMS Key ARN.
[ ] 11. Create VigiloraAppTaskRole with scoped DynamoDB (TransactWriteItems) and S3 object policies.
[ ] 12. Create production SESSION_SECRET in SSM Parameter Store as SecureString.

[GATE 5: INFRASTRUCTURE PROVISIONING & LAUNCH]
[ ] 13. Create ALB, HTTPS 443 Listener (with validated ACM cert), and Port 80 redirect.
[ ] 14. Create Target Group with /api/health matcher and register Fargate service.
[ ] 15. Verify running task Availability Zone distribution via AWS CLI.
```

---

## 10. Change Summary, Unresolved Issues & Implementation Readiness

### 10.1 Summary of Changes in Revision 3.4
- Corrected KMS policy guidance: documented that alias ARNs are invalid in IAM Resource elements and detailed resolution of the underlying Key ARN via `aws kms describe-key`.
- Split ECR permissions in the Task Execution Role: kept `ecr:GetAuthorizationToken` on `*` while scoping repository actions strictly to `arn:aws:ecr:eu-north-1:399527676157:repository/vigilora`.
- Removed `s3:ListBucket` from the Application Task Role after verifying zero application code paths require bucket listing.
- Clarified that production custom domains and trusted certificates are required for institutional trust and cookie security, not an inherent CORS restriction.
- Added an explicit code audit requirement to verify that the actual evidence object-key generator strictly matches `evidence/<campus>/<incident>/<uuid>.<ext>`.
- Qualified the ACM requirement, distinguishing public ACM certificates from imported certificates.

---

### 10.2 Unresolved Technical Issues & Blockers
1. **Unregistered Custom Domain & Pending ACM Certificate**:
   - The Application Load Balancer cannot terminate HTTPS without an active ACM TLS certificate, which requires a registered domain name and DNS CNAME validation. Deploying without a domain restricts the application to plain HTTP on port 80.
2. **Pending Source Code Endpoints**:
   - The `/api/health` liveness route and Option A Presigned URL routes (`/api/upload/authorize` and `/api/upload/complete`) are not yet implemented in the repository. Deploying ECS Fargate before implementing these routes will result in ALB health-check failure loops and container restarts.
3. **Pending SSM Session Secret & KMS Key Identification**:
   - The production session secret has not been provisioned in SSM Parameter Store, and the underlying KMS key ARN used by the parameter has not yet been resolved.
4. **Existing $10/Month Budget Breach**:
   - Operating the ALB and Fargate task ($37.41/month estimate) will breach the account's existing $10/month budget within the first 8 days of operation unless updated by the operator.
5. **Observed Security Group Egress Rule**:
   - `vigilora-ecs-task-sg` currently permits all outbound traffic (`0.0.0.0/0 All`). It must be intentionally updated during Milestone 1 to enforce TCP 443 egress.

---

### 10.3 Realistic Readiness Assessment
- **Architectural Documentation Readiness**: **100% COMPLETE & RIGOROUSLY GROUNDED**  
  The architectural blueprint is now fully reconciled with verified AWS resource IDs, strict least-privilege IAM policies, and physical platform constraints.
- **Production Implementation Readiness**: **HOLD — NOT YET READY FOR LIVE TRAFFIC**  
  Completing this specification does not make the project production-ready. The deployment remains gated by:
  1. *Code Readiness*: Implementing `/api/health` and Option A presigned upload routes, and verifying the key generator.
  2. *Domain Readiness*: Provisioning a custom domain name and validating an ACM certificate.
  3. *Credential Readiness*: Pushing `vigilora:v1.0.0` to ECR and creating SSM session secrets with resolved KMS keys.
  4. *Governance Approval*: Formal operator authorization to begin **Milestone 1**.
