/**
 * Version Check Service
 * Provides app version checking and upgrade notification functionality
 */
import api from "./httpClient";
import { createLogger } from "./logging";

const FALLBACK_CURRENT_VERSION = "2.1.0";
const FALLBACK_MINIMUM_VERSION = "1.0.0";
const log = createLogger("versionService");

export interface VersionCheckResult {
  is_compatible: boolean;
  is_latest: boolean;
  update_available: boolean;
  update_type: "major" | "minor" | "patch" | null;
  client_version: string;
  minimum_version: string;
  current_version: string;
  force_update: boolean;
  timestamp: string;
  app_name?: string;
  release_notes_url?: string | null;
  changelog?: string | null;
  error?: string;
}

/**
 * Check if the current app version is compatible with the backend
 * and if updates are available
 */
export const checkVersion = async (
  clientVersion: string,
): Promise<VersionCheckResult> => {
  try {
    const response = await api.get<VersionCheckResult>("/api/version/check", {
      params: { client_version: clientVersion },
    });
    return response.data;
  } catch (error: any) {
    if (__DEV__) {
      log.warn("Version check error", { error: String(error) });
    }

    // Return a safe default that doesn't force updates on error
    return {
      is_compatible: true,
      is_latest: true,
      update_available: false,
      update_type: null,
      client_version: clientVersion,
      minimum_version: FALLBACK_MINIMUM_VERSION,
      current_version: FALLBACK_CURRENT_VERSION,
      force_update: false,
      timestamp: new Date().toISOString(),
      error: error.message || "Version check failed",
    };
  }
};

/**
 * Get the current backend version info
 */
export const getBackendVersion = async (): Promise<{
  version: string;
  name: string;
  environment: string;
  build_time: string;
}> => {
  try {
    const response = await api.get("/api/version");
    return response.data;
  } catch (error: any) {
    if (__DEV__) {
      log.warn("Get backend version error", { error: String(error) });
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
};

export const versionApi = {
  checkVersion,
  getBackendVersion,
};

export default versionApi;
