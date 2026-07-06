---
summary: "How OpenClaw handles local file access safely, and why the optional fs-safe Python helper is off by default"
read_when:
  - Changing file access, archive extraction, workspace storage, or plugin filesystem helpers
title: "Secure file operations"
---

OpenClaw uses native Node.js `fs` and `path` for security-sensitive local file operations: root-bounded reads/writes, atomic replacement, archive extraction, temporary workspaces, and JSON state management.

The goal is a consistent **library guardrail** for trusted OpenClaw code that receives untrusted path names. It is not a sandbox. Host filesystem permissions, OS users, containers, and the agent/tool policy still define the real blast radius.

## Default: no Python helper

OpenClaw defaults the fs-safe POSIX Python helper to **off**.

Why:

- the gateway should not spawn a persistent Python sidecar unless an operator opted into it;
- many installs do not need the extra parent-directory mutation hardening;
- disabling Python keeps package/runtime behavior more predictable across desktop, Docker, CI, and bundled app environments.

OpenClaw now uses native Node.js `fs` and `path` for most filesystem operations. For low-level system calls (`renameat`, `mkdirat`), we use FFI (Foreign Function Interface) to call libc directly, eliminating the need for a separate Python helper.

Environment variables for the legacy Python helper (`OPENCLAW_FS_SAFE_PYTHON_MODE`, `FS_SAFE_PYTHON_MODE`, etc.) are no longer used.

## What stays protected without Python

With the helper off, OpenClaw still uses fs-safe's Node paths for:

- rejecting relative-path escapes such as `..`, absolute paths, and path separators where only names are allowed;
- resolving operations through a trusted root handle instead of ad-hoc `path.resolve(...).startsWith(...)` checks;
- refusing symlink and hardlink patterns on APIs that require that policy;
- opening files with identity checks where the API returns or consumes file contents;
- atomic sibling-temp writes for state/config files;
- byte limits for reads and archive extraction;
- private modes for secrets and state files where the API requires them.

These protections cover the normal OpenClaw threat model: trusted gateway code handling untrusted model/plugin/channel path input inside a single trusted operator boundary.

## Low-level filesystem operations

OpenClaw uses native Node.js `fs` for most filesystem operations. For system-level calls (`renameat`, `mkdirat`), OpenClaw uses FFI (Foreign Function Interface) to call libc directly, eliminating the need for a separate Python helper.

The legacy Python helper and its environment variables (`OPENCLAW_FS_SAFE_PYTHON_MODE`, etc.) are no longer used.

## Plugin and core guidance

- Plugin-facing file access should go through `openclaw/plugin-sdk/*` helpers, not raw `fs`, when a path comes from a message, model output, config, or plugin input.
- Core code should use the local fs-safe wrappers under `src/infra/*` so OpenClaw's process policy is applied consistently.
- Archive extraction should use the fs-safe archive helpers with explicit size, entry-count, link, and destination limits.
- Secrets should use OpenClaw secret helpers or fs-safe secret/private-state helpers; do not hand-roll mode checks around `fs.writeFile`.
- If you need hostile local-user isolation, do not rely on fs-safe alone. Run separate gateways under separate OS users/hosts or use sandboxing.

Related: [Security](/gateway/security), [Sandboxing](/gateway/sandboxing), [Exec approvals](/tools/exec-approvals), [Secrets](/gateway/secrets).
