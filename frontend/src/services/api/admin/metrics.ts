import api from "../../httpClient";

// ==========================================
// METRICS & HEALTH API
// ==========================================

export const getMetrics = async () => {
  try {
    const response = await api.get("/api/metrics");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get metrics error:", error);
    throw error;
  }
};

export const getMetricsHealth = async () => {
  try {
    const response = await api.get("/api/metrics/health");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get metrics health error:", error);
    throw error;
  }
};

// Health check alias for backward compatibility
export const checkHealth = async () => {
  try {
    const response = await api.get("/health");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Health check error:", error);
    throw error;
  }
};

export const getMetricsStats = async () => {
  try {
    const response = await api.get("/api/metrics/stats");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get metrics stats error:", error);
    throw error;
  }
};
