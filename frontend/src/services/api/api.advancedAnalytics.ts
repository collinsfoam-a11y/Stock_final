import api from "../httpClient";

export const getVarianceTrend = async (days: number = 30) => {
  try {
    const response = await api.get(`/api/variance/trend?days=${days}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get variance trend error:", error);
    throw error;
  }
};

export const getStaffPerformance = async (days: number = 30) => {
  try {
    const response = await api.get(`/api/metrics/staff-performance?days=${days}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get staff performance error:", error);
    throw error;
  }
};

