# VIGILORA — Campus Incident Intelligence & Tactical Response Platform

> **Nocturnal Vigil • Real-Time Emergency Coordination • Deterministic AI Triage**

[![Next.js 16.4](https://img.shields.io/badge/Next.js-16.4.3-black?logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.3.0-61DAFB?logo=react)](https://react.dev/)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![AWS DynamoDB](https://img.shields.io/badge/AWS-DynamoDB-4053D6?logo=amazon-dynamodb)](https://aws.amazon.com/dynamodb/)
[![AWS S3](https://img.shields.io/badge/AWS-S3_Evidence-569A31?logo=amazon-s3)](https://aws.amazon.com/s3/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind-CSS_4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)

---

## 1. Project Overview & Problem Statement

Campus security, university facilities, and municipal emergency dispatchers face critical coordination delays during high-stress nocturnal events. Traditional incident management systems suffer from:
1. **Disconnected Telemetry**: Spatial incident pins are disconnected from real architectural building footprints and road arteries.
2. **Fabricated or Flaky AI Predictions**: External cloud AI models can hallucinate severity, expose private credentials, or hang during network outages.
3. **Role Confusion & Boundary Bleed**: Responders in the field are either overwhelmed with every campus incident or lack direct, secure evidence access.
4. **Data Dishonesty in Analytics**: Dashboards frequently display static or invented response statistics rather than authentic operational deltas.

**VIGILORA** resolves these challenges through a unified tactical command platform wrapped in an atmospheric **Victorian Gothic** operational aesthetic. It delivers ACID-compliant status transitions on **AWS DynamoDB**, encrypted browser-to-S3 evidence ingestion, deterministic emergency NLP triage, an architectural schematic tactical map, and genuine client-side PDF reporting.

---

## 2. Main Features

- **The Incident Command Dashboard**: Unified tactical command center displaying live operational KPIs, incident queues, and dual-mode Queue/Map view toggling.
- **Architectural Vector Tactical Map**: SVG-based $1000 \times 1000$ campus coordinate space with perimeter roads, sector boundaries, and recognizable building footprints (Great Auditorium, Sports Complex, STEM Quad, Central Plaza, Arts District, South Depot).
- **Sensor Triangulation Honesty**: Incidents lacking verified spatial telemetry are quarantined in a dedicated "Pending Sensor Triangulation" dock—never placed at invented coordinates.
- **Intelligent Dual-Engine Auto-Triage**: High-speed semantic classification recommending category, severity, immediate tactical response, and life-safety advisories with calibrated confidence scoring.
- **Role-Based Tactical Command**: Verified separation between **Lead Dispatcher**, **Field Responder**, and **Campus Administrator** (Supervisor).
- **Field Responder Boundary Isolation**: Responders see *only* incidents assigned to their specific tactical unit (e.g. Officer Vance $\to$ `MED-01`).
- **Forensic Evidence Pipeline**: Direct browser-to-S3 Presigned POST uploads, in-context inspector previews, full modal lightbox with keyboard shortcuts, and authenticated S3 proxy streaming.
- **Tactical Response Team Roster**: Persistent unit availability tracking (`Available`, `En Route`, `On Scene`, `Busy`) with automatic unit release upon incident resolution.
- **Data-Honest Analytics & PDF Export**: Dynamic sector and category hazard loads with a genuine downloadable PDF (`VIGILORA_Campus_Incident_Summary.pdf`).

---

## 3. Technology Stack

- **Frontend Core**: Next.js 16.4.3 (App Router & Turbopack), React 19.3.0, TypeScript 5.
- **Styling & Visual Identity**: Tailwind CSS 4 with custom Victorian Gothic theme (`#080D13` Obsidian, `#87000A` Gothic Crimson, `#F01420` Blood Red, `#E8E5E2` Distressed Ivory, Cinzel & Oswald typography).
- **Backend & API**: Next.js Serverless API Route Handlers with Web Crypto (`crypto.scrypt`, SHA-256 session tokens).
- **Database**: AWS DynamoDB (`VIGILORA-Main`) utilizing single-table design with multi-tenant partition key isolation (`pk: CAMPUS#METROPOLIS`).
- **Object Storage**: Private AWS S3 bucket with Presigned POST authorization and authenticated server-side proxy streaming.
- **AI Classification**: Dual-engine architecture combining Google Gemini 1.5 Flash (via REST) with a local deterministic emergency NLP semantic engine.
- **Document Generation**: `jspdf` and `jspdf-autotable` for vector-styled binary PDF synthesis.
- **Testing & Verification**: Automated TypeScript test runners (`tsx`) and Playwright for real browser interactions.

---

## 4. System Architecture

```
+---------------------------------------------------------------------------------------+
|                                    CLIENT BROWSER                                     |
|  [Victorian Gothic UI]  •  [Tactical Map]  •  [Evidence Lightbox]  •  [PDF Export]   |
+-------------------------------------------+-------------------------------------------+
                                            |
                         HTTPS (HttpOnly Cookie / SameSite=Lax)
                                            |
+-------------------------------------------v-------------------------------------------+
|                              NEXT.JS APPLICATION SERVER                               |
|                                                                                       |
|  [Auth & RBAC Middleware]         [Validation & Sanitization]     [AI Triage Engine]  |
|  - scrypt password verify         - Path traversal checks         - Gemini (3s abort) |
|  - SHA-256 session tokens         - MIME / Magic byte checks      - Calibrated NLP    |
+---------------------+---------------------+---------------------+---------------------+
                      |                     |                     |
         DynamoDB DocumentClient            |           Presigned S3 Auth / Stream
                      |                     |                     |
+---------------------v-----+               |               +-----v---------------------+
|       AWS DYNAMODB        |               |               |          AWS S3           |
|      (VIGILORA-Main)      |               |               |     (Private Enclave)     |
| - INCIDENT#<id>           |               |               | - evidence/<campus>/<id>  |
| - TEAM#<id>               |               |               | - Strict CORS policy      |
| - ACTIVITY#<id>           |               |               | - Block Public Access     |
| - USER#<email>            |               |               +---------------------------+
| - SESSION#<tokenHash>     |               |
+---------------------------+               |
                                            |
                              +-------------v-------------+
                              |     EXTERNAL AI API       |
                              |  (Google Gemini Flash)    |
                              |  * Optional / 3s timeout  |
                              +---------------------------+
```

---

## 5. Core Operational Workflows

### A. Incident Reporting & Evidence Upload
1. Operator navigates to `/report`. Form initializes in a guaranteed fresh state via `vigilora:new-report` event.
2. Operator provides narrative, campus sector, and optional JPEG/PNG/WebP photograph.
3. System requests short-lived Presigned POST credentials from `/api/upload/authorize`.
4. Photograph streams directly from the browser to private S3 storage (zero base64 storage in database).
5. `/api/upload/complete` verifies object presence in S3 and persists metadata in DynamoDB.

### B. Intelligent Auto-Triage Workflow
1. When a description is entered (or on blur), `/api/incidents/triage` analyzes the narrative.
2. If `GEMINI_API_KEY` is configured, calls Gemini 1.5 Flash with strict JSON schema constraints and a **3000ms hard `AbortController` timeout**.
3. If the external API is absent, times out, or fails schema validation, the engine **instantly falls back to the local calibrated NLP engine**.
4. The NLP engine scores keywords across 7 domains with critical life-safety weighting.
5. **Honesty Guardrail**: If the narrative is ambiguous, `confidenceScore` is strictly returned as `null` (never fabricated).
6. High-threat indicators trigger an immediate **Life-Safety Advisory** ("Contact 911 immediately").

### C. Tactical Unit Assignment & Resolution Lifecycle
1. Dispatcher selects an incident and deploys a tactical unit (e.g. `MED-01`) from `/incidents` or dashboard inspector.
2. System executes an atomic DynamoDB `TransactWriteCommand`:
   - Incident transitions to `"Assigned"`.
   - Team status transitions to `"En Route"` with `activeIncidentId` bound.
   - An audit `ActivityEvent` is appended to the timeline.
3. If an engaged team is selected for reassignment, an in-app confirmation modal prevents accidental collisions.
4. Upon incident resolution (`status = "Resolved"`), the assigned tactical unit is **automatically released** back to `"Available"` in DynamoDB.

### D. Tactical Map & Telemetry Quarantine
1. Renders Blackwood Campus in a normalized $1000 \times 1000$ SVG vector coordinate space.
2. Displays Great Auditorium, Sports Complex, STEM Quad, Central Plaza, Arts District, and South Depot footprints.
3. Pins pulse with severity-specific colors: Critical (`#F01420`), High (`#EA580C`), Medium (`#D97706`), Low (`#475569`).
4. **Honesty Guardrail**: Incidents without verified coordinates (`coordinates === undefined`) are quarantined in the bottom-right **"Pending Sensor Triangulation"** dock. Zero arbitrary positions are plotted.

### E. Analytics & PDF Export
1. `/analytics` computes resolution rate and active hazard load directly from authenticated DynamoDB state.
2. Clicking **"Export Summary Report"** triggers `jspdf` to construct `VIGILORA_Campus_Incident_Summary.pdf`.
3. The report formats executive KPI boxes, response velocity telemetry, sector and category tables, and an incident manifest.
4. **Honesty Guardrail**: Response time telemetry is derived strictly from real dispatch activity deltas. In the absence of logged timestamps, the report honestly states: `"Not available (Awaiting dispatch timeline telemetry)"`.

---

## 6. Authentication & Demo Roles

VIGILORA implements a zero-trust server-side authentication model. Public self-registration is closed for grid security; accounts are provisioned directly by campus supervisors.

### Pre-Provisioned Demo Roles for Hackathon Evaluators
For convenience during hackathon judging, one-click demo login buttons are provided on `/login`:

| Demo Role | Station Identifier | Assigned Scope | Permitted Actions |
| :--- | :--- | :--- | :--- |
| **Lead Dispatcher** | `DISPATCH-LEAD-01` | Campus-Wide Dispatch | Review incident queue, assign/unassign response teams, update operational status, export PDF summary. Forbidden from modifying campus emergency configuration. |
| **Field Responder** | `UNIT-ALPHA-1` (Officer Vance) | Unit `MED-01` Only | **Isolated View**: Sees only incidents assigned to `MED-01` (`VIG-2026-171`). May update status (`Responding`, `On Scene`, `Assigned`) and add field notes. Forbidden from reclassifying or assigning units. |
| **Campus Administrator** | `SUPERVISOR-METROPOLIS` | Full Governance | Full system authority: modify campus emergency contact protocols, hotline numbers, siren alerts, and AI triage settings. |

*Production Note: Demo login is strictly disabled in production environments (`NODE_ENV=production`) unless explicitly authorized via `ENABLE_DEMO_LOGIN=true`.*

---

## 7. Local Installation & Setup

### Prerequisites
- Node.js 20.x or higher
- npm 10.x or higher
- Access to AWS DynamoDB and S3 (configured via AWS CLI or environment credentials)

### Quick Start
```bash
# 1. Clone the repository
git clone https://github.com/your-org/vigilora.git
cd vigilora

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local with your AWS configuration and optional Gemini API key

# 4. Provision Demo Users & Seed Teams in DynamoDB
npx tsx scripts/provision-demo-users.ts
npx tsx scripts/seed-campus-teams.ts

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 8. Verification & Test Commands

VIGILORA maintains an automated verification suite covering end-to-end functionality without third-party test runners:

```bash
# Type check & Production Compilation
npx tsc --noEmit
npm run build

# Feature-Specific Automated Test Suites
npx tsx scripts/test-demo-roles.ts           # Demo role login & RBAC permissions (30 assertions)
npx tsx scripts/test-responder-e2e.ts        # Field responder boundary isolation (31 assertions)
npx tsx scripts/test-triage-suite.ts         # Intelligent AI triage & fallback (46 assertions)
npx tsx scripts/test-tactical-map.ts         # Tactical map footprints & coordinates (38 assertions)
npx tsx scripts/test-evidence-lightbox.ts    # Evidence viewer & lightbox shortcuts (33 assertions)
npx tsx scripts/test-report-flow.ts          # Incident report lifecycle & fresh form (37 assertions)
npx tsx scripts/test-team-assignment.ts      # Response team assignment & auto-release (32 assertions)
npx tsx scripts/test-pdf-export.ts           # PDF binary validation & telemetry honesty (40 assertions)

# Real Browser Interaction Test (Playwright with Microsoft Edge)
npx tsx scripts/test-pdf-browser-download.ts # Browser PDF download event verification (9 assertions)
```

---

## 9. Security Notes

- **Password Storage**: Node.js native `crypto.scrypt` with unique 16-byte cryptographically secure random salts.
- **Session Tokens**: 256-bit entropy (`crypto.randomBytes(32)`). Plain tokens are only stored in `HttpOnly`, `SameSite=Lax`, `Secure` cookies. DynamoDB stores strictly SHA-256 hashes (`tokenHash`).
- **Multi-Tenant Boundary Isolation**: All database operations query strictly by caller partition key (`pk: CAMPUS#METROPOLIS`). Cross-campus access is rejected with HTTP 404/403 to prevent IDOR vulnerabilities.
- **Evidence Enclave**: Private S3 bucket with all public access blocked. Files are streamed exclusively via authenticated proxy (`/api/evidence/[id]`) with `nosniff`, `sandbox`, and `DENY` frame security headers.
- **Credential Protection**: Zero passwords, tokens, or AWS secrets are hardcoded in frontend client components.

---

## 10. Known Limitations

1. **Schematic Map vs. Live GPS Hardware**: The tactical map currently operates on a normalized vector schematic coordinate space ($0-100\%$) suitable for campus operations. Direct integration with physical GPS/APRS transceivers is reserved for Phase 4.
2. **Demo Credentials in Stateless Containers**: In stateless container environments (e.g. AWS Lambda without disk persistence), `.demo-credentials.json` must be supplied via the `DEMO_CREDENTIALS_JSON` environment variable if demo logins are required.
3. **Canonical Theme Lock**: VIGILORA is intentionally locked to its canonical Victorian Gothic nocturnal theme. High-contrast day modes are not supported by design.
4. **DevDependency Linter Advisory**: `npm audit` reports 16 moderate severity advisories in `eslint-config-next` / `minimatch` dev dependencies. This has zero impact on runtime production bundles.

---

## 11. License

VIGILORA is proprietary software built for campus security and emergency response operations. All rights reserved.
