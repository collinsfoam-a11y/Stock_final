import Constants from "expo-constants";

/**
 * Canonical application version source — single source of truth.
 *
 * Every consumer of the running app version (settings UI, version-check
 * service, Sentry release tagging, offline-command provenance) MUST read
 * from {@link getAppVersion}. Do not re-derive the version from
 * `Constants.expoConfig` independently — independent derivations drift
 * (e.g. the settings screen showed "1.0.0" while Sentry tagged "0.0.0"
 * because each used a different fallback).
 *
 * Resolution order:
 *   1. `Constants.expoConfig.version` — the version declared in app config.
 *   2. `Constants.nativeAppVersion` — the native build version (installed app).
 *   3. {@link FALLBACK_APP_VERSION} — last-resort constant for bare/dev runs.
 */
const FALLBACK_APP_VERSION = "2.1.0";

/** Last-resort version when neither the manifest nor native build is available. */
export const FALLBACK_VERSION = FALLBACK_APP_VERSION;

/**
 * Returns the running application version string.
 *
 * Pure and synchronous — safe to call outside React render (e.g. in service
 * modules, Sentry init, offline command construction).
 */
export const getAppVersion = (): string =>
  Constants.expoConfig?.version || Constants.nativeAppVersion || FALLBACK_APP_VERSION;
