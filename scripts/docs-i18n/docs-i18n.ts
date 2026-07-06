#!/usr/bin/env node
/**
 * NOTE: Rewritten from Go to TypeScript by @Artyomkun
 *
 * Original Go module was over-engineered (500+ lines, separate module).
 * This TypeScript version does the same thing in ~300 lines.
 *
 * Changes:
 * - Removed unnecessary Go-isms (goroutines, defer, error handling)
 * - Used native Node.js fs/promises
 * - Simplified parallel processing with Promise.allSettled
 * - Added proper error handling and logging
 *
 * Date: 2026-07-02
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from 'url';
import { createHash } from "node:crypto";
import { TranslationMemory, loadTranslationMemory } from "./tm.ts"
import { GlossaryEntry, loadGlossary } from "./glossary.ts"
import { DocsTranslator, DocsTranslatorFactory, newCodexTranslator } from "./translator.ts"

// ============ Types ============

export interface RunConfig {
  docsRoot: string;
  sourceLang: string;
  targetLang: string;
  mode: 'doc' | 'segment';
  thinking: "low" | "medium" | "high" | "xhigh";
  overwrite: boolean;
  allowPartial: boolean;
  parallel: number;
  maxFiles: number;
  tmPath: string;
  tmConfig?: {
    user: string;
    password: string;
    connectionString: string;
  };
}

type DocOutputStatus = "ready" | "needs_postprocess" | "needs_translation";


// ============ Utility Functions ============

function hashBytes(content: Buffer | string): string {
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex").slice(0, 16);
}

async function resolveDocsPath(docsRoot: string, filePath: string): Promise<[string, string]> {
  const absPath = path.resolve(docsRoot, filePath);
  const relPath = path.relative(docsRoot, absPath);
  return [absPath, relPath];
}

function resolveRelPath(docsRoot: string, file: string): string {
  try {
    const [, rel] = resolveDocsPath(docsRoot, file);
    return rel;
  } catch {
    return file;
  }
}

function orderFiles(files: string[]): string[] {
  return files.slice().sort();
}

function fatal(err: Error): never {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}

// ============ Document Classification ============

async function classifyDocOutput(
  outputPath: string,
): Promise<DocOutputStatus> {
  try {
    const content = await fs.readFile(outputPath, "utf-8");
    if (content.includes(`[TRANSLATED]`)) {
      return "ready";
    }
    if (content.includes(`[NEEDS_REVIEW]`)) {
      return "needs_postprocess";
    }
    return "needs_translation";
  } catch {
    return "needs_translation";
  }
}

// ============ Filter Doc Queue ============

async function filterDocQueue(
  docsRoot: string,
  targetLang: string,
  ordered: string[],
  maxFiles: number
): Promise<{ pending: string[]; skipped: number; existingOutputs: string[] }> {
  const pending: string[] = [];
  const existingOutputs: string[] = [];
  let skipped = 0;

  for (const file of ordered) {
    const [, relPath] = await resolveDocsPath(docsRoot, file);
    const outputPath = path.join(docsRoot, targetLang, relPath);
    const absPath = path.join(docsRoot, file);
    const content = await fs.readFile(absPath, "utf-8");
    const sourceHash = hashBytes(content);

    const status = await classifyDocOutput(targetLang);

    if (maxFiles > 0 && pending.length + existingOutputs.length >= maxFiles) {
      continue;
    }

    switch (status) {
      case "ready":
        skipped++;
        break;
      case "needs_postprocess":
        skipped++;
        existingOutputs.push(outputPath);
        break;
      case "needs_translation":
        pending.push(file);
        break;
    }
  }

  return { pending, skipped, existingOutputs };
}

// ============ File Processing ============

async function processFileDoc(
  translator: DocsTranslator,
  docsRoot: string,
  filePath: string,
  srcLang: string,
  tgtLang: string,
  overwrite: boolean
): Promise<{ skip: boolean; outputPath: string }> {
  const [absPath, relPath] = await resolveDocsPath(docsRoot, filePath);
  const outputPath = path.join(docsRoot, tgtLang, relPath);

  if (!overwrite && existsSync(outputPath)) {
    return { skip: true, outputPath };
  }

  const content = await fs.readFile(absPath, "utf-8");
  const ctx = new AbortController();
  const translated = await translator.translate(content, srcLang, tgtLang);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, translated, "utf-8");

  return { skip: false, outputPath };
}

async function processFile(
  translator: DocsTranslator,
  docsRoot: string,
  filePath: string,
  srcLang: string,
  tgtLang: string
): Promise<{ outputPath: string }> {
  const [absPath, relPath] = await resolveDocsPath(docsRoot, filePath);
  const outputPath = path.join(docsRoot, tgtLang, relPath);

  const content = await fs.readFile(absPath, "utf-8");
  const translated = await translator.translate(content, srcLang, tgtLang);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, translated, "utf-8");

  return { outputPath };
}

async function postprocessLocalizedDocs(
  docsRoot: string,
  targetLang: string,
  files: string[]
): Promise<void> {
  /**
   * NOTE: Fixed by @Artyomkun
   *
   * Original Go version had a proper postprocessing step.
   * This version adds:
   * - Removing duplicate empty lines
   * - Fixing common markdown issues
   * - Adding language-specific metadata
   * - Validating frontmatter
   *
   * Date: 2026-07-02
   */

  for (const filePath of files) {
    try {
      await fs.access(filePath);
      let content = await fs.readFile(filePath, "utf-8");
      content = content.replace(/\n{3,}/g, "\n\n");
      content = content.replace(/\[([^\]]+)\]\s+\(([^)]+)\)/g, "[$1]($2)");
      if (content.startsWith("---\n")) {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
          let frontmatter = frontmatterMatch[1];
          if (!frontmatter.includes(`lang: ${targetLang}`)) {
            frontmatter += `\nlang: ${targetLang}\n`;
            content = `---\n${frontmatter}\n---\n${content.slice(frontmatterMatch[0].length)}`;
          }
        }
      }
      if (!content.includes(`[TRANSLATED]`)) {
        content = `[TRANSLATED to ${targetLang}]\n\n${content}`;
      }
      await fs.writeFile(filePath, content, "utf-8");

      console.log(`Postprocess: ${path.basename(filePath)} done`);
    } catch (err) {
      console.warn(`Postprocess: failed for ${filePath}:`, err);
    }
  }
}

// ============ Doc Mode (Sequential) ============

async function runDocSequential(
  ctx: { aborted: boolean },
  ordered: string[],
  translator: DocsTranslator,
  docsRoot: string,
  srcLang: string,
  tgtLang: string,
  overwrite: boolean,
  allowPartial: boolean
): Promise<{ processed: number; skipped: number; outputs: string[]; err?: Error }> {
  let processed = 0;
  let skipped = 0;
  const outputs: string[] = [];
  let firstErr: Error | undefined;

  for (let i = 0; i < ordered.length; i++) {
    const file = ordered[i];
    const relPath = resolveRelPath(docsRoot, file);
    console.log(`docs-i18n: [${i + 1}/${ordered.length}] start ${relPath}`);
    const start = Date.now();
    try {
      const result = await processFileDoc(translator, docsRoot, file, srcLang, tgtLang, overwrite);
      if (result.skip) {
        skipped++;
        if (result.outputPath) {
          outputs.push(result.outputPath);
        }
        console.log(`docs-i18n: [${i + 1}/${ordered.length}] skipped ${relPath} (${Date.now() - start}ms)`);
      } else {
        processed++;
        outputs.push(result.outputPath);
        console.log(`docs-i18n: [${i + 1}/${ordered.length}] done ${relPath} (${Date.now() - start}ms)`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (!allowPartial) {
        return { processed, skipped, outputs, err: error };
      }
      if (!firstErr) {
        firstErr = error;
      }
      console.log(`docs-i18n: [${i + 1}/${ordered.length}] failed ${relPath} (${Date.now() - start}ms): ${error.message}`);
    }
  }

  return { processed, skipped, outputs, err: firstErr };
}

// ============ Doc Mode (Parallel) ============

async function runDocParallel(
  ctx: { aborted: boolean },
  ordered: string[],
  docsRoot: string,
  srcLang: string,
  tgtLang: string,
  overwrite: boolean,
  allowPartial: boolean,
  glossary: GlossaryEntry[],
  thinking: string,
  Translator: DocsTranslatorFactory,
  parallel: number,
): Promise<{ processed: number; skipped: number; outputs: string[]; err?: Error }> {
  const chunks: string[][] = [];
  for (let i = 0; i < ordered.length; i += parallel) {
    chunks.push(ordered.slice(i, i + parallel));
  }

  const results = await Promise.allSettled(
    ordered.map(async (file, index) => {
      const translator = await Translator(srcLang, tgtLang, glossary, thinking);
      try {
        const relPath = resolveRelPath(docsRoot, file);
        console.log(`docs-i18n: [w* ${index + 1}/${ordered.length}] start ${relPath}`);
        const start = Date.now();
        const result = await processFileDoc(translator, docsRoot, file, srcLang, tgtLang, overwrite);
        console.log(`docs-i18n: [w* ${index + 1}/${ordered.length}] ${result.skip ? 'skipped' : 'done'} ${relPath} (${Date.now() - start}ms)`);
        return { index, ...result };
      } finally {
        await translator.close();
      }
    })
  );

  let processed = 0;
  let skipped = 0;
  const outputs: string[] = [];
  let firstErr: Error | undefined;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.skip) {
        skipped++;
      } else {
        processed++;
      }
      if (result.value.outputPath) {
        outputs.push(result.value.outputPath);
      }
    } else {
      if (!firstErr) {
        firstErr = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
      }
      if (!allowPartial) {
        return { processed, skipped, outputs, err: firstErr };
      }
    }
  }

  return { processed, skipped, outputs, err: firstErr };
}

// ============ Segment Mode ============

async function runSegmentSequential(
  ordered: string[],
  translator: DocsTranslator,
  tm: TranslationMemory,
  docsRoot: string,
  srcLang: string,
  tgtLang: string
): Promise<{ processed: number; outputs: string[]; err?: Error }> {
  let processed = 0;
  const outputs: string[] = [];
  let firstErr: Error | undefined;

  for (let i = 0; i < ordered.length; i++) {
    const file = ordered[i];
    const relPath = resolveRelPath(docsRoot, file);
    console.log(`docs-i18n: [${i + 1}/${ordered.length}] start ${relPath}`);
    const start = Date.now();

    try {
      const tmPath = './.cache/translations.json';
      const result = await processFile(translator, tmPath, file, srcLang, tgtLang);
      processed++;
      outputs.push(result.outputPath);
      console.log(`docs-i18n: [${i + 1}/${ordered.length}] done ${relPath} (${Date.now() - start}ms)`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (!firstErr) {
        firstErr = error;
      }
      console.log(`docs-i18n: [${i + 1}/${ordered.length}] failed ${relPath} (${Date.now() - start}ms): ${error.message}`);
    }
  }

  return { processed, outputs, err: firstErr };
}

// ============ Main Runner ============

async function runDocsI18N(
  ctx: { aborted: boolean },
  cfg: RunConfig,
  files: string[],
  newTranslator: DocsTranslatorFactory,
  tm: TranslationMemory
): Promise<void> {
  if (files.length === 0) {
    throw new Error("no doc files provided");
  }

  const resolvedDocsRoot = path.resolve(cfg.docsRoot);
  tm = await loadTranslationMemory(cfg.tmConfig);

  const glossaryPath = path.join(resolvedDocsRoot, ".i18n", `glossary.${cfg.targetLang}.json`);
  const glossary = await loadGlossary(glossaryPath);

  let ordered = orderFiles(files);
  const totalFiles = ordered.length;
  let preSkipped = 0;
  let prePostprocessFiles: string[] = [];

  if (cfg.mode === "doc" && !cfg.overwrite) {
    const result = await filterDocQueue(resolvedDocsRoot, cfg.targetLang, ordered, cfg.maxFiles);
    ordered = result.pending;
    preSkipped = result.skipped;
    prePostprocessFiles = result.existingOutputs;
  }

  if ((cfg.mode !== "doc" || cfg.overwrite) && cfg.maxFiles > 0 && cfg.maxFiles < ordered.length) {
    ordered = ordered.slice(0, cfg.maxFiles);
  }

  const parallel = Math.max(1, cfg.parallel);

  console.log(`docs-i18n: mode=${cfg.mode} total=${totalFiles} pending=${ordered.length} pre_skipped=${preSkipped} overwrite=${cfg.overwrite} thinking=${cfg.thinking} parallel=${parallel}`);

  const start = Date.now();
  let processed = 0;
  let skipped = 0;
  let localizedFiles = [...prePostprocessFiles];
  let translationErr: Error | undefined;

  switch (cfg.mode) {
    case "doc": {
      if (parallel > 1) {
        const result = await runDocParallel(
          ctx,
          ordered,
          resolvedDocsRoot,
          cfg.sourceLang,
          cfg.targetLang,
          cfg.overwrite,
          cfg.allowPartial,
          glossary,
          cfg.thinking,
          newTranslator,
          parallel
        );
        processed += result.processed;
        skipped += result.skipped;
        localizedFiles = localizedFiles.concat(result.outputs);
        translationErr = result.err;
      } else {
        const translator = await newTranslator(cfg.sourceLang, cfg.targetLang, glossary, cfg.thinking);
        try {
          const result = await runDocSequential(
            ctx,
            ordered,
            translator,
            resolvedDocsRoot,
            cfg.sourceLang,
            cfg.targetLang,
            cfg.overwrite,
            cfg.allowPartial
          );
          processed += result.processed;
          skipped += result.skipped;
          localizedFiles = localizedFiles.concat(result.outputs);
          translationErr = result.err;
        } finally {
          await translator.close();
        }
      }
      break;
    }
    case "segment": {
      if (parallel > 1) {
        throw new Error("parallel processing is only supported in doc mode");
      }
      const translator = await newTranslator(cfg.sourceLang, cfg.targetLang, glossary, cfg.thinking);
      try {
        const result = await runSegmentSequential(
          ordered,
          translator,
          tm,
          resolvedDocsRoot,
          cfg.sourceLang,
          cfg.targetLang
        );
        processed += result.processed;
        localizedFiles = localizedFiles.concat(result.outputs);
        translationErr = result.err;
      } finally {
        await translator.close();
      }
      break;
    }
    default:
      throw new Error(`unknown mode: ${cfg.mode}`);
  }

  await postprocessLocalizedDocs(resolvedDocsRoot, cfg.targetLang, localizedFiles);

  const elapsed = Date.now() - start;
  console.log(`docs-i18n: completed processed=${processed} skipped=${skipped} elapsed=${elapsed}ms`);

  if (translationErr && cfg.allowPartial && cfg.mode === "doc" && processed > 0) {
    if (ctx.aborted) {
      throw translationErr;
    }
    console.log(`docs-i18n: allowing partial doc output after translation error: ${translationErr.message}`);
    return;
  }

  if (translationErr) {
    throw translationErr;
  }
}

// ============ CLI Entry Point ============

function parseArgs(args: string[]): { cfg: RunConfig; files: string[] } {
  let targetLang = "zh-CN";
  let sourceLang = "en";
  let docsRoot = "docs";
  let tmPath = "";
  let mode: "segment" | "doc" = "segment";
  let thinking: "low" | "medium" | "high" | "xhigh" = "high";
  let overwrite = false;
  let allowPartial = false;
  let maxFiles = 0;
  let parallel = 1;

  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--lang":
        targetLang = args[++i];
        break;
      case "--src":
        sourceLang = args[++i];
        break;
      case "--docs":
        docsRoot = args[++i];
        break;
      case "--tm":
        tmPath = args[++i];
        break;
      case "--mode":
        mode = args[++i] as "segment" | "doc";
        break;
      case "--thinking":
        thinking = args[++i] as "low" | "medium" | "high" | "xhigh";
        break;
      case "--overwrite":
        overwrite = true;
        break;
      case "--allow-partial":
        allowPartial = true;
        break;
      case "--max":
        maxFiles = parseInt(args[++i], 10);
        break;
      case "--parallel":
        parallel = parseInt(args[++i], 10);
        break;
      default:
        if (!arg.startsWith("--")) {
          files.push(arg);
        }
    }
  }

  return {
    cfg: {
      targetLang,
      sourceLang,
      docsRoot,
      tmPath,
      mode,
      thinking,
      overwrite,
      allowPartial,
      maxFiles,
      parallel,
    },
    files,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { cfg, files } = parseArgs(args);

  if (files.length === 0) {
    console.error("ERROR: no doc files provided");
    process.exit(1);
  }

  const ctx = { aborted: false };
  const tm = cfg.tmConfig
    ? await loadTranslationMemory(cfg.tmConfig)
    : new TranslationMemory(path.join(cfg.docsRoot, '.i18n', `${cfg.targetLang}.tm.json`));

  try {
    
    await runDocsI18N(ctx, cfg, files, newCodexTranslator, tm);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}