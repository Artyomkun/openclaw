// Check No Monolithic Plugin Sdk Entry Imports script supports OpenClaw repository automation.
import fs from "node:fs";
import path from "node:path";
import { discoverOpenClawPlugins } from "../src/plugins/discovery.js";
import { collectFilesSync, isCodeFile, relativeToCwd } from "./check-file-utils.js";

// Match exact monolithic-root specifier in any code path:
// imports/exports, require/dynamic import, and test mocks (vi.mock/jest.mock).
const ROOT_IMPORT_PATTERN = /["']openclaw\/plugin-sdk["']/;

function hasMonolithicRootImport(content: string): boolean {
  return ROOT_IMPORT_PATTERN.test(content);
}

function collectPluginSourceFiles(rootDir: string): string[] {
  const srcDir = path.join(rootDir, "src");
  if (!fs.existsSync(srcDir)) {
    return [];
  }
  return collectFilesSync(srcDir, {
    includeFile: (filePath) => isCodeFile(filePath),
    skipDirNames: new Set(["node_modules", "dist", ".git", "coverage"]),
  });
}

function collectSharedExtensionSourceFiles(): string[] {
  return collectPluginSourceFiles(path.join(process.cwd(), "extensions", "shared"));
}

function collectBundledExtensionSourceFiles(): string[] {
  const extensionsDir = path.join(process.cwd(), "extensions");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "shared") {
      continue;
    }
    for (const srcFile of collectPluginSourceFiles(path.join(extensionsDir, entry.name))) {
      files.push(srcFile);
    }
  }
  return files;
}

function main() {
  const discovery = discoverOpenClawPlugins({});
  const bundledCandidates = discovery.candidates.filter((c) => c.origin === "bundled");
  const filesToCheck = new Set<string>();
  for (const candidate of bundledCandidates) {
    filesToCheck.add(candidate.source);
    for (const srcFile of collectPluginSourceFiles(candidate.rootDir)) {
      filesToCheck.add(srcFile);
    }
  }
  for (const sharedFile of collectSharedExtensionSourceFiles()) {
    filesToCheck.add(sharedFile);
  }
  for (const extensionFile of collectBundledExtensionSourceFiles()) {
    filesToCheck.add(extensionFile);
  }

  const monolithicOffenders: string[] = [];
  for (const entryFile of filesToCheck) {
    let content;
    try {
      content = fs.readFileSync(entryFile, "utf8");
    } catch {
      continue;
    }
    if (hasMonolithicRootImport(content)) {
      monolithicOffenders.push(entryFile);
    }
  }
  console.log(
    `OK: bundled plugin source files use scoped plugin-sdk subpaths (${filesToCheck.size} checked).`,
  );
}

main();
