/**
 * Compatibility wrapper for the API surface.
 *
 * Implementation moved to `api.impl.ts` to keep this file small while
 * preserving all existing imports from `@/services/api/api`.
 */

export * from "./api.impl";
export { default } from "./api.impl";
