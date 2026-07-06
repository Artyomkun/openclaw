#!/usr/bin/env -S node --import tsx

/**
 * Update Clawtributors
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function getContributors(): string[] {
  const log = execSync(
    "git log --format=%an|%ae --numstat",
    { encoding: "utf8" }
  );
  
  const users = new Map<string, number>();
  
  for (const line of log.split("\n")) {
    if (line.includes("|")) {
      const [name] = line.split("|");
      const key = name.trim().toLowerCase();
      users.set(key, (users.get(key) || 0) + 1);
    }
  }
  return Array.from(users.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([name]) => name);
}

const contributors = getContributors();

const list = contributors.map(name => `- ${name}`).join("\n");

const readme = `# Contributors\n\n${list}`;
writeFileSync("CONTRIBUTORS.md", readme);

console.log(`✅ Updated with ${contributors.length} contributors`);