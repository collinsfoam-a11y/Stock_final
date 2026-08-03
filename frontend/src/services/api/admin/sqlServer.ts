import api from "../../httpClient";
import { getServiceLogs } from "./serviceControl";

// ==========================================
// SQL SERVER CONFIG & CONNECTION API
// ==========================================

export const getSqlServerConfig = async () => {
  try {
    const response = await api.get("/api/admin/control/sql-server/config");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get SQL Server config error:", error);
    throw error;
  }
};

export const updateSqlServerConfig = async (config: Record<string, unknown>) => {
  try {
    const response = await api.post("/api/admin/control/sql-server/config", config);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Update SQL Server config error:", error);
    throw error;
  }
};

export const testSqlServerConnection = async (config?: Record<string, unknown>) => {
  try {
    const response = await api.post("/api/admin/control/sql-server/test", config || {});
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Test SQL Server connection error:", error);
    throw error;
  }
};

// SQL Server Connection API — backwards-compatible aliases
export const getSQLStatus = async () => {
  // Backwards-compatible alias: the backend exposes connection status via
  // POST /api/admin/control/sql-server/test (with an empty body).
  return await testSqlServerConnection();
};

export const testSQLConnection = async (config: Record<string, unknown>) => {
  // Backwards-compatible alias
  return await testSqlServerConnection(config);
};

export const configureSQLConnection = async (config: Record<string, unknown>) => {
  // Backwards-compatible alias
  return await updateSqlServerConfig(config);
};

export const getSQLConnectionHistory = async () => {
  // Backwards-compatible alias: the backend doesn't have a dedicated SQL
  // connection history endpoint, but we do expose service logs for sql_server.
  return await getServiceLogs("sql_server", 200);
};
