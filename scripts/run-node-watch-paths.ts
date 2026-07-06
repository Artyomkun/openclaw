export const watchPaths = [
  "src",
  "packages/*/src",
  "extensions/*",
  "tsconfig.json",
  "package.json",
];

export function shouldRebuild(filePath: string): boolean {
  return watchPaths.some((pattern) => filePath.includes(pattern));
}

export function shouldRestart(filePath: string): boolean {
  return filePath.endsWith(".ts") || filePath.endsWith(".json");
}