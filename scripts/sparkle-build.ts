#!/usr/bin/env -S node --import tsx
// Sparkle Build

function getBuild(version: string): number | null {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3) return null;
  
  const [year, month, patch] = parts;
  if (year < 2024 || month < 1 || month > 12 || patch < 1) return null;
  
  // Просто: YYYYMM + patch * 100 + 90
  return year * 10000 + month * 100 + patch * 100 + 90;
}

const version = process.argv[2];
if (!version) {
  console.error("Usage: script <version>");
  process.exit(1);
}

const build = getBuild(version);
if (build === null) {
  console.error("Invalid version");
  process.exit(1);
}

console.log(String(build));