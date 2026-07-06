// Generates postbuild runtime artifacts: plugin metadata, SDK aliases, stable
// runtime aliases, static assets, and compatibility chunks for live upgrades.
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyBundledPluginMetadata } from "./copy-bundled-plugin-metadata.ts";
import { copyPluginSdkRootAlias } from "./copy-plugin-sdk-root-alias.ts";
import {
  copyStaticExtensionAssets,
  copyStaticExtensionAssetsToRuntimeOverlay,
  listStaticExtensionAssetOutputs,
} from "./lib/static-extension-assets.ts";
import { writeTextFileIfChanged } from "./runtime-postbuild-shared.ts";
import { stageBundledPluginRuntime } from "./stage-bundled-plugin-runtime.ts";
import { writeOfficialChannelCatalog } from "./write-official-channel-catalog.ts";

export { copyStaticExtensionAssets, listStaticExtensionAssetOutputs };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_RUNTIME_ALIAS_PATTERN = /^(?<base>.+\.(?:runtime|contract))-[A-Za-z0-9_-]+\.js$/u;
const ROOT_STABLE_RUNTIME_ALIAS_PATTERN = /^.+\.(?:runtime|contract)\.js$/u;
const ROOT_RUNTIME_IMPORT_SPECIFIER_PATTERN =
  /(["'])\.\/([^"']+\.(?:runtime|contract)-[A-Za-z0-9_-]+\.js)\1/gu;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const PLUGIN_SDK_ROOT_ALIAS_OUTPUT = "dist/plugin-sdk/root-alias.ts";
const OFFICIAL_CHANNEL_CATALOG_OUTPUT = "dist/channel-catalog.json";
const ROOT_RUNTIME_STABLE_IMPORT_SKIP_ALIASES = new Set(["text-transforms.runtime.js"]);

/**
 * Lists generated plugin SDK root-alias outputs.
 */
export function listPluginSdkRootAliasOutputs() {
  return [PLUGIN_SDK_ROOT_ALIAS_OUTPUT];
}

/**
 * Lists generated official channel catalog outputs.
 */
export function listOfficialChannelCatalogOutputs() {
  return [OFFICIAL_CHANNEL_CATALOG_OUTPUT];
}

function collectStableRootRuntimeAliasCandidates(params) {
  const distDir = params.distDir;
  const fsImpl = params.fs;
  let entries;
  try {
    entries = fsImpl.readdirSync(distDir, { withFileTypes: true });
  } catch {
    return new Map();
  }

  const candidatesByAlias = new Map();
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile()) {
      continue;
    }
    const match = entry.name.match(ROOT_RUNTIME_ALIAS_PATTERN);
    if (!match?.groups?.base) {
      continue;
    }
    const aliasFileName = `${match.groups.base}.js`;
    const candidates = candidatesByAlias.get(aliasFileName) ?? [];
    candidates.push(entry.name);
    candidatesByAlias.set(aliasFileName, candidates);
  }
  return candidatesByAlias;
}

function resolveStableRootRuntimeAliasCandidate(params) {
  const { aliasFileName, candidates, distDir, fsImpl } = params;
  const candidatesWithSources = candidates.map((candidate) => {
    const filePath = path.join(distDir, candidate);
    let source = "";
    try {
      source = fsImpl.readFileSync(filePath, "utf8");
    } catch {
      // Keep unreadable candidates visible to the ambiguous-candidate logic.
    }
    return { candidate, source };
  });
  const implementationCandidates = candidatesWithSources.filter(
    ({ source }) => source.trim() !== `export * from "./${aliasFileName}";`,
  );
  const candidateNames = implementationCandidates.map(({ candidate }) => candidate);
  if (candidateNames.length === 1) {
    return candidateNames[0];
  }
  if (aliasFileName === PLUGIN_INSTALL_RUNTIME_ALIAS.aliasFileName) {
    return resolveRootRuntimeCandidateByMarkers({
      distDir,
      fsImpl,
      aliasFileName,
      sourceIncludes: PLUGIN_INSTALL_RUNTIME_ALIAS.sourceIncludes,
    });
  }
  const candidateSet = new Set(candidateNames);
  const wrappers = implementationCandidates
    .map(({ candidate, source }) => ({ candidate, source }))
    .filter(({ candidate, source }) => {
      return candidates.some(
        (target) =>
          target !== candidate &&
          candidateSet.has(target) &&
          source.includes(`"./${target}"`) &&
          !source.includes("\n//#region "),
      );
    });
  return wrappers.length === 1 ? wrappers[0].candidate : null;
}

/**
 * Lists stable aliases for hashed root runtime/contract chunks.
 */
export function listStableRootRuntimeAliasOutputs(params = {}) {
  const rootDir = params.rootDir ?? ROOT;
  const distDir = path.join(rootDir, "dist");
  const fsImpl = params.fs ?? fs;
  return [...collectStableRootRuntimeAliasCandidates({ distDir, fs: fsImpl })]
    .filter(([aliasFileName, candidates]) =>
      resolveStableRootRuntimeAliasCandidate({
        distDir,
        fsImpl,
        aliasFileName,
        candidates,
      }),
    )
    .map(([aliasFileName]) => `dist/${aliasFileName}`)
    .toSorted((left, right) => left.localeCompare(right));
}

/**
 * Lists all core runtime postbuild outputs expected after a build.
 */
export function listCoreRuntimePostBuildOutputs(params = {}) {
  return [
    ...listPluginSdkRootAliasOutputs(),
    ...listOfficialChannelCatalogOutputs(),
    ...listStableRootRuntimeAliasOutputs(params)
  ].toSorted((left, right) => left.localeCompare(right));
}

/**
 * Writes stable aliases for current hashed runtime chunks.
 */
export function writeStableRootRuntimeAliases(params = {}) {
  const rootDir = params.rootDir ?? ROOT;
  const distDir = path.join(rootDir, "dist");
  const fsImpl = params.fs ?? fs;
  const candidatesByAlias = collectStableRootRuntimeAliasCandidates({ distDir, fs: fsImpl });

  for (const [aliasFileName, candidates] of candidatesByAlias) {
    const aliasPath = path.join(distDir, aliasFileName);
    const candidate = resolveStableRootRuntimeAliasCandidate({
      distDir,
      fsImpl,
      aliasFileName,
      candidates,
    });
    if (!candidate) {
      fsImpl.rmSync?.(aliasPath, { force: true });
      continue;
    }
    writeTextFileIfChanged(aliasPath, `export * from "./${candidate}";\n`);
  }
}

/**
 * Rewrites hashed runtime imports to stable aliases so live updates survive swaps.
 */
export function rewriteRootRuntimeImportsToStableAliases(params = {}) {
  const rootDir = params.rootDir ?? ROOT;
  const distDir = path.join(rootDir, "dist");
  const fsImpl = params.fs ?? fs;
  let entries;
  try {
    entries = fsImpl.readdirSync(distDir, { withFileTypes: true });
  } catch {
    return;
  }

  const candidatesByAlias = new Map();
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile()) {
      continue;
    }
    const match = entry.name.match(ROOT_RUNTIME_ALIAS_PATTERN);
    if (match?.groups?.base) {
      const aliasFileName = `${match.groups.base}.js`;
      const candidates = candidatesByAlias.get(aliasFileName) ?? [];
      candidates.push(entry.name);
      candidatesByAlias.set(aliasFileName, candidates);
    }
  }
  const runtimeAliasFiles = new Map();
  for (const [aliasFileName, candidates] of candidatesByAlias) {
    const candidate = resolveStableRootRuntimeAliasCandidate({
      distDir,
      fsImpl,
      aliasFileName,
      candidates,
    });
    if (candidate) {
      if (ROOT_RUNTIME_STABLE_IMPORT_SKIP_ALIASES.has(aliasFileName)) {
        continue;
      }
      runtimeAliasFiles.set(candidate, aliasFileName);
    }
  }
  if (runtimeAliasFiles.size === 0) {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) {
      continue;
    }
    if (ROOT_STABLE_RUNTIME_ALIAS_PATTERN.test(entry.name)) {
      continue;
    }
    const filePath = path.join(distDir, entry.name);
    let source;
    try {
      source = fsImpl.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    const rewritten = source.replace(
      ROOT_RUNTIME_IMPORT_SPECIFIER_PATTERN,
      (specifier, quote, fileName) => {
        const aliasFileName = runtimeAliasFiles.get(fileName);
        return aliasFileName ? `${quote}./${aliasFileName}${quote}` : specifier;
      },
    );
    if (rewritten !== source) {
      writeTextFileIfChanged(filePath, rewritten);
    }
  }
}

function resolveRootRuntimeCandidateByMarkers(params) {
  if (!params.sourceIncludes?.length) {
    return null;
  }
  const match = params.aliasFileName.match(ROOT_STABLE_RUNTIME_ALIAS_PATTERN);
  if (!match) {
    return null;
  }
  const aliasBaseFileName = params.aliasFileName.replace(/\.js$/u, "");
  const hashedPattern = new RegExp(`^${escapeRegExp(aliasBaseFileName)}-[A-Za-z0-9_-]+\\.js$`, "u");
  let entries;
  try {
    entries = params.fsImpl.readdirSync(params.distDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = [];
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !hashedPattern.test(entry.name)) {
      continue;
    }
    const candidatePath = path.join(params.distDir, entry.name);
    let source;
    try {
      source = params.fsImpl.readFileSync(candidatePath, "utf8");
    } catch {
      continue;
    }
    if (params.sourceIncludes.every((marker) => source.includes(marker))) {
      candidates.push(entry.name);
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function shouldCopyStaticExtensionAssets(params) {
  const env = params.env ?? process.env;
  return env.OPENCLAW_RUNTIME_POSTBUILD_STATIC_ASSETS !== "0";
}

/**
 * Runs every runtime postbuild phase after the main dist build.
 */
export function runRuntimePostBuild(params = {}) {
  const timingsEnabled = params.timings ?? process.env.OPENCLAW_RUNTIME_POSTBUILD_TIMINGS !== "0";
  const runPhase = (label, action) => {
    const startedAt = performance.now();
    try {
      return action();
    } finally {
      if (timingsEnabled) {
        const durationMs = Math.round(performance.now() - startedAt);
        console.error(`runtime-postbuild: ${label} completed in ${durationMs}ms`);
      }
    }
  };
  runPhase("plugin SDK root alias", () => copyPluginSdkRootAlias(params));
  runPhase("bundled plugin metadata", () => copyBundledPluginMetadata(params));
  runPhase("official channel catalog", () => writeOfficialChannelCatalog(params));
  runPhase("bundled plugin runtime overlay", () => stageBundledPluginRuntime(params));
  runPhase("static extension assets", () => {
    if (!shouldCopyStaticExtensionAssets(params)) {
      return;
    }
    const staticAssetParams = {
      rootDir: ROOT,
      ...params,
    };
    copyStaticExtensionAssets(staticAssetParams);
    copyStaticExtensionAssetsToRuntimeOverlay(staticAssetParams);
  });
  runPhase("stable root runtime imports", () => rewriteRootRuntimeImportsToStableAliases(params));
  runPhase("stable root runtime aliases", () => writeStableRootRuntimeAliases(params));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runRuntimePostBuild();
}
