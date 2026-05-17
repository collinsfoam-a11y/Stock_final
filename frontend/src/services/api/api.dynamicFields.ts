import api from "../httpClient";

export const getFieldDefinitions = async (
  enabledOnly: boolean = true,
  visibleOnly: boolean = false
) => {
  try {
    const params = new URLSearchParams({
      enabled_only: enabledOnly.toString(),
      visible_only: visibleOnly.toString(),
    });
    const response = await api.get(`/api/dynamic-fields/definitions?${params.toString()}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get field definitions error:", error);
    throw error;
  }
};

export const createFieldDefinition = async (fieldData: Record<string, unknown>) => {
  try {
    const response = await api.post("/api/dynamic-fields/definitions", fieldData);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Create field definition error:", error);
    throw error;
  }
};

export const updateFieldDefinition = async (fieldId: string, updates: Record<string, unknown>) => {
  try {
    const response = await api.put(`/api/dynamic-fields/definitions/${fieldId}`, updates);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Update field definition error:", error);
    throw error;
  }
};

export const deleteFieldDefinition = async (fieldId: string) => {
  try {
    const response = await api.delete(`/api/dynamic-fields/definitions/${fieldId}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Delete field definition error:", error);
    throw error;
  }
};

export const setFieldValue = async (itemCode: string, fieldName: string, value: unknown) => {
  try {
    const response = await api.post("/api/dynamic-fields/values", {
      item_code: itemCode,
      field_name: fieldName,
      value,
    });
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Set field value error:", error);
    throw error;
  }
};

export const setBulkFieldValues = async (
  itemCodes: string[],
  fieldValues: Record<string, unknown>
) => {
  try {
    const response = await api.post("/api/dynamic-fields/values/bulk", {
      item_codes: itemCodes,
      field_values: fieldValues,
    });
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Set bulk field values error:", error);
    throw error;
  }
};

export const getItemFieldValues = async (itemCode: string) => {
  try {
    const response = await api.get(`/api/dynamic-fields/values/${itemCode}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get item field values error:", error);
    throw error;
  }
};

export const getItemsWithFields = async (
  fieldName?: string,
  fieldValue?: string,
  limit: number = 100,
  skip: number = 0
) => {
  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      skip: skip.toString(),
    });
    if (fieldName) params.append("field_name", fieldName);
    if (fieldValue) params.append("field_value", fieldValue);

    const response = await api.get(`/api/dynamic-fields/items?${params.toString()}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get items with fields error:", error);
    throw error;
  }
};

export const getFieldStatistics = async (fieldName: string) => {
  try {
    const response = await api.get(`/api/dynamic-fields/statistics/${fieldName}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get field statistics error:", error);
    throw error;
  }
};

