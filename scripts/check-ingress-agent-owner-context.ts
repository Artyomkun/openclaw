#!/usr/bin/env node

// Ensures ingress agent command callsites pass explicit owner context.
import path from "node:path";
import { bundledPluginFile } from "./lib/bundled-plugin-paths.ts";
import { runCallsiteGuard } from "./lib/callsite-guard.ts";
import {
  runAsScript,
} from "./lib/ts-guard-utils.ts";

const sourceRoots = ["src/gateway", bundledPluginFile("discord", "src/voice")];
const enforcedFiles = new Set([
  bundledPluginFile("discord", "src/voice/manager.ts"),
  "src/gateway/openai-http.ts",
  "src/gateway/openresponses-http.ts",
  "src/gateway/server-methods/agent.ts",
  "src/gateway/server-node-events.ts",
]);

/**
 * Runs the ingress owner-context guard.
 */
export async function main() {
  await runCallsiteGuard({
    importMetaUrl: import.meta.url,
    sourceRoots,
    skipRelativePath: (relPath) => !enforcedFiles.has(relPath.replaceAll(path.sep, "/")),
    header: "Found ingress callsites using local agentCommand() (must be explicit owner-aware):",
    footer:
      "Use agentCommandFromIngress(...) and pass senderIsOwner explicitly at ingress boundaries.",
  });
}

runAsScript(import.meta.url, main);
