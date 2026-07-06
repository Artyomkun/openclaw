// Exposes archive extraction helpers after applying fs-safe defaults.
import "./fs-safe.js";

// Archive extraction facade for size limits, staged writes, and traversal checks.
export * from './archive-path.ts';
