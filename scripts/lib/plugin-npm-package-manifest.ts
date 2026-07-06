/**
 * Plugin NPM Package Manifest
 */

import fs from "node:fs";
import path from "node:path";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function generatePluginManifest(packageDir) {
  const packageJson = readJson(path.join(packageDir, "package.json"));
  const manifest = readJson(path.join(packageDir, "openclaw.plugin.json"));
  if (packageJson.openclaw?.runtimeExtensions) {
    manifest.runtimeExtensions = packageJson.openclaw.runtimeExtensions;
  }
  if (packageJson.openclaw?.setupEntry) {
    manifest.setupEntry = packageJson.openclaw.setupEntry;
  }
  writeJson(path.join(packageDir, "openclaw.plugin.json"), manifest);
  console.log(`✅ Generated manifest for ${path.basename(packageDir)}`);
}