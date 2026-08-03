import api from "../../httpClient";

// ==========================================
// SYNC CONFLICTS API
// ==========================================

export const getSyncConflicts = async (
  status?: string,
  sessionId?: string,
  page: number = 1,
  pageSize: number = 50
) => {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    if (status) params.append("status", status);
    if (sessionId) params.append("session_id", sessionId);

    const response = await api.get(`/api/sync/conflicts?${params.toString()}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get sync conflicts error:", error);
    throw error;
  }
};

export const getSyncConflictDetail = async (conflictId: string) => {
  try {
    const response = await api.get(`/api/sync/conflicts/${conflictId}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get sync conflict detail error:", error);
    throw error;
  }
};

export const resolveSyncConflict = async (
  conflictId: string,
  resolution: string,
  resolutionNote?: string
) => {
  try {
    const response = await api.post(`/api/sync/conflicts/${conflictId}/resolve`, {
      resolution,
      resolution_note: resolutionNote,
    });
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Resolve sync conflict error:", error);
    throw error;
  }
};

export const batchResolveSyncConflicts = async (
  conflictIds: string[],
  resolution: string,
  resolutionNote?: string
) => {
  try {
    const response = await api.post("/api/sync/conflicts/batch-resolve", {
      conflict_ids: conflictIds,
      resolution,
      resolution_note: resolutionNote,
    });
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Batch resolve sync conflicts error:", error);
    throw error;
  }
};

export const getSyncConflictStats = async () => {
  try {
    const response = await api.get("/api/sync/conflicts/stats/summary");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get sync conflict stats error:", error);
    throw error;
  }
};
