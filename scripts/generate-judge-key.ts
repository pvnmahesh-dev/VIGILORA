/**
 * VIGILORA Cryptographic Judge Access Key Generator
 *
 * Generates high-entropy (192-bit) cryptographically secure evaluators keys
 * for hackathon judge access.
 *
 * Usage:
 *   npx tsx scripts/generate-judge-key.ts
 */

import crypto from "node:crypto";

function generateJudgeKey(): string {
  const bytes = crypto.randomBytes(24);
  return `vig_eval_${bytes.toString("base64url")}`;
}

const key = generateJudgeKey();

console.log("================================================================================");
console.log("          VIGILORA HACKATHON EVALUATOR ACCESS KEY GENERATOR                     ");
console.log("================================================================================\n");
console.log(`Generated Key: ${key}\n`);
console.log("Configuration Instructions:");
console.log("1. For Vercel Production Deployment:");
console.log(`   Set JUDGE_ACCESS_KEY=${key}`);
console.log("   Set ENABLE_DEMO_LOGIN=true\n");
console.log("2. For Local Development / Testing:");
console.log(`   Add to .env.local: JUDGE_ACCESS_KEY=${key}\n`);
console.log("3. For Zero-Downtime Rotation:");
console.log(`   Append comma-separated: JUDGE_ACCESS_KEY=<old_key>,${key}`);
console.log("================================================================================");

