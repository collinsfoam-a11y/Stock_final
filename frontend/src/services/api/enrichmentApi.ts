/**
 * Enrichment API Service
 * Frontend service for item data enrichment operations
 *
 * Backend routes live under: /api/v1/enrichment/*
 */

import apiClient from "../httpClient";
import type {
  EnrichmentData,
  EnrichmentRequest,
  EnrichmentResponse,
  EnrichmentValidation,
  MissingFieldsInfo,
  EnrichmentHistoryEntry,
  IncompleteItemsResponse,
  EnrichmentStats,
  BulkImportResult,
  QtyCheckResult,
} from "../../types/enrichment";

interface ApiError {
  response?: {
    data?: {
      detail?: string | { message: string };
    };
  };
  message?: string;
}

const ENRICHMENT_BASE = "/api/v1/enrichment";

const toErrorMessage = (error: unknown, fallback: string) => {
  const err = error as ApiError;
  const detail = err.response?.data?.detail;
  return (
    (typeof detail === "object" && detail !== null ? detail.message : detail) ||
    err.message ||
    fallback
  );
};

/**
 * Enrich/correct data for a specific item
 */
export const enrichItem = async (
  itemCode: string,
  enrichmentData: EnrichmentData,
): Promise<EnrichmentResponse> => {
  try {
    const response = await apiClient.post(`${ENRICHMENT_BASE}/record`, {
      item_code: itemCode,
      ...enrichmentData,
    });

    const payload = response.data;
    const fieldsUpdated = Array.isArray(payload?.fields_updated)
      ? payload.fields_updated
      : [];

    // Map backend response into the app's canonical type.
    return {
      success: Boolean(payload?.success),
      item_code: payload?.item_code ?? itemCode,
      fields_updated: fieldsUpdated,
      data_complete: Boolean(payload?.data_complete),
      completion_percentage: Number(payload?.completion_percentage ?? 0),
      updated_at: new Date().toISOString(),
    };
  } catch (error: unknown) {
    __DEV__ && console.error("Enrichment failed:", error);
    throw new Error(toErrorMessage(error, "Failed to enrich item data"));
  }
};

/**
 * Get missing fields for an item
 */
export const getMissingFields = async (
  itemCode: string,
): Promise<MissingFieldsInfo> => {
  try {
    const response = await apiClient.get(
      `${ENRICHMENT_BASE}/completeness/${encodeURIComponent(itemCode)}`,
    );

    const payload = response.data;
    return {
      item_code: payload?.item_code ?? itemCode,
      missing_fields: payload?.missing_fields ?? [],
      completion_percentage: Number(payload?.percentage ?? 0),
      is_complete: Boolean(payload?.is_complete),
    };
  } catch (error: unknown) {
    __DEV__ && console.error("Failed to get missing fields:", error);
    throw new Error(toErrorMessage(error, "Failed to get missing fields"));
  }
};

/**
 * Get enrichment history for an item
 */
export const getEnrichmentHistory = async (
  itemCode: string,
  limit: number = 10,
): Promise<EnrichmentHistoryEntry[]> => {
  // Not currently implemented on the backend.
  throw new Error(
    `Enrichment history is not available (no backend endpoint). itemCode=${itemCode}, limit=${limit}`,
  );
};

/**
 * Validate enrichment data without saving
 */
export const validateEnrichmentData = async (
  itemCode: string,
  enrichmentData: EnrichmentData,
): Promise<EnrichmentValidation> => {
  try {
    const response = await apiClient.post(`${ENRICHMENT_BASE}/validate`, {
      item_code: itemCode,
      ...enrichmentData,
    });

    const payload = response.data;
    return {
      is_valid: Boolean(payload?.is_valid),
      errors: payload?.errors ?? [],
    };
  } catch (error: unknown) {
    __DEV__ && console.error("Validation failed:", error);
    throw new Error(toErrorMessage(error, "Validation failed"));
  }
};

/**
 * Get list of items with incomplete data
 */
export const getIncompleteItems = async (
  limit: number = 100,
  skip: number = 0,
  category?: string,
): Promise<IncompleteItemsResponse> => {
  try {
    const response = await apiClient.get(`${ENRICHMENT_BASE}/incomplete`, {
      params: { limit, category },
    });

    const payload = response.data;
    const items = payload?.items ?? [];
    const total = Number(payload?.count ?? items.length);

    // Backend doesn't support paging; we keep the API stable for callers.
    return {
      items,
      total,
      limit,
      skip,
    };
  } catch (error: unknown) {
    __DEV__ && console.error("Failed to get incomplete items:", error);
    throw new Error(toErrorMessage(error, "Failed to get incomplete items"));
  }
};

/**
 * Get enrichment statistics
 */
export const getEnrichmentStats = async (
  dateFrom?: string,
  dateTo?: string,
): Promise<EnrichmentStats> => {
  try {
    const response = await apiClient.get(`${ENRICHMENT_BASE}/stats`, {
      params: { start_date: dateFrom, end_date: dateTo },
    });

    // Backend returns: { success: true, stats: {...} }
    const payload = response.data?.stats ?? response.data;
    const totalItems = Number(payload?.total_items ?? 0);
    const completeItems = Number(payload?.complete_items ?? 0);
    const fieldCounts = payload?.field_counts ?? {};

    return {
      total_items: totalItems,
      complete_items: completeItems,
      incomplete_items: Math.max(0, totalItems - completeItems),
      completion_percentage: Number(payload?.completion_rate ?? 0),
      field_stats: {
        serial_numbers: Number(fieldCounts?.serial_number ?? 0),
        mrp: Number(fieldCounts?.mrp ?? 0),
        hsn_codes: Number(fieldCounts?.hsn_code ?? 0),
        locations: Number(fieldCounts?.location ?? 0),
      },
      top_contributors: [],
    };
  } catch (error: unknown) {
    __DEV__ && console.error("Failed to get enrichment stats:", error);
    throw new Error(toErrorMessage(error, "Failed to get enrichment stats"));
  }
};

/**
 * Bulk import enrichment data
 */
export const bulkImportEnrichments = async (
  enrichments: EnrichmentRequest[],
): Promise<BulkImportResult> => {
  try {
    const payload = {
      enrichments: enrichments.map((entry) => ({
        item_code: entry.item_code,
        ...(entry.enrichment || {}),
      })),
    };

    const response = await apiClient.post(`${ENRICHMENT_BASE}/bulk`, payload);
    return response.data.results;
  } catch (error: unknown) {
    __DEV__ && console.error("Bulk import failed:", error);
    throw new Error(toErrorMessage(error, "Bulk import failed"));
  }
};

/**
 * Check real-time quantity from SQL Server
 * Call this when staff selects an item for counting
 */
export const checkItemQtyRealtime = async (
  itemCode: string,
): Promise<QtyCheckResult> => {
  // Not currently implemented on the backend.
  throw new Error(
    `Real-time qty check is not available (no backend endpoint). itemCode=${itemCode}`,
  );
};

/**
 * Recalculate data completeness for all items (admin only)
 */
export const recalculateCompleteness = async (): Promise<{
  items_updated: number;
}> => {
  // Not currently implemented on the backend.
  throw new Error("Recalculate completeness is not available (no backend endpoint).");
};

