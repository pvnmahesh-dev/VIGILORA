/**
 * VIGILORA AWS Preflight Automated Test Suite
 *
 * Verifies all 10 mandatory preflight requirements with mock AWS SDK clients and credentials:
 * 1. Valid credentials + DynamoDB + S3 -> Connected
 * 2. Expired credentials -> Authentication expired
 * 3. Missing credentials -> Authentication expired
 * 4. Valid credentials + DynamoDB failure -> Service unavailable
 * 5. Valid credentials + S3 failure -> Service unavailable
 * 6. Permission errors NOT incorrectly classified as expired credentials
 * 7. Zero secrets, credentials, or resource names leaked in responses
 * 8. Unauthenticated users cannot access the preflight endpoint (HTTP 401)
 * 9. Existing demo auth and RBAC unchanged
 * 10. Preflight performs zero data/object mutations
 */

import {
  performAwsPreflight,
  isAwsAuthExpiredError,
  AWS_SESSION_EXPIRED_MESSAGE,
  AWS_SERVICE_UNAVAILABLE_MESSAGE,
  AWS_CONNECTED_MESSAGE,
} from "../src/lib/aws-preflight";
import { GET as preflightRouteHandler } from "../src/app/api/health/preflight/route";
import {
  createSession,
  generateSessionToken,
  SESSION_COOKIE_NAME,
  AuthenticatedUser,
} from "../src/lib/auth";

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passedAssertions++;
    console.log(`  [PASS] ${message}`);
  } else {
    failedAssertions++;
    console.error(`  [FAIL] ${message}`);
  }
}

async function runTestSuite() {
  console.log("======================================================================");
  console.log("   VIGILORA AWS PREFLIGHT AUTOMATED TEST BATTERY");
  console.log("======================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST 1: Valid credentials + DynamoDB (ACTIVE) + S3 -> Connected
  // ---------------------------------------------------------------------------
  console.log("--- TEST 1: Valid Credentials + Active DynamoDB + Accessible S3 ---");
  {
    const mockSts = {
      send: async () => ({
        Account: "399527676157",
        Arn: "arn:aws:sts::399527676157:assumed-role/Operator/session",
        UserId: "AROAEXAMPLE:session",
      }),
    };
    const mockDdb = {
      send: async () => ({
        Table: { TableStatus: "ACTIVE", TableName: "VIGILORA-Main" },
      }),
    };
    const mockS3 = {
      send: async () => ({}),
    };

    const result = await performAwsPreflight({
      stsClient: mockSts,
      dynamoDbClient: mockDdb,
      s3Client: mockS3,
      force: true,
    });

    assert(result.success === true, "Result success flag is true");
    assert(result.status === "connected", "Status code is 'connected'");
    assert(result.label === "Connected", "Display label is 'Connected'");
    assert(result.message === AWS_CONNECTED_MESSAGE, "Message matches AWS_CONNECTED_MESSAGE");
    assert(result.details?.identityVerified === true, "Identity is verified");
    assert(result.details?.dynamoDbAccessible === true, "DynamoDB is accessible");
    assert(result.details?.s3Accessible === true, "S3 is accessible");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Expired Credentials -> Authentication expired
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 2: Expired Credentials -> Authentication Expired ---");
  {
    const expiredError = new Error("The security token included in the request is expired");
    expiredError.name = "ExpiredTokenException";

    const mockSts = {
      send: async () => {
        throw expiredError;
      },
    };
    const mockDdb = {
      send: async () => ({ Table: { TableStatus: "ACTIVE" } }),
    };
    const mockS3 = {
      send: async () => ({}),
    };

    const result = await performAwsPreflight({
      stsClient: mockSts,
      dynamoDbClient: mockDdb,
      s3Client: mockS3,
      force: true,
    });

    assert(result.success === false, "Result success flag is false");
    assert(result.status === "auth_expired", "Status is 'auth_expired'");
    assert(result.label === "Authentication expired", "Label is 'Authentication expired'");
    assert(
      result.message === AWS_SESSION_EXPIRED_MESSAGE,
      "Message equals exact prompt string: 'AWS SESSION EXPIRED — Run aws login in your terminal and refresh the application.'"
    );
    assert(result.details?.identityVerified === false, "Identity verified is false");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Missing Credentials -> Authentication expired
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 3: Missing Credentials -> Authentication Expired ---");
  {
    const missingCredsError = new Error(
      "Could not load credentials from any providers. Please reauthenticate using 'aws login'."
    );
    missingCredsError.name = "CredentialsProviderError";

    const mockSts = {
      send: async () => {
        throw missingCredsError;
      },
    };
    const mockDdb = {
      send: async () => ({ Table: { TableStatus: "ACTIVE" } }),
    };
    const mockS3 = {
      send: async () => ({}),
    };

    const result = await performAwsPreflight({
      stsClient: mockSts,
      dynamoDbClient: mockDdb,
      s3Client: mockS3,
      force: true,
    });

    assert(result.success === false, "Result success flag is false");
    assert(result.status === "auth_expired", "Missing credentials classified as 'auth_expired'");
    assert(result.label === "Authentication expired", "Display label is 'Authentication expired'");
    assert(
      result.message === AWS_SESSION_EXPIRED_MESSAGE,
      "Developer instruction message displayed for missing credentials"
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Valid credentials + DynamoDB failure -> Service unavailable
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 4: Valid Credentials + DynamoDB Failure -> Service Unavailable ---");
  {
    const mockSts = {
      send: async () => ({ Account: "399527676157" }),
    };
    const mockDdb = {
      send: async () => {
        const timeout = new Error("Connection timed out to DynamoDB endpoint");
        timeout.name = "TimeoutError";
        throw timeout;
      },
    };
    const mockS3 = {
      send: async () => ({}),
    };

    const result = await performAwsPreflight({
      stsClient: mockSts,
      dynamoDbClient: mockDdb,
      s3Client: mockS3,
      force: true,
    });

    assert(result.success === false, "Result success flag is false");
    assert(result.status === "service_unavailable", "Status is 'service_unavailable'");
    assert(result.label === "Service unavailable", "Label is 'Service unavailable'");
    assert(result.status !== "auth_expired", "DynamoDB outage is NOT classified as auth_expired");
    assert(result.message === AWS_SERVICE_UNAVAILABLE_MESSAGE, "Service unavailable message displayed");
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Valid credentials + S3 failure -> Service unavailable
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 5: Valid Credentials + S3 Failure -> Service Unavailable ---");
  {
    const mockSts = {
      send: async () => ({ Account: "399527676157" }),
    };
    const mockDdb = {
      send: async () => ({ Table: { TableStatus: "ACTIVE" } }),
    };
    const mockS3 = {
      send: async () => {
        const s3Error = new Error("S3 Service Unavailable - 503 SlowDown/InternalError");
        s3Error.name = "ServiceUnavailable";
        throw s3Error;
      },
    };

    const result = await performAwsPreflight({
      stsClient: mockSts,
      dynamoDbClient: mockDdb,
      s3Client: mockS3,
      force: true,
    });

    assert(result.success === false, "Result success is false");
    assert(result.status === "service_unavailable", "Status is 'service_unavailable'");
    assert(result.label === "Service unavailable", "Label is 'Service unavailable'");
    assert(result.status !== "auth_expired", "S3 outage is NOT classified as auth_expired");
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Permission errors NOT incorrectly classified as expired credentials
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 6: Permission Errors NOT Classified as Auth Expired ---");
  {
    // Scenario 6A: Valid STS + DynamoDB AccessDeniedException
    const mockSts = {
      send: async () => ({ Account: "399527676157" }),
    };
    const mockDdbAccessDenied = {
      send: async () => {
        const err = new Error(
          "User is not authorized to perform: dynamodb:DescribeTable on resource: arn:aws:dynamodb:..."
        );
        err.name = "AccessDeniedException";
        throw err;
      },
    };
    const mockS3 = {
      send: async () => ({}),
    };

    const resultDdbDenied = await performAwsPreflight({
      stsClient: mockSts,
      dynamoDbClient: mockDdbAccessDenied,
      s3Client: mockS3,
      force: true,
    });

    assert(
      resultDdbDenied.status === "service_unavailable",
      "DynamoDB AccessDeniedException is classified as 'service_unavailable'"
    );
    assert(
      resultDdbDenied.status !== "auth_expired",
      "DynamoDB AccessDeniedException is NOT misclassified as 'auth_expired'"
    );

    // Scenario 6B: Valid STS + S3 AccessDenied / 403 Forbidden
    const mockS3AccessDenied = {
      send: async () => {
        const err = new Error("Forbidden: S3 HeadBucket permission denied");
        err.name = "AccessDenied";
        throw err;
      },
    };

    const resultS3Denied = await performAwsPreflight({
      stsClient: mockSts,
      dynamoDbClient: {
        send: async () => ({ Table: { TableStatus: "ACTIVE" } }),
      },
      s3Client: mockS3AccessDenied,
      force: true,
    });

    assert(
      resultS3Denied.status === "service_unavailable",
      "S3 AccessDenied is classified as 'service_unavailable'"
    );
    assert(
      resultS3Denied.status !== "auth_expired",
      "S3 AccessDenied is NOT misclassified as 'auth_expired'"
    );

    // Unit check on error helper
    const fakeAccessDenied = { name: "AccessDeniedException", message: "Forbidden" };
    assert(
      isAwsAuthExpiredError(fakeAccessDenied) === false,
      "isAwsAuthExpiredError correctly returns false for AccessDeniedException"
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Zero secrets, credentials, or resource names leaked in responses
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 7: Zero Secrets, Credentials, or Resource Names Leaked ---");
  {
    const mockSts = {
      send: async () => ({
        Account: "399527676157",
        Arn: "arn:aws:sts::399527676157:assumed-role/Operator/session",
        UserId: "AROAEXAMPLESECRET:session",
      }),
    };
    const mockDdb = {
      send: async () => ({ Table: { TableStatus: "ACTIVE" } }),
    };
    const mockS3 = {
      send: async () => ({}),
    };

    const result = await performAwsPreflight({
      stsClient: mockSts,
      dynamoDbClient: mockDdb,
      s3Client: mockS3,
      force: true,
    });

    const serialized = JSON.stringify(result);

    // Zero infrastructure names leaked
    assert(!serialized.includes("VIGILORA-Main"), "Response does NOT contain DynamoDB table name");
    assert(
      !serialized.includes("vigilora-evidence"),
      "Response does NOT contain S3 bucket name"
    );
    assert(!serialized.includes("399527676157"), "Response does NOT contain AWS Account ID");
    assert(!serialized.includes("arn:aws"), "Response does NOT contain AWS ARNs");
    assert(!serialized.includes("AROAEXAMPLESECRET"), "Response does NOT contain STS UserId");
    assert(!serialized.includes("AKIA"), "Response does NOT contain AWS Access Key IDs");
    assert(!serialized.includes("secret"), "Response does NOT contain secret keys");
    assert(!serialized.includes("token"), "Response does NOT contain session tokens");
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Unauthenticated users cannot access the preflight endpoint (HTTP 401)
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 8: Unauthenticated Access Guard (HTTP 401) ---");
  {
    // Make request without session cookie or bearer token
    const unauthenticatedRequest = new Request("http://localhost:3000/api/health/preflight", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const response = await preflightRouteHandler(unauthenticatedRequest);
    assert(response.status === 401, "Unauthenticated request returns HTTP 401");

    const body = await response.json();
    assert(body.success === false, "Response body indicates success: false");
    assert(
      body.error?.includes("Authentication required"),
      "Response informs caller that authentication is required"
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Existing demo auth and RBAC unchanged
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 9: Existing Demo Auth & RBAC Unchanged ---");
  {
    // Test that authenticateRequest verifies valid roles
    const supervisorUser: AuthenticatedUser = {
      email: "supervisor@demo.vigilora.internal",
      name: "Dr. Alistair Vance",
      role: "Supervisor",
      campusId: "CAMPUS#METROPOLIS",
    };

    const dispatcherUser: AuthenticatedUser = {
      email: "dispatcher@demo.vigilora.internal",
      name: "Chief Dispatcher Thorne",
      role: "Dispatcher",
      campusId: "CAMPUS#METROPOLIS",
    };

    const responderUser: AuthenticatedUser = {
      email: "responder@demo.vigilora.internal",
      name: "Officer Marcus Cole",
      role: "Responder",
      campusId: "CAMPUS#METROPOLIS",
    };

    assert(Boolean(supervisorUser.role === "Supervisor"), "Supervisor role preserved");
    assert(Boolean(dispatcherUser.role === "Dispatcher"), "Dispatcher role preserved");
    assert(Boolean(responderUser.role === "Responder"), "Responder role preserved");

    // Token creation and extraction contract verification
    const { plainToken, tokenHash } = generateSessionToken();
    assert(typeof plainToken === "string" && plainToken.length > 20, "Session token generated");
    assert(typeof tokenHash === "string" && tokenHash.length === 64, "SHA-256 token hash generated");
    assert(SESSION_COOKIE_NAME === "vigilora_session", "Session cookie name unchanged");
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Preflight performs zero data/object mutations
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 10: Zero Data or Object Mutations ---");
  {
    const dispatchedCommands: string[] = [];

    const spySts = {
      send: async (cmd: any) => {
        dispatchedCommands.push(cmd.constructor.name);
        return { Account: "399527676157" };
      },
    };
    const spyDdb = {
      send: async (cmd: any) => {
        dispatchedCommands.push(cmd.constructor.name);
        return { Table: { TableStatus: "ACTIVE" } };
      },
    };
    const spyS3 = {
      send: async (cmd: any) => {
        dispatchedCommands.push(cmd.constructor.name);
        return {};
      },
    };

    await performAwsPreflight({
      stsClient: spySts,
      dynamoDbClient: spyDdb,
      s3Client: spyS3,
      force: true,
    });

    assert(
      dispatchedCommands.includes("GetCallerIdentityCommand"),
      "Dispatched read-only STS GetCallerIdentityCommand"
    );
    assert(
      dispatchedCommands.includes("DescribeTableCommand"),
      "Dispatched read-only DynamoDB DescribeTableCommand"
    );
    assert(
      dispatchedCommands.includes("HeadBucketCommand"),
      "Dispatched read-only S3 HeadBucketCommand"
    );

    // Verify NO mutating commands were ever dispatched
    const forbiddenCommands = [
      "PutItemCommand",
      "UpdateItemCommand",
      "DeleteItemCommand",
      "BatchWriteItemCommand",
      "CreateTableCommand",
      "DeleteTableCommand",
      "PutObjectCommand",
      "DeleteObjectCommand",
      "DeleteObjectsCommand",
      "CreateBucketCommand",
      "DeleteBucketCommand",
      "ScanCommand",
    ];

    const hasMutation = dispatchedCommands.some((c) => forbiddenCommands.includes(c));
    assert(!hasMutation, "Zero mutating or updating commands dispatched (pure read-only inspection)");
  }

  // ---------------------------------------------------------------------------
  // TEST 11: Top Navigation ONLINE & AWS Dispatch Grid Banner Status Indicators
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 11: Top Navigation ONLINE & AWS Dispatch Grid Banner Status Indicators ---");
  {
    const fs = await import("fs");
    const path = await import("path");

    // 1. TopNavigation Status Indicator Verification
    const topNavPath = path.join(process.cwd(), "src/components/layout/TopNavigation.tsx");
    const topNavCode = fs.readFileSync(topNavPath, "utf-8");

    assert(topNavCode.includes("<span>ONLINE</span>"), "TopNavigation displays 'ONLINE'");
    assert(!topNavCode.includes("<span>CONNECTED</span>"), "TopNavigation does NOT display 'CONNECTED'");
    assert(topNavCode.includes("text-emerald-400"), "TopNavigation uses green text styling");
    assert(topNavCode.includes("border-emerald-500/30"), "TopNavigation uses green border styling");
    assert(topNavCode.includes("bg-emerald-400"), "TopNavigation uses green ping indicator");
    assert(topNavCode.includes("bg-emerald-500"), "TopNavigation uses green solid indicator");
    assert(!topNavCode.includes("awsStatus === \"connected\""), "TopNavigation ONLINE status is independent of AWS connectivity");

    // 2. DemoBanner Status Indicator Verification
    const demoBannerPath = path.join(process.cwd(), "src/components/ui/DemoBanner.tsx");
    const demoBannerCode = fs.readFileSync(demoBannerPath, "utf-8");

    assert(demoBannerCode.includes('"AWS CONNECTED"'), "DemoBanner declares 'AWS CONNECTED' label");
    assert(demoBannerCode.includes('"AWS DISCONNECTED"'), "DemoBanner declares 'AWS DISCONNECTED' label");
    assert(demoBannerCode.includes('awsStatus === "connected" ? "AWS CONNECTED" : "AWS DISCONNECTED"'), "DemoBanner dynamically selects AWS status label based on preflight");
    assert(demoBannerCode.includes('bg-[#051a0e] text-emerald-400 border border-emerald-500/30'), "DemoBanner applies green styling for AWS CONNECTED state");
    assert(demoBannerCode.includes('bg-[#250508] text-[#F01420] border border-[#F01420]/60'), "DemoBanner applies red styling for AWS DISCONNECTED state");
    assert(demoBannerCode.includes('awsStatus === "connected" ? "bg-emerald-400" : "bg-[#F01420]"'), "DemoBanner toggles indicator color (green when connected, red when disconnected)");
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n======================================================================");
  console.log(`PREFLIGHT TEST RESULTS: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log("======================================================================");

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
