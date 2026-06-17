/**
 * Public surface of the BYOK provider seam.
 *
 * IMPORTANT: this module must NEVER re-export anything from `./adapters/*`.
 * Adapters pull in a vendor SDK and are loaded only via dynamic `import()` in
 * the factory, so the SDK stays off the common import path (evals imports
 * qa-engine, which re-exports this file).
 */

export * from "./errors.js";
export * from "./types.js";
