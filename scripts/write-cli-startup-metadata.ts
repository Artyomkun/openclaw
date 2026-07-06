#!/usr/bin/env -S node --import tsx

/**
 * Write CLI Startup Metadata
 */

import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const outputPath = "dist/cli-startup-metadata.json";

function getHelp(command: string): string {
  try {
    return execSync(`node openclaw.ts ${command} --help`, {
      encoding: "utf8",
      timeout: 10000,
    });
  } catch {
    return `Command ${command} help not available`;
  }
}

const commands = ["", "gateway", "models", "plugins", "sessions", "doctor", "tasks"];

const helpTexts = Object.fromEntries(
  commands.map(cmd => [cmd || "root", getHelp(cmd)])
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify({
  generated: new Date().toISOString(),
  commands: helpTexts,
}, null, 2));

console.log("✅ CLI startup metadata generated");