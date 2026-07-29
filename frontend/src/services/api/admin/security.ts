import api from "../../httpClient";

// ==========================================
// SECURITY DASHBOARD API
// ==========================================

export const getSecuritySummary = async () => {
  try {
    const response = await api.get("/api/admin/security/summary");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get security summary error:", error);
    throw error;
  }
};

export const getFailedLogins = async (
  limit: number = 100,
  hours: number = 24,
  username?: string,
  ipAddress?: string
) => {
  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      hours: hours.toString(),
    });
    if (username) params.append("username", username);
    if (ipAddress) params.append("ip_address", ipAddress);
    const response = await api.get(`/api/admin/security/failed-logins?${params.toString()}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get failed logins error:", error);
    throw error;
  }
};

export const getSuspiciousActivity = async (hours: number = 24) => {
  try {
    const response = await api.get(`/api/admin/security/suspicious-activity?hours=${hours}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get suspicious activity error:", error);
    throw error;
  }
};

export const getSecuritySessions = async (limit: number = 100, activeOnly: boolean = false) => {
  try {
    const response = await api.get(
      `/api/admin/security/sessions?limit=${limit}&active_only=${activeOnly}`
    );
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get security sessions error:", error);
    throw error;
  }
};

export const getSecurityAuditLog = async (
  limit: number = 100,
  hours: number = 24,
  action?: string,
  user?: string
) => {
  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      hours: hours.toString(),
    });
    if (action) params.append("action", action);
    if (user) params.append("user", user);
    const response = await api.get(`/api/admin/security/audit-log?${params.toString()}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get security audit log error:", error);
    throw error;
  }
};

export const getIpTracking = async (hours: number = 24) => {
  try {
    const response = await api.get(`/api/admin/security/ip-tracking?hours=${hours}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get IP tracking error:", error);
    throw error;
  }
};
