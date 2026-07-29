import api from "../../httpClient";

// ==========================================
// PERMISSION MANAGEMENT
// ==========================================

export const getAvailablePermissions = async () => {
  try {
    const response = await api.get("/api/permissions/available");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get available permissions error:", error);
    throw error;
  }
};

export const getRolePermissions = async (role: string) => {
  try {
    const response = await api.get("/api/permissions/roles");
    const data = response.data?.data ?? response.data;
    const permissions = data?.[role] ?? [];
    return { success: true, data: { role, permissions } };
  } catch (error: unknown) {
    __DEV__ && console.error("Get role permissions error:", error);
    throw error;
  }
};

export const getUserPermissions = async (username: string) => {
  try {
    const response = await api.get(`/api/permissions/users/${username}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get user permissions error:", error);
    throw error;
  }
};

export const addUserPermissions = async (username: string, permissions: string[]) => {
  try {
    const response = await api.post(`/api/permissions/users/${username}/add`, {
      permissions,
    });
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Add user permissions error:", error);
    throw error;
  }
};

export const removeUserPermissions = async (username: string, permissions: string[]) => {
  try {
    const response = await api.post(`/api/permissions/users/${username}/remove`, {
      permissions,
    });
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Remove user permissions error:", error);
    throw error;
  }
};
