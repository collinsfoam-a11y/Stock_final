import api from "../../httpClient";

// ==========================================
// MASTER SETTINGS & SETTINGS API
// ==========================================

export const getSystemParameters = async () => {
  try {
    const response = await api.get("/api/admin/settings/parameters");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get system parameters error:", error);
    throw error;
  }
};

export const updateSystemParameters = async (parameters: Record<string, unknown>) => {
  try {
    const response = await api.put("/api/admin/settings/parameters", parameters);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Update system parameters error:", error);
    throw error;
  }
};

export const getSettingsCategories = async () => {
  try {
    const response = await api.get("/api/admin/settings/categories");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get settings categories error:", error);
    throw error;
  }
};

export const resetSettingsToDefaults = async (category?: string) => {
  try {
    const params = category ? { category } : {};
    const response = await api.post("/api/admin/settings/reset", null, {
      params,
    });
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Reset settings error:", error);
    throw error;
  }
};

// Settings API
export const getSystemSettings = async () => {
  try {
    const response = await api.get("/api/admin/settings/parameters");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get system settings error:", error);
    throw error;
  }
};

export const updateSystemSettings = async (settings: Record<string, unknown>) => {
  try {
    const response = await api.put("/api/admin/settings/parameters", settings);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Update system settings error:", error);
    throw error;
  }
};
