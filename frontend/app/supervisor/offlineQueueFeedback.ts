import type { SyncResult } from "../../src/services/syncService";

export type ForceSyncAlert = {
  title: string;
  message: string;
  loadAfterAlert: boolean;
};

export const summarizeForceSyncResult = (
  result: SyncResult,
): ForceSyncAlert => {
  if (result.failed > 0 && result.success > 0) {
    return {
      title: "Partial Sync",
      message: `${result.success} of ${result.total} queued actions synced. ${result.failed} action still needs attention.`,
      loadAfterAlert: true,
    };
  }

  if (result.failed > 0) {
    return {
      title: "Sync Incomplete",
      message:
        result.errors[0]?.error ||
        "Offline queue could not be synced completely. Please review the remaining actions.",
      loadAfterAlert: true,
    };
  }

  return {
    title: "Success",
    message: "Offline queue synced successfully",
    loadAfterAlert: true,
  };
};
