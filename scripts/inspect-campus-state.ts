import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "../src/lib/aws";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

async function inspectState() {
  const pk = getCampusPartitionKey();
  console.log("Partition Key:", pk);
  console.log("Table:", DYNAMODB_TABLE);

  const teamsRes = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "TEAM#",
      },
    })
  );
  console.log("\nTeams in DynamoDB:", teamsRes.Items?.length || 0);
  for (const t of teamsRes.Items || []) {
    console.log(`  - ${t.id}: ${t.name} (${t.status}) - active: ${t.activeIncidentId || "none"}`);
  }

  const incRes = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "INCIDENT#",
      },
    })
  );
  console.log("\nIncidents in DynamoDB:", incRes.Items?.length || 0);
  for (const inc of incRes.Items || []) {
    console.log(`  - ${inc.id}: ${inc.title} (${inc.status}) - assigned: ${inc.assignedTeamId || "none"}`);
  }
}

inspectState().catch(console.error);
