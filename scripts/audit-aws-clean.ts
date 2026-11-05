import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION || "eu-north-1";
const TABLE = process.env.DYNAMODB_TABLE_NAME || "VIGILORA-Main";
const BUCKET = process.env.S3_EVIDENCE_BUCKET || "vigilora-evidence-399527676157-eu-north-1-an";

const rawDdb = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(rawDdb);
const s3 = new S3Client({ region: REGION });

async function verifyAwsClean() {
  console.log("================================================================================");
  console.log("  VIGILORA PHASE 3 HANDOFF: LIVE AWS INFRASTRUCTURE AUDIT");
  console.log("================================================================================");

  console.log("\n1. Auditing S3 Bucket:", BUCKET);
  const s3List = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET }));
  const s3Objects = s3List.Contents || [];
  console.log(`  Total objects in bucket: ${s3Objects.length}`);

  const testS3 = s3Objects.filter((o) => {
    const k = o.Key || "";
    return k.includes("test") || k.includes("brw") || k.includes("17937");
  });

  console.log(`  Test objects identified: ${testS3.length}`);
  for (const obj of testS3) {
    console.log(`    Deleting leftover test S3 object: ${obj.Key}`);
    if (obj.Key) {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
    }
  }

  console.log("\n2. Auditing DynamoDB Table:", TABLE, "under CAMPUS#METROPOLIS");
  const ddbRes = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "CAMPUS#METROPOLIS" },
    })
  );
  const items = ddbRes.Items || [];
  console.log(`  Total records under partition CAMPUS#METROPOLIS: ${items.length}`);

  const testUsers = items.filter(
    (i) =>
      i.sk.startsWith("USER#") &&
      (i.email?.includes("test") ||
        i.email?.includes("browser") ||
        i.email?.includes("supervisor.browser") ||
        i.email?.includes("e2e"))
  );
  const testTeams = items.filter(
    (i) =>
      i.sk.startsWith("TEAM#") &&
      (i.id?.includes("brw") || i.id?.includes("test") || i.name?.includes("17937") || i.name?.includes("Tactical Unit 1 ("))
  );
  const testIncidents = items.filter(
    (i) =>
      i.sk.startsWith("INCIDENT#") &&
      (i.title?.includes("Breach") ||
        i.title?.includes("Failure") ||
        i.title?.includes("Test") ||
        i.title?.includes("17937"))
  );
  const testEvidence = items.filter(
    (i) =>
      i.sk.startsWith("EVIDENCE#") &&
      (i.originalFilename?.includes("test") || i.id?.includes("test") || i.uploadedBy?.includes("test") || i.uploadedBy?.includes("browser"))
  );

  console.log(`  Test users identified: ${testUsers.length}`);
  console.log(`  Test teams identified: ${testTeams.length}`);
  console.log(`  Test incidents identified: ${testIncidents.length}`);
  console.log(`  Test evidence metadata identified: ${testEvidence.length}`);

  let cleanedDdb = 0;
  const toDelete = [...testUsers, ...testTeams, ...testIncidents, ...testEvidence];
  for (const item of toDelete) {
    console.log(`    Deleting leftover DynamoDB item: pk=${item.pk}, sk=${item.sk}`);
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { pk: item.pk, sk: item.sk } }));
    cleanedDdb++;
  }

  console.log("\n3. Post-Audit Live AWS Verification:");
  const finalS3List = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET }));
  const remainingTestS3 = (finalS3List.Contents || []).filter((o) => {
    const k = o.Key || "";
    return k.includes("test") || k.includes("brw") || k.includes("17937");
  });

  const finalDdb = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "CAMPUS#METROPOLIS" },
    })
  );
  const remainingTestDdb = (finalDdb.Items || []).filter(
    (i) =>
      (i.sk.startsWith("USER#") && (i.email?.includes("test") || i.email?.includes("browser") || i.email?.includes("e2e"))) ||
      (i.sk.startsWith("TEAM#") && (i.id?.includes("brw") || i.id?.includes("test"))) ||
      (i.sk.startsWith("INCIDENT#") && (i.title?.includes("Breach") || i.title?.includes("Failure") || i.title?.includes("Test") || i.title?.includes("17937"))) ||
      (i.sk.startsWith("EVIDENCE#") && (i.originalFilename?.includes("test") || i.uploadedBy?.includes("test") || i.uploadedBy?.includes("browser")))
  );

  console.log(`  Remaining test S3 objects: ${remainingTestS3.length}`);
  console.log(`  Remaining test DynamoDB records: ${remainingTestDdb.length}`);

  if (remainingTestS3.length === 0 && remainingTestDdb.length === 0) {
    console.log("\n>>> CERTIFICATION: ZERO TEST DATA REMAINS IN AWS DYNAMODB OR S3 <<<");
  } else {
    console.error("\n>>> WARNING: TEST DATA STILL DETECTED IN AWS <<<");
    process.exit(1);
  }
}

verifyAwsClean().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});

