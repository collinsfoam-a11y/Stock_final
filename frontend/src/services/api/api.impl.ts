/**
 * API service layer: network-aware endpoints with offline fallbacks and caching.
 * Most functions prefer online calls and transparently fall back to cache.
 */
import api from "../httpClient";
import type { DataSource } from "../offline/offlineStorage";
import { createLogger } from "../logging";
import type { TokenResponse } from "./models";
import * as adminOperationsApi from "./adminOperationsApi";
import * as inventoryWorkflowApi from "./inventoryWorkflowApi";
import {
  bulkCloseSessions,
  bulkExportSessions,
  bulkReconcileSessions,
  createSession,
  getRackProgress,
  getSession,
  getSessions,
  getSessionsAnalytics,
  getSessionStats,
  isOnline,
} from "./sessionManagementApi";

const {
  batchResolveSyncConflicts,
  clearServiceLogs,
  configureSQLConnection,
  createExportSchedule,
  deleteExportSchedule,
  downloadExportResult,
  generateReport,
  getAvailableReports,
  getExportResults,
  getExportSchedule,
  getExportSchedules,
  getFailedLogins,
  getIpTracking,
  getLoginDevices,
  getMetrics,
  getMetricsHealth,
  getMetricsStats,
  getSecurityAuditLog,
  getSecuritySessions,
  getSecuritySummary,
  getServiceLogs,
  getServicesStatus,
  getSettingsCategories,
  getSQLConnectionHistory,
  getSQLStatus,
  getSqlServerConfig,
  getSuspiciousActivity,
  getSyncConflictDetail,
  getSyncConflictStats,
  getSyncConflicts,
  getSyncStats,
  getSyncStatus,
  getSystemHealthScore,
  getSystemIssues,
  getSystemParameters,
  getSystemSettings,
  getSystemStats,
  resetSettingsToDefaults,
  resolveSyncConflict,
  startService,
  stopService,
  testSQLConnection,
  testSqlServerConnection,
  triggerExportSchedule,
  triggerManualSync,
  updateExportSchedule,
  updateSqlServerConfig,
  updateSystemParameters,
  updateSystemSettings,
} = adminOperationsApi;

const log = createLogger("ApiService");

/**
 * Response with source metadata for transparency about data freshness
 */
export interface ApiResponseWithSource<T> {
  data: T;
  _source: DataSource;
  _cachedAt?: string | null;
  _stale?: boolean;
  _degraded?: boolean;
}

export {
  isOnline,
  createSession,
  getSessions,
  getSession,
  getSessionStats,
  getRackProgress,
  bulkCloseSessions,
  bulkReconcileSessions,
  bulkExportSessions,
  getSessionsAnalytics,
};
export type {
  CreateSessionParams,
  SessionStatsResponse,
} from "./sessionManagementApi";
export * from "./adminOperationsApi";
export * from "./inventoryWorkflowApi";

// --- Unknown Items Management (Admin) ---

/**
 * List reported unknown items
 */
export const getUnknownItems = async (params: {
  session_id?: string;
  reported_by?: string;
  limit?: number;
  skip?: number;
}) => {
  try {
    const response = await api.get("/api/admin/unknown-items", { params });
    return response.data;
  } catch (error: any) {
    log.error("Error fetching unknown items", error);
    throw error;
  }
};

/**
 * Map an unknown item to an existing SKU
 */
export const mapUnknownToSku = async (itemId: string, itemCode: string, notes?: string) => {
  try {
    const response = await api.post(`/api/admin/unknown-items/${itemId}/map`, {
      item_code: itemCode,
      resolve_notes: notes,
    });
    return response.data;
  } catch (error: any) {
    log.error(`Error mapping unknown item ${itemId}`, error);
    throw error;
  }
};

/**
 * Create a new SKU from an unknown item report
 */
export const createSkuFromUnknown = async (
  itemId: string,
  data: {
    item_code: string;
    item_name: string;
    category: string;
    subcategory?: string;
    mrp: number;
    uom_code: string;
    resolve_notes?: string;
  }
) => {
  try {
    const response = await api.post(`/api/admin/unknown-items/${itemId}/create-sku`, data);
    return response.data;
  } catch (error: any) {
    log.error(`Error creating SKU from unknown item ${itemId}`, error);
    throw error;
  }
};

/**
 * Delete/Dismiss an unknown item report
 */
export const deleteUnknownItem = async (itemId: string) => {
  try {
    const response = await api.delete(`/api/admin/unknown-items/${itemId}`);
    return response.data;
  } catch (error: any) {
    log.error(`Error deleting unknown item ${itemId}`, error);
    throw error;
  }
};

// Get item by barcode (with offline support, retry, and auto recovery)
/**
 * Lookup an item by barcode with validation, retry and cache fallback.
 * Returns item with source metadata indicating freshness.
 * @param barcode Barcode string scanned/entered
 * @param retryCount Number of retries for transient failures
 */
// Register user
export const registerUser = async (userData: {
  username: string;
  password: string;
  full_name: string;
  employee_id?: string;
  phone?: string;
}): Promise<TokenResponse> => {
  const response = await api.post("/api/auth/register", userData);
  return response.data;
};

// Database Mapping API
export const getAvailableTables = async (
  host: string,
  port: number,
  database: string,
  user?: string,
  password?: string,
  schema: string = "dbo"
) => {
  try {
    const params = new URLSearchParams({
      host,
      port: port.toString(),
      database,
      schema,
    });
    if (user) params.append("user", user);
    if (password) params.append("password", password);

    const response = await api.get(`/api/mapping/tables?${params.toString()}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get tables error:", error);
    throw error;
  }
};

export const getTableColumns = async (
  host: string,
  port: number,
  database: string,
  tableName: string,
  user?: string,
  password?: string,
  schema: string = "dbo"
) => {
  try {
    const params = new URLSearchParams({
      host,
      port: port.toString(),
      database,
      table_name: tableName,
      schema,
    });
    if (user) params.append("user", user);
    if (password) params.append("password", password);

    const response = await api.get(`/api/mapping/columns?${params.toString()}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get columns error:", error);
    throw error;
  }
};

export const getCurrentMapping = async () => {
  try {
    const response = await api.get("/api/mapping/current");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get current mapping error:", error);
    throw error;
  }
};

export const testMapping = async (
  config: Record<string, unknown>,
  host: string,
  port: number,
  database: string,
  user?: string,
  password?: string
) => {
  try {
    const params = new URLSearchParams({
      host,
      port: port.toString(),
      database,
    });
    if (user) params.append("user", user);
    if (password) params.append("password", password);

    const response = await api.post(`/api/mapping/preview?${params.toString()}`, config);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Test mapping error:", error);
    throw error;
  }
};

export const saveMapping = async (config: Record<string, unknown>) => {
  try {
    const response = await api.post("/api/mapping/save", config);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Save mapping error:", error);
    throw error;
  }
};

// Sync offline queue (enhanced version in syncService.ts)
export const syncOfflineQueue = async (options?: Record<string, unknown>) => {
  // Import sync service dynamically
  const syncService = await import("../syncService");
  return await syncService.syncOfflineQueue(options);
};

// Activity Log API
export const getActivityLogs = async (
  page: number = 1,
  pageSize: number = 50,
  user?: string,
  action?: string,
  status?: string,
  startDate?: string,
  endDate?: string
) => {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    if (user) params.append("user", user);
    if (action) params.append("action", action);
    if (status) params.append("status_filter", status);
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    __DEV__ &&
      console.log("🔍 [Activity Logs] Fetching activity logs:", {
        page,
        pageSize,
        filters: { user, action, status, startDate, endDate },
        url: `/api/activity-logs?${params.toString()}`,
      });

    const response = await api.get(`/api/activity-logs?${params.toString()}`);

    __DEV__ &&
      console.log("✅ [Activity Logs] Success:", {
        activitiesReturned: response.data?.activities?.length || 0,
      });

    return response.data;
  } catch (error: any) {
    __DEV__ &&
      console.error("❌ [Activity Logs] Error fetching activity logs:", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        data: error.response?.data,
        filters: { page, pageSize, user, action, status, startDate, endDate },
      });
    throw error;
  }
};

// Verify Supervisor PIN
export const verifyPin = async (data: {
  supervisor_username: string;
  pin: string;
  action: string;
  reason: string;
  staff_username: string;
  entity_id?: string;
}) => {
  try {
    const response = await api.post("/api/supervisor/verify-pin", data);
    return response.data;
  } catch (error: any) {
    __DEV__ && console.error("Verify PIN error:", error);
    throw error;
  }
};

export const getActivityStats = async (startDate?: string, endDate?: string) => {
  try {
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    __DEV__ &&
      console.log("📊 [Activity Stats] Fetching statistics:", {
        filters: { startDate, endDate },
        url: `/api/activity-logs/stats?${params.toString()}`,
      });

    const response = await api.get(`/api/activity-logs/stats?${params.toString()}`);

    __DEV__ &&
      console.log("✅ [Activity Stats] Success:", {
        total: response.data?.total || 0,
        successCount: response.data?.by_status?.success || 0,
        errorCount: response.data?.by_status?.error || 0,
        warningCount: response.data?.by_status?.warning || 0,
      });

    return response.data;
  } catch (error: any) {
    __DEV__ &&
      console.error("❌ [Activity Stats] Error fetching statistics:", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        data: error.response?.data,
        filters: { startDate, endDate },
      });
    throw error;
  }
};

// Error Log API
export const getErrorLogs = async (
  page: number = 1,
  pageSize: number = 50,
  severity?: string,
  errorType?: string,
  endpoint?: string,
  resolved?: boolean,
  startDate?: string,
  endDate?: string
) => {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    if (severity) params.append("severity", severity);
    if (errorType) params.append("error_type", errorType);
    if (endpoint) params.append("endpoint", endpoint);
    if (resolved !== undefined) params.append("resolved", resolved.toString());
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    __DEV__ &&
      console.log("🔍 [Error Logs] Fetching error logs:", {
        page,
        pageSize,
        filters: {
          severity,
          errorType,
          endpoint,
          resolved,
          startDate,
          endDate,
        },
        url: `/api/error-logs?${params.toString()}`,
      });

    const response = await api.get(`/api/error-logs?${params.toString()}`);

    __DEV__ &&
      console.log("✅ [Error Logs] Success:", {
        totalErrors: response.data?.pagination?.total || 0,
        page: response.data?.pagination?.page || page,
        errorsReturned: response.data?.errors?.length || 0,
      });

    return response.data;
  } catch (error: any) {
    __DEV__ &&
      console.error("❌ [Error Logs] Error fetching error logs:", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        data: error.response?.data,
        filters: {
          page,
          pageSize,
          severity,
          errorType,
          endpoint,
          resolved,
          startDate,
          endDate,
        },
      });
    throw error;
  }
};

export const getErrorStats = async (startDate?: string, endDate?: string) => {
  try {
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    __DEV__ &&
      console.log("📊 [Error Stats] Fetching statistics:", {
        filters: { startDate, endDate },
        url: `/api/error-logs/stats?${params.toString()}`,
      });

    const response = await api.get(`/api/error-logs/stats?${params.toString()}`);

    __DEV__ &&
      console.log("✅ [Error Stats] Success:", {
        total: response.data?.total || 0,
        criticalCount: response.data?.by_severity?.critical || 0,
        errorCount: response.data?.by_severity?.error || 0,
        warningCount: response.data?.by_severity?.warning || 0,
      });

    return response.data;
  } catch (error: any) {
    __DEV__ &&
      console.error("❌ [Error Stats] Error fetching statistics:", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        data: error.response?.data,
        filters: { startDate, endDate },
      });
    throw error;
  }
};

export const getErrorDetail = async (errorId: string) => {
  try {
    __DEV__ && console.log("🔍 [Error Detail] Fetching error details:", { errorId });

    const response = await api.get(`/api/error-logs/${errorId}`);

    __DEV__ &&
      console.log("✅ [Error Detail] Success:", {
        errorId,
        severity: response.data?.severity,
        errorType: response.data?.error_type,
        timestamp: response.data?.timestamp,
      });

    return response.data;
  } catch (error: any) {
    __DEV__ &&
      console.error("❌ [Error Detail] Error fetching error details:", {
        errorId,
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        data: error.response?.data,
      });
    throw error;
  }
};

export const resolveError = async (errorId: string, resolutionNote?: string) => {
  try {
    const response = await api.put(`/api/error-logs/${errorId}/resolve`, {
      resolution_note: resolutionNote,
    });
    return response.data;
  } catch (error: any) {
    __DEV__ && console.error("Resolve error error:", error);
    throw error;
  }
};

export const clearErrorLogs = async () => {
  try {
    const response = await api.delete("/api/error-logs");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Clear error logs error:", error);
    throw error;
  }
};

// ERP Configuration
export const getERPConfig = async () => {
  try {
    const response = await api.get("/api/erp/config");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get ERP config error:", error);
    throw error;
  }
};

// --- Modern grouped exports for logical access patterns ---
export const sessionsApi = {
  createSession,
  getSessions,
  getSession,
  bulkCloseSessions,
  bulkReconcileSessions,
  bulkExportSessions,
  getSessionsAnalytics,
  updateSessionStatus: inventoryWorkflowApi.updateSessionStatus,
};

export const countLineApi = {
  createCountLine: inventoryWorkflowApi.createCountLine,
  getCountLines: inventoryWorkflowApi.getCountLines,
  checkItemCounted: inventoryWorkflowApi.checkItemCounted,
  addQuantityToCountLine: inventoryWorkflowApi.addQuantityToCountLine,
  getVarianceReasons: inventoryWorkflowApi.getVarianceReasons,
  approveCountLine: inventoryWorkflowApi.approveCountLine,
  rejectCountLine: inventoryWorkflowApi.rejectCountLine,
  verifyStock: inventoryWorkflowApi.verifyStock,
  unverifyStock: inventoryWorkflowApi.unverifyStock,
};

export const itemsApi = {
  getItemByBarcode: inventoryWorkflowApi.getItemByBarcode,
  searchItems: inventoryWorkflowApi.searchItems,
  searchItemsOptimized: inventoryWorkflowApi.searchItemsOptimized,
  getSearchSuggestions: inventoryWorkflowApi.getSearchSuggestions,
  createUnknownItem: inventoryWorkflowApi.createUnknownItem,
  refreshItemStock: inventoryWorkflowApi.refreshItemStock,
};

export const mappingApi = {
  getAvailableTables,
  getTableColumns,
  getCurrentMapping,
  testMapping,
  saveMapping,
};

export const exportsApi = {
  getExportSchedules,
  getExportSchedule,
  createExportSchedule,
  updateExportSchedule,
  deleteExportSchedule,
  triggerExportSchedule,
  getExportResults,
  downloadExportResult,
};

export const syncApi = {
  syncOfflineQueue,
  getSyncConflicts,
  getSyncConflictDetail,
  resolveSyncConflict,
  batchResolveSyncConflicts,
  getSyncConflictStats,
  getSyncStatus,
  getSyncStats,
  triggerManualSync,
};

export const metricsApi = {
  getMetrics,
  getMetricsHealth,
  getMetricsStats,
  getSystemHealthScore,
  getSystemStats,
};

export const adminControlApi = {
  getServicesStatus,
  startService,
  stopService,
  getSystemIssues,
  getLoginDevices,
  getServiceLogs,
  clearServiceLogs,
};

export const reportsApi = {
  getAvailableReports,
  generateReport,
};

export const sqlServerApi = {
  getSqlServerConfig,
  updateSqlServerConfig,
  testSqlServerConnection,
  getSQLStatus,
  testSQLConnection,
  configureSQLConnection,
  getSQLConnectionHistory,
};

export const securityApi = {
  getSecuritySummary,
  getFailedLogins,
  getSuspiciousActivity,
  getSecuritySessions,
  getSecurityAuditLog,
  getIpTracking,
};

export const settingsApi = {
  getSystemParameters,
  updateSystemParameters,
  getSettingsCategories,
  resetSettingsToDefaults,
  getSystemSettings,
  updateSystemSettings,
};

export {
  getVarianceTrend,
  getStaffPerformance,
} from "./api.advancedAnalytics";
export {
  getFieldDefinitions,
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
  setFieldValue,
  setBulkFieldValues,
  getItemFieldValues,
  getItemsWithFields,
  getFieldStatistics,
} from "./api.dynamicFields";
export {
  getDiagnosisHealth,
  getDiagnosisStats,
  diagnoseError,
  attemptAutoFixDiagnosis,
} from "./api.diagnosis";
export {
  syncBatch,
  getWatchtowerStats,
  getZones,
  getWarehouses,
} from "./api.misc";
export type { Notification } from "./api.notifications";
export {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "./api.notifications";

export default api;
