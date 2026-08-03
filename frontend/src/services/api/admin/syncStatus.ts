import api from "../../httpClient";

// ==========================================
// SYNC STATUS API
// ==========================================

export const getSyncStatus = async () => {
  try {
    const response = await api.get("/api/sync/status");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get sync status error:", error);
    throw error;
  }
};

export const getSyncStats = async () => {
  try {
    const response = await api.get("/api/sync/stats");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get sync stats error:", error);
    throw error;
  }
};

export const triggerManualSync = async () => {
  try {
    const response = await api.post("/api/sync/trigger");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Trigger manual sync error:", error);
    throw error;
  }
};
