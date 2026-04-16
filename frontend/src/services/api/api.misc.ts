import api from "../httpClient";

const unwrapApiPayload = <T>(payload: T | { data?: T } | null | undefined): T | null => {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data?: T }).data !== undefined
  ) {
    return (payload as { data?: T }).data ?? null;
  }

  return (payload as T | null | undefined) ?? null;
};

// Batch sync offline queue
export const syncBatch = async (operations: Record<string, unknown>[]) => {
  try {
    const response = await api.post("/api/sync/batch", { operations });
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.warn("Sync batch error:", error);
    throw error;
  }
};

// Get Watchtower stats
export const getWatchtowerStats = async () => {
  try {
    const response = await api.get("/api/v2/sessions/watchtower");
    return unwrapApiPayload(response.data);
  } catch (error: unknown) {
    __DEV__ && console.error("Get watchtower stats error:", error);
    throw error;
  }
};

// Get Zones
export const getZones = async () => {
  try {
    const response = await api.get("/api/locations/zones");
    return response.data;
  } catch (error: any) {
    if (error?.response?.status !== 401) {
      console.error("Error fetching zones:", error);
    }
    throw error;
  }
};

// Get Warehouses
export const getWarehouses = async (zone?: string) => {
  try {
    const url = zone
      ? `/api/locations/warehouses?zone=${encodeURIComponent(zone)}`
      : "/api/locations/warehouses";
    const response = await api.get(url);
    return response.data;
  } catch (error: any) {
    if (error?.response?.status !== 401) {
      console.error("Error fetching warehouses:", error);
    }
    throw error;
  }
};
