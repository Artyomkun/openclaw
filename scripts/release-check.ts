#!/usr/bin/env -S node --import tsx

/**
 * Release Check
 */

import { execSync } from "node:child_process";

async function main() {
  console.log("📦 Building...");
  execSync("pnpm build", { stdio: "inherit" });
  console.log("📦 Packing...");
  const output = execSync("npm pack --dry-run --json", { encoding: "utf8" });
  const result = JSON.parse(output);
  
  if (!result?.[0]?.files?.length) {
    throw new Error("No files in pack");
  }

  console.log(`✅ ${result[0].files.length} files in pack`);
  console.log("🎉 Release ready");
}

main().catch(console.error);