/**
 * Public SDK subpath for setup-time command, archive, binary, and docs-link helpers.
 */
export { formatCliCommand } from "../cli/command-format.ts";
export { extractArchive } from "../infra/archive.ts";
export { resolveBrewExecutable } from "../infra/brew.ts";
export { detectBinary } from "../infra/detect-binary.ts";
export { formatDocsLink } from "../../packages/terminal-core/src/links.ts";
export { CONFIG_DIR } from "../utils.ts";
