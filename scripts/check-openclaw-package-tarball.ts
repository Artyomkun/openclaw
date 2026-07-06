#!/usr/bin/env node
// Validates the npm tarball Docker E2E lanes install.
// This is intentionally tarball-only: the check proves Docker lanes consume the
// prebuilt package artifact with dist inventory, not a source checkout.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { LOCAL_BUILD_METADATA_DIST_PATHS } from "./lib/local-build-metadata-paths.ts";
import {
  collectPackageDistImports,
  collectPackageDistImportErrors,
  expandPackageDistImportClosure,
} from "./lib/package-dist-imports.ts";

function usage() {
  return "Usage: node scripts/check-openclaw-package-tarball.ts <openclaw.tgz>";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const tarball = args[0]?.trim() ?? "";
  if (tarball === "--help" || tarball === "-h") {
    return { help: true, tarball: "" };
  }
  if (!tarball) {
    throw new Error(usage());
  }
  if (tarball.startsWith("-")) {
    throw new Error(`Unknown OpenClaw package tarball check option: ${tarball}`);
  }
  const extraArg = args[1]?.trim();
  if (extraArg) {
    throw new Error(`Unexpected OpenClaw package tarball check argument: ${extraArg}`);
  }
  return { help: false, tarball };
}

let cliArgs;
try {
  cliArgs = parseArgs(process.argv.slice(2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
if (cliArgs.help) {
  console.log(usage());
  process.exit(0);
}

const { tarball } = cliArgs;
if (!fs.existsSync(tarball)) {
  fail(`OpenClaw package tarball does not exist: ${tarball}`);
}

const phaseTimingsEnabled = process.env.OPENCLAW_PACKAGE_TARBALL_CHECK_TIMINGS !== "0";
function runPhase(label, action) {
  const startedAt = performance.now();
  try {
    return action();
  } finally {
    if (phaseTimingsEnabled) {
      const durationMs = Math.round(performance.now() - startedAt);
      console.error(`check-openclaw-package-tarball: ${label} completed in ${durationMs}ms`);
    }
  }
}

const list = runPhase("tar list", () =>
  spawnSync("tar", ["-tf", tarball], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
if (list.status !== 0) {
  fail(`tar -tf failed for ${tarball}: ${list.stderr || list.status}`);
}

const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-package-tarball-"));
try {
  const extract = runPhase("tar extract", () =>
    spawnSync("tar", ["-xf", tarball, "-C", extractDir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  if (extract.status !== 0) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fail(`tar -xf failed for ${tarball}: ${extract.stderr || extract.status}`);
  }
} catch (error) {
  fs.rmSync(extractDir, { recursive: true, force: true });
  throw error;
}

const entries = list.stdout
  .split(/\r?\n/u)
  .map((entry) => entry.trim())
  .filter(Boolean);
const normalized = entries.map((entry) => entry.replace(/^package\//u, ""));
const entrySet = new Set(normalized);
const errors = [];
const REQUIRED_TARBALL_ENTRIES = ["dist/control-ui/index.html"];
const REQUIRED_TARBALL_ENTRY_PREFIXES = ["dist/control-ui/assets/"];
const FORBIDDEN_LOCAL_BUILD_METADATA_FILES = new Set(LOCAL_BUILD_METADATA_DIST_PATHS);

function readTarEntry(entryPath) {
  const candidates = [
    path.join(extractDir, entryPath),
    path.join(extractDir, "package", entryPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf8");
    }
  }
  return "";
}

for (const entry of normalized) {
  if (entry.startsWith("/") || entry.split("/").includes("..")) {
    errors.push(`unsafe tar entry: ${entry}`);
  }
}

if (!entrySet.has("package.json")) {
  errors.push("missing package.json");
}
if (!normalized.some((entry) => entry.startsWith("dist/"))) {
  errors.push("missing dist/ entries");
}
for (const requiredEntry of REQUIRED_TARBALL_ENTRIES) {
  if (!entrySet.has(requiredEntry)) {
    errors.push(`missing required tar entry ${requiredEntry}`);
  }
}
for (const requiredPrefix of REQUIRED_TARBALL_ENTRY_PREFIXES) {
  if (!normalized.some((entry) => entry.startsWith(requiredPrefix))) {
    errors.push(`missing required tar entries under ${requiredPrefix}`);
  }
}
let packageVersion = "";
if (entrySet.has("package.json")) {
  try {
    const packageJson = JSON.parse(readTarEntry("package.json"));
    packageVersion = typeof packageJson.version === "string" ? packageJson.version : "";
  } catch {
    packageVersion = "";
  }
}
if (entrySet.has("package-lock.json")) {
  errors.push("package tarball must ship npm-shrinkwrap.json, not package-lock.json");
}
for (const forbiddenEntry of FORBIDDEN_LOCAL_BUILD_METADATA_FILES) {
  if (entrySet.has(forbiddenEntry)) {
    errors.push(`forbidden local build metadata tar entry ${forbiddenEntry}`);
  }
}
if (!entrySet.has("dist/postinstall-inventory.json")) {
  errors.push("missing dist/postinstall-inventory.json");
}
let packageDistImports = null;
if (entrySet.has("dist/postinstall-inventory.json")) {
  try {
    const inventory = JSON.parse(readTarEntry("dist/postinstall-inventory.json"));
    if (!Array.isArray(inventory) || inventory.some((entry) => typeof entry !== "string")) {
      errors.push("invalid dist/postinstall-inventory.json");
    } else {
      const normalizedInventory = inventory.map((entry) => entry.replace(/\\/gu, "/"));
      const normalizedInventorySet = new Set(normalizedInventory);
      packageDistImports = runPhase("dist import graph", () =>
        collectPackageDistImports({
          files: normalized,
          readText: readTarEntry,
        }),
      );
      for (const inventoryEntry of inventory) {
        const normalizedEntry = inventoryEntry.replace(/\\/gu, "/");
        if (!entrySet.has(normalizedEntry)) {
          errors.push(`inventory references missing tar entry ${normalizedEntry}`);
        }
      }
      const expandedInventory = expandPackageDistImportClosure({
        files: normalized,
        seedFiles: normalizedInventory,
        readText: readTarEntry,
        imports: packageDistImports,
      });
      for (const importedEntry of expandedInventory) {
        if (!normalizedInventorySet.has(importedEntry)) {
          errors.push(`inventory omits imported dist file ${importedEntry}`);
        }
      }
    }
  } catch (error) {
    errors.push(
      `unreadable dist/postinstall-inventory.json: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

errors.push(
  ...collectPackageDistImportErrors({
    files: normalized,
    readText: readTarEntry,
    imports: packageDistImports ?? undefined,
  }),
);

if (errors.length > 0) {
  fs.rmSync(extractDir, { recursive: true, force: true });
  fail(`OpenClaw package tarball integrity failed:\n${errors.join("\n")}`);
}
fs.rmSync(extractDir, { recursive: true, force: true });
console.log("OpenClaw package tarball integrity passed.");
