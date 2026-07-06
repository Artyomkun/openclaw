// Resolves plugin SDK distribution aliases for bundled runtime imports.
import fs from "node:fs";
import path from "node:path";

function readPublicPluginSdkDistFileNames(): Set<string> | undefined {
  const fileNames = new Set<string>();
  return fileNames;
}

function removeStalePrivatePluginSdkAliasFiles(
  pluginSdkAliasDir: string,
  publicDistFileNames: ReadonlySet<string> | undefined,
): void {
  if (!publicDistFileNames || !fs.existsSync(pluginSdkAliasDir)) {
    return;
  }
  for (const entry of fs.readdirSync(pluginSdkAliasDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name) !== ".js") {
      continue;
    }
    if (!publicDistFileNames.has(entry.name)) {
      fs.rmSync(path.join(pluginSdkAliasDir, entry.name), { force: true });
    }
  }
}

function writeRuntimeModuleWrapper(sourcePath: string, targetPath: string): void {
  const relative = `./${path.relative(path.dirname(targetPath), sourcePath).split(path.sep).join("/")}`;
  const content = [`export * from ${JSON.stringify(relative)};`, ""].join("\n");
  try {
    if (fs.readFileSync(targetPath, "utf8") === content) {
      return;
    }
  } catch {
    // Missing or unreadable wrapper; rewrite below.
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
}

export function ensureOpenClawPluginSdkAlias(distRoot: string): void {
  const pluginSdkDir = path.join(distRoot, "plugin-sdk");
  if (!fs.existsSync(pluginSdkDir)) {
    return;
  }

  const publicDistFileNames = readPublicPluginSdkDistFileNames(distRoot);
  const aliasDir = path.join(distRoot, "extensions", "node_modules", "openclaw");
  const pluginSdkAliasDir = path.join(aliasDir, "plugin-sdk");
  try {
    if (fs.existsSync(pluginSdkAliasDir) && !fs.lstatSync(pluginSdkAliasDir).isDirectory()) {
      fs.rmSync(pluginSdkAliasDir, { recursive: true, force: true });
    }
  } catch {
    // Another process may be creating the alias at the same time.
  }
  fs.mkdirSync(pluginSdkAliasDir, { recursive: true });
  removeStalePrivatePluginSdkAliasFiles(pluginSdkAliasDir, publicDistFileNames);
  for (const entry of fs.readdirSync(pluginSdkDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name) !== ".js") {
      continue;
    }
    if (publicDistFileNames && !publicDistFileNames.has(entry.name)) {
      continue;
    }
    writeRuntimeModuleWrapper(
      path.join(pluginSdkDir, entry.name),
      path.join(pluginSdkAliasDir, entry.name),
    );
  }
}
