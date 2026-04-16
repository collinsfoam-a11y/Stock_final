import type { VersionCheckResult } from "./versionService";

export const getConfiguredAppUpdateUrl = (): string | null => {
  const url = process.env.EXPO_PUBLIC_APP_UPDATE_URL?.trim();
  return url ? url : null;
};

export const resolveAppUpdateUrl = (
  versionInfo?: Pick<VersionCheckResult, "release_notes_url"> | null,
): string | null => {
  const backendUrl = versionInfo?.release_notes_url?.trim();
  if (backendUrl) {
    return backendUrl;
  }

  return getConfiguredAppUpdateUrl();
};

export default {
  getConfiguredAppUpdateUrl,
  resolveAppUpdateUrl,
};
