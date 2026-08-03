import api from "../../httpClient";

// ==========================================
// ADMIN CONTROL PANEL — Service Status, System Health, Devices, Logs
// ==========================================

// Service Status Management
export const getServicesStatus = async () => {
  try {
    const response = await api.get("/api/admin/control/services/status");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get services status error:", error);
    throw error;
  }
};

export const startService = async (service: string) => {
  try {
    const response = await api.post(`/api/admin/control/services/${service}/start`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Start service error:", error);
    throw error;
  }
};

export const stopService = async (service: string) => {
  try {
    const response = await api.post(`/api/admin/control/services/${service}/stop`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Stop service error:", error);
    throw error;
  }
};

// System Health & Issues
export const getSystemIssues = async () => {
  try {
    const response = await api.get("/api/admin/control/system/issues");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get system issues error:", error);
    throw error;
  }
};

export const getSystemHealthScore = async () => {
  try {
    const response = await api.get("/api/admin/control/system/health-score");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get system health score error:", error);
    throw error;
  }
};

export const getSystemStats = async () => {
  try {
    const response = await api.get("/api/admin/control/system/stats");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get system stats error:", error);
    throw error;
  }
};

// Device & Login Management
export const getLoginDevices = async () => {
  try {
    const response = await api.get("/api/admin/control/devices");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get login devices error:", error);
    throw error;
  }
};

// Log Management
export const getServiceLogs = async (service: string, lines: number = 100, level?: string) => {
  try {
    const params = new URLSearchParams({
      lines: lines.toString(),
    });
    if (level) params.append("level", level);

    const response = await api.get(`/api/admin/control/logs/${service}?${params.toString()}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get service logs error:", error);
    throw error;
  }
};

export const clearServiceLogs = async (service: string) => {
  try {
    const response = await api.post("/api/admin/control/logs/clear", null, {
      params: { service },
    });
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error(`Clear ${service} logs error:`, error);
    throw error;
  }
};
