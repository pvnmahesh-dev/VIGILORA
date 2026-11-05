import assert from "node:assert";

console.log("================================================================================");
console.log("       VIGILORA: S3_BUCKET CONFIGURATION & PRODUCTION ERROR AUDIT");
console.log("================================================================================");

const originalNodeEnv = process.env.NODE_ENV;
const originalS3Bucket = process.env.S3_BUCKET;

function restoreEnv(): void {
  if (originalNodeEnv !== undefined) {
    Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
  } else {
    Reflect.deleteProperty(process.env, "NODE_ENV");
  }

  if (originalS3Bucket !== undefined) {
    process.env.S3_BUCKET = originalS3Bucket;
  } else {
    delete process.env.S3_BUCKET;
  }
}

// Scenario 1: Missing S3_BUCKET in production strictly throws configuration error
console.log("\n[SCENARIO 1: Missing S3_BUCKET in Production]");
try {
  Reflect.set(process.env, "NODE_ENV", "production");
  delete process.env.S3_BUCKET;

  let errorThrown = false;
  try {
    // Clear require cache for aws.ts
    const awsPath = require.resolve("../src/lib/aws");
    delete require.cache[awsPath];
    require("../src/lib/aws");
  } catch (err: unknown) {
    errorThrown = true;
    const message = err instanceof Error ? err.message : String(err);
    assert(
      message.includes("Missing required environment variable 'S3_BUCKET' in production"),
      `Error message explains required S3_BUCKET in production (Got: ${message})`
    );
    console.log("  [PASS] Missing production S3_BUCKET throws explicit configuration error:");
    console.log(`         "${message}"`);
  }
  assert(errorThrown, "Expected error was thrown when S3_BUCKET is missing in production");
} finally {
  restoreEnv();
}

// Scenario 2: Explicitly configured S3_BUCKET in production succeeds
console.log("\n[SCENARIO 2: Explicitly Configured S3_BUCKET in Production]");
try {
  Reflect.set(process.env, "NODE_ENV", "production");
  process.env.S3_BUCKET = "production-evidence-vault-secure";

  const awsPath2 = require.resolve("../src/lib/aws");
  delete require.cache[awsPath2];
  const { S3_BUCKET: prodBucket } = require("../src/lib/aws");

  assert.strictEqual(prodBucket, "production-evidence-vault-secure");
  console.log("  [PASS] Explicitly configured bucket accepted in production:", prodBucket);
} finally {
  restoreEnv();
}

// Scenario 3: Local Development loads from .env.local automatically
console.log("\n[SCENARIO 3: Development Automatically Loads from .env.local]");
try {
  Reflect.set(process.env, "NODE_ENV", "development");
  delete process.env.S3_BUCKET;

  const awsPath3 = require.resolve("../src/lib/aws");
  delete require.cache[awsPath3];
  const { S3_BUCKET: devLoadedBucket } = require("../src/lib/aws");

  assert(devLoadedBucket && devLoadedBucket.length > 0, "Development bucket loaded successfully");
  console.log("  [PASS] Development bucket automatically loaded from .env.local:", devLoadedBucket);
} finally {
  restoreEnv();
}

// Scenario 4: Local Development explicit bucket from .env.local
console.log("\n[SCENARIO 4: Development with Explicit Bucket]");
try {
  Reflect.set(process.env, "NODE_ENV", "development");
  process.env.S3_BUCKET = "vigilora-evidence-399527676157-eu-north-1-an";

  const awsPath4 = require.resolve("../src/lib/aws");
  delete require.cache[awsPath4];
  const { S3_BUCKET: devExplicitBucket } = require("../src/lib/aws");

  assert.strictEqual(devExplicitBucket, "vigilora-evidence-399527676157-eu-north-1-an");
  console.log("  [PASS] Explicit local development bucket accepted:", devExplicitBucket);
} finally {
  restoreEnv();
}

console.log("\n================================================================================");
console.log("  ALL S3_BUCKET CONFIGURATION SCENARIOS PASSED (4/4)");
console.log("================================================================================\n");
