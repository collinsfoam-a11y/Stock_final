import { useAuthStore } from "../../store/authStore";
import { AppError, type AppErrorCode } from "../../utils/errors";
import { retryWithBackoff } from "../../utils/retry";
import { CreateCountLinePayload, Item } from "../../types/scan";
import { generateUUID } from "../../utils/uuid";
import { validateBarcode } from "../../utils/validation";
import { CountLinePayloadSchema } from "../../types/schemas";
import api from "../httpClient";
import { createLogger } from "../logging";
import { createOfflineCountLine } from "../offline/offlineCountLine";
import {
  addToOfflineQueue,
  cacheCountLine,
  cacheItem,
  getCountLinesBySessionFromCache,
  getItemFromCache,
  isCacheStale,
  searchItemsInCache,
  type DataSource,
} from "../offline/offlineStorage";
import { submitCountLineCommand } from "../control-plane/countLineControlPlane";
import {
  approveCountLineCommand,
  overlayCountLineReviewState,
  rejectCountLineCommand,
  unverifyStockCommand,
  verifyStockCommand,
} from "../control-plane/countLineReviewControlPlane";
import { isOnline, shouldAttemptReadApi } from "./sessionManagementApi";

const log = createLogger("InventoryWorkflowApi");

/**
 * Fail-open validation for count-line payloads. Logs schema violations so they
 * can be detected in dev, but never blocks the online/offline flow — a schema
 * drift between frontend and backend must not drop a staff member's count.
 */
const validateCountLinePayload = (countData: CreateCountLinePayload): void => {
  const parsed = CountLinePayloadSchema.safeParse(countData);
  if (!parsed.success) {
    log.warn("Count line payload failed runtime validation", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
      itemCode: countData.item_code,
    });
  }
};

type InventoryItemResult = Item & {
  _source?: DataSource;
  _cachedAt?: string;
  _stale?: boolean;
  _degraded?: boolean;
};

type CountLineListResponse = {
  items: any[];
  pagination: any;
  _source?: DataSource;
  _stale?: boolean;
  _degraded?: boolean;
};

const toCachedInventoryItem = (cached: any): InventoryItemResult => {
  const stale = isCacheStale(cached.cached_at);
  const stockValue = cached.current_stock ?? cached.stock_qty ?? 0;
  return {
    id: cached.item_code,
    name: cached.item_name,
    item_code: cached.item_code,
    barcode: cached.barcode,
    item_name: cached.item_name,
    description: cached.description,
    stock_qty: stockValue,
    current_stock: stockValue,
    uom_name: cached.uom_name ?? cached.uom,
    mrp: cached.mrp,
    sales_price: cached.sales_price,
    category: cached.category,
    subcategory: cached.subcategory,
    is_serialized: cached.is_serialized ?? false,
    _source: "cache",
    _cachedAt: cached.cached_at,
    _stale: stale,
  };
};

const getCachedBarcodeItem = async (
  barcode: string,
  options?: {
    code?: AppErrorCode;
    message?: string;
    userMessage?: string;
  }
): Promise<InventoryItemResult> => {
  const items = await searchItemsInCache(barcode);
  if (items.length > 0 && items[0]) {
    log.debug("Found in cache", { itemCode: items[0].item_code });
    return toCachedInventoryItem(items[0]);
  }

  throw new AppError({
    code: options?.code || "ITEM_CACHE_MISS",
    severity: "USER",
    message: options?.message || `Item not found in offline cache: ${barcode}`,
    userMessage:
      options?.userMessage || "Item not found in offline cache. Connect to internet to search.",
    context: { barcode },
  });
};

const resolveInventoryDataSource = (responseData: any): DataSource => {
  if (responseData.metadata?.source === "sql_server_sync") {
    return "sql";
  }
  if (responseData.metadata?.source === "cache") {
    return "cache";
  }
  return "api";
};

const resolveDisplayName = (itemData: any) => {
  if (itemData.item_name) return itemData.item_name;
  if (itemData.name) return itemData.name;
  if (itemData.category) return itemData.category;
  return `Item ${itemData.item_code}`;
};

const resolveStockQuantity = (itemData: any) => {
  if (itemData.stock_qty !== undefined && itemData.stock_qty !== null) {
    return itemData.stock_qty;
  }
  if (itemData.current_stock !== undefined && itemData.current_stock !== null) {
    return itemData.current_stock;
  }
  return 0;
};

const resolveUomName = (itemData: any) => {
  if (itemData.uom_name) return itemData.uom_name;
  if (itemData.uom) return itemData.uom;
  return itemData.uom_code;
};

const resolveSalesPrice = (itemData: any) => {
  if (itemData.sales_price !== undefined && itemData.sales_price !== null) {
    return itemData.sales_price;
  }
  if (itemData.sale_price !== undefined && itemData.sale_price !== null) {
    return itemData.sale_price;
  }
  return itemData.standard_rate;
};

const resolveSalePrice = (itemData: any) => {
  if (itemData.sale_price !== undefined && itemData.sale_price !== null) {
    return itemData.sale_price;
  }
  return itemData.sales_price;
};

const resolveManufacturingDate = (itemData: any) => {
  if (itemData.manufacturing_date) return itemData.manufacturing_date;
  return itemData.mfg_date;
};

const normalizeApiInventoryItem = (itemData: any, responseData: any): InventoryItemResult => {
  const displayName = resolveDisplayName(itemData);
  const stockQty = resolveStockQuantity(itemData);
  const uomName = resolveUomName(itemData);
  const salesPrice = resolveSalesPrice(itemData);
  const salePrice = resolveSalePrice(itemData);
  const dataSource = resolveInventoryDataSource(responseData);

  return {
    id: itemData.id || itemData._id || itemData.item_code,
    name: itemData.name || displayName,
    item_code: itemData.item_code,
    barcode: itemData.barcode,
    item_name: itemData.item_name || displayName,
    uom_name: uomName,
    uom: uomName,
    sales_price: salesPrice,
    sale_price: salePrice,
    mrp: itemData.mrp,
    category: itemData.category,
    subcategory: itemData.subcategory,
    warehouse: itemData.warehouse,
    stock_qty: stockQty,
    current_stock: stockQty,
    batch_id: itemData.batch_id,
    manual_barcode: itemData.manual_barcode,
    unit2_barcode: itemData.unit2_barcode,
    unit_m_barcode: itemData.unit_m_barcode,
    manufacturing_date: resolveManufacturingDate(itemData),
    expiry_date: itemData.expiry_date,
    mrp_variants: itemData.mrp_variants,
    is_serialized: itemData.is_serialized ?? false,
    is_misplaced: itemData.is_misplaced,
    expected_location: itemData.expected_location,
    _source: dataSource,
  };
};

const cacheResolvedInventoryItem = async (item: InventoryItemResult): Promise<void> => {
  await cacheItem({
    item_code: item.item_code,
    barcode: item.barcode,
    item_name: item.item_name || item.name || item.item_code || "",
    description: (item as any).description,
    uom: item.uom ?? item.uom_code ?? item.uom_name,
    uom_name: item.uom_name,
    mrp: item.mrp,
    sales_price: item.sales_price,
    sale_price: item.sale_price ?? item.sales_price,
    category: item.category,
    subcategory: item.subcategory,
    warehouse: item.warehouse,
    manual_barcode: item.manual_barcode,
    unit2_barcode: item.unit2_barcode,
    unit_m_barcode: item.unit_m_barcode,
    batch_id: item.batch_id,
    current_stock: item.current_stock || item.stock_qty,
    is_serialized: item.is_serialized,
  });
};

const mapCachedSearchItem = (item: any): Item & { _source: DataSource } => ({
  id: item.item_code,
  name: item.item_name,
  item_code: item.item_code,
  barcode: item.barcode,
  item_name: item.item_name,
  description: item.description,
  uom: item.uom,
  stock_qty: item.current_stock,
  mrp: item.mrp,
  sale_price: item.sale_price,
  sales_price: item.sales_price,
  category: item.category,
  subcategory: item.subcategory,
  warehouse: item.warehouse,
  manual_barcode: item.manual_barcode,
  unit2_barcode: item.unit2_barcode,
  unit_m_barcode: item.unit_m_barcode,
  batch_id: item.batch_id,
  _source: "cache",
});

const normalizeBarcodeInput = (barcode: string) => {
  const validation = validateBarcode(barcode);
  if (!validation.valid || !validation.value) {
    throw new AppError({
      code: "INVALID_BARCODE",
      severity: "USER",
      message: validation.error || "Invalid barcode format",
      userMessage: "Please check the barcode and try again.",
      context: { barcode },
    });
  }
  return validation.value;
};

const shouldRetryInventoryLookup = (error: any) => {
  const status = error?.response?.status;
  return !(status && status >= 400 && status < 500);
};

const fetchInventoryItemFromApi = async (
  barcode: string,
  retryCount: number,
  sessionId?: string,
  rackNo?: string
) => {
  const response = await retryWithBackoff(
    () =>
      api.get(`/api/v2/erp/items/barcode/${encodeURIComponent(barcode)}/enhanced`, {
        params: {
          session_id: sessionId,
          rack_no: rackNo,
        },
      }),
    {
      retries: retryCount,
      backoffMs: 1000,
      shouldRetry: shouldRetryInventoryLookup,
    }
  );

  const itemData = response.data.item || response.data;
  if (!itemData || !itemData.item_code) {
    throw new AppError({
      code: "ITEM_NOT_FOUND",
      severity: "USER",
      message: `Item not found: Barcode '${barcode}' not in database`,
      userMessage: `No item found for barcode ${barcode}`,
      context: { barcode },
    });
  }

  return normalizeApiInventoryItem(itemData, response.data);
};

const fetchInventoryItemByIdentifierFromApi = async (identifier: string, retryCount: number) => {
  const response = await retryWithBackoff(
    () => api.get(`/api/v2/items/${encodeURIComponent(identifier)}`),
    {
      retries: retryCount,
      backoffMs: 1000,
      shouldRetry: shouldRetryInventoryLookup,
    }
  );

  const itemData = response.data.data || response.data.item || response.data;
  if (!response.data.success || !itemData?.item_code) {
    throw new AppError({
      code: "ITEM_NOT_FOUND",
      severity: "USER",
      message: `Item not found: '${identifier}' not in database`,
      userMessage: `No item found for ${identifier}`,
      context: { identifier },
    });
  }

  return normalizeApiInventoryItem(itemData, response.data);
};

const tryCacheResolvedItem = async (item: InventoryItemResult) => {
  try {
    await cacheResolvedInventoryItem(item);
  } catch (cacheError) {
    log.warn("Failed to cache item", {
      error: cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }
};

const isNotFoundApiError = (apiError: any) => {
  const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
  return apiError?.response?.status === 404 || errorMessage.includes("404");
};

const handleBarcodeLookupFailure = async (trimmedBarcode: string, apiError: any) => {
  if (isNotFoundApiError(apiError)) {
    log.info("Item not found via API", { barcode: trimmedBarcode });
  } else {
    const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
    log.error("API call failed", { error: errorMessage });
  }

  log.debug("API failed, trying cache fallback");
  try {
    return {
      ...(await getCachedBarcodeItem(trimmedBarcode, {
        code: "ITEM_NOT_FOUND",
        message: "Item not found in cache",
        userMessage: `Barcode ${trimmedBarcode} not found. Please try again when online.`,
      })),
      _source: "cache" as DataSource,
      _degraded: true,
    };
  } catch (cacheError: any) {
    if (cacheError instanceof AppError) {
      throw cacheError;
    }

    log.error("Cache fallback also failed", { error: cacheError.message });
    throw AppError.fromApiError(apiError, {
      barcode: trimmedBarcode,
      fallbackAttempted: true,
    });
  }
};

/**
 * Resolves an item by barcode, preferring live data and falling back to cached inventory.
 */
export const getItemByBarcode = async (
  barcode: string,
  retryCount: number = 3,
  sessionId?: string,
  rackNo?: string
): Promise<InventoryItemResult> => {
  const trimmedBarcode = normalizeBarcodeInput(barcode);
  log.debug(`Looking up barcode: ${trimmedBarcode}`, { original: barcode });

  if (!shouldAttemptReadApi()) {
    log.debug("Offline mode - searching cache");
    return await getCachedBarcodeItem(trimmedBarcode);
  }

  try {
    log.debug("Online mode - calling API");
    const normalizedItem = await fetchInventoryItemFromApi(
      trimmedBarcode,
      retryCount,
      sessionId,
      rackNo
    );

    log.debug("Found via API", { itemCode: normalizedItem.item_code });
    await tryCacheResolvedItem(normalizedItem);
    return normalizedItem;
  } catch (apiError: any) {
    return await handleBarcodeLookupFailure(trimmedBarcode, apiError);
  }
};

/**
 * Resolves an item detail by item code, barcode, or Mongo item id.
 *
 * This is intentionally broader than scanner lookup. The detail screen can be
 * opened from typed search results, where the selected row may carry an item
 * code rather than the exact product barcode that was scanned.
 */
export const getItemByIdentifier = async (
  identifier: string,
  retryCount: number = 3
): Promise<InventoryItemResult> => {
  const trimmedIdentifier = String(identifier || "").trim();
  if (!trimmedIdentifier) {
    throw new AppError({
      code: "INVALID_BARCODE",
      severity: "USER",
      message: "Item identifier cannot be empty",
      userMessage: "Select an item or enter a barcode before continuing.",
      context: { identifier },
    });
  }

  if (!shouldAttemptReadApi()) {
    log.debug("Offline mode - searching cache by item identifier");
    return await getCachedBarcodeItem(trimmedIdentifier, {
      code: "ITEM_CACHE_MISS",
      message: `Item not found in offline cache: ${trimmedIdentifier}`,
      userMessage: "This item is not available offline yet. Connect to the network and try again.",
    });
  }

  try {
    const normalizedItem = await fetchInventoryItemByIdentifierFromApi(
      trimmedIdentifier,
      retryCount
    );
    await tryCacheResolvedItem(normalizedItem);
    return normalizedItem;
  } catch (apiError: any) {
    try {
      return {
        ...(await getCachedBarcodeItem(trimmedIdentifier, {
          code: "ITEM_NOT_FOUND",
          message: "Item not found in cache",
          userMessage: `Item ${trimmedIdentifier} not found. Please try again when online.`,
        })),
        _source: "cache" as DataSource,
        _degraded: true,
      };
    } catch (cacheError: any) {
      if (cacheError instanceof AppError) {
        throw AppError.fromApiError(apiError, {
          identifier: trimmedIdentifier,
          fallbackAttempted: true,
        });
      }
      throw cacheError;
    }
  }
};

/**
 * Checks whether a serial number has already been counted in the session.
 */
export const checkSerialUniqueness = async (
  sessionId: string,
  serialNumber: string,
  itemCode?: string
): Promise<{
  exists: boolean;
  scope?: "item" | "global";
  item_code?: string;
  item_name?: string;
  counted_by?: string;
  floor_no?: string;
  rack_no?: string;
  status?: string;
}> => {
  try {
    // Pass item_code so the backend scopes the uniqueness check per item
    // (item_code + serial), matching the write-path contract. Omitting it
    // makes the backend fall back to a global scope, which would flag a
    // serial that legitimately belongs to a different item as a duplicate.
    const params = itemCode ? { item_code: itemCode } : undefined;
    const response = await api.get(
      `/api/count-lines/check-serial/${sessionId}/${serialNumber}`,
      params ? { params } : undefined
    );
    return response.data;
  } catch (error) {
    console.error("Error checking serial uniqueness:", error);
    return { exists: false };
  }
};

/**
 * Shared response shape for optimized item search results.
 */
export interface OptimizedSearchResult {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
  query: string;
  search_time_ms: number;
  next_cursor?: string;
  has_more?: boolean;
}

/**
 * Performs item search and normalizes the optimized-search response for callers.
 */
export const searchItems = async (
  query: string,
  cursor?: string,
  limit: number = 10
): Promise<{
  items: (Item & { _source?: DataSource })[];
  nextCursor?: string;
  total: number;
  hasMore: boolean;
}> => {
  try {
    const result = await searchItemsOptimized(query, 1, limit, cursor);
    return {
      items: result.items as (Item & { _source?: DataSource })[],
      nextCursor: result.next_cursor,
      total: result.total,
      hasMore: !!result.has_more,
    };
  } catch (error: any) {
    log.error("searchItems failed, falling back to cache", {
      error: error.message,
    });
    const cachedItems = await searchItemsInCache(query);
    return {
      items: cachedItems.map(mapCachedSearchItem),
      total: cachedItems.length,
      hasMore: false,
    };
  }
};

/**
 * Calls the optimized search endpoint and maps API or cache data into shared item shapes.
 */
export const searchItemsOptimized = async (
  query: string,
  page: number = 1,
  pageSize: number = 10,
  cursor?: string
): Promise<OptimizedSearchResult> => {
  try {
    if (!shouldAttemptReadApi()) {
      const cachedItems = await searchItemsInCache(query);
      const mappedItems = cachedItems.map(mapCachedSearchItem);
      return {
        items: mappedItems,
        total: mappedItems.length,
        page: 1,
        page_size: mappedItems.length,
        query,
        search_time_ms: 0,
        has_more: false,
      };
    }

    const response = await api.get("/api/items/search/optimized", {
      params: {
        q: query,
        limit: pageSize,
        cursor: cursor || undefined,
        offset: cursor ? undefined : Math.max(0, (page - 1) * pageSize),
      },
    });

    const apiResponse = response.data;
    const data = apiResponse.data || { items: [] };
    const items = data.items || [];
    const metadata = data.metadata || {};

    const mappedItems: Item[] = items.map((item: Record<string, unknown>) => ({
      id: (item.id as string) || (item._id as string) || (item.item_code as string),
      item_code: item.item_code as string,
      barcode: item.barcode as string,
      name: item.item_name as string,
      item_name: item.item_name as string,
      description: item.description as string,
      uom: (item.uom_name as string) || (item.uom as string),
      uom_name: (item.uom_name as string) || (item.uom as string),
      stock_qty: (item.stock_qty as number) ?? (item.current_stock as number) ?? 0,
      mrp: item.mrp as number,
      sale_price: item.sale_price as number,
      sales_price: (item.sale_price as number) || (item.sales_price as number),
      manual_barcode: item.manual_barcode as string,
      unit2_barcode: item.unit2_barcode as string,
      unit_m_barcode: item.unit_m_barcode as string,
      batch_id: item.batch_id as string,
      category: item.category as string,
      subcategory: item.subcategory as string,
      warehouse: item.warehouse as string,
      relevance_score: item.relevance_score as number,
      match_type: item.match_type as string,
      _source: "api" as DataSource,
    }));

    await Promise.all(mappedItems.slice(0, 10).map((item) => cacheItem(item as any)));

    return {
      items: mappedItems,
      total: data.total || items.length,
      page: data.page || 1,
      page_size: data.page_size || pageSize,
      query,
      search_time_ms: data.search_time_ms || 0,
      next_cursor: metadata.next_cursor,
      has_more: metadata.has_more,
    };
  } catch (error: any) {
    log.error("searchItemsOptimized failed", { error: error.message });
    throw error;
  }
};

/**
 * Returns server-provided search suggestions for short query assistance.
 */
export const getSearchSuggestions = async (query: string, limit: number = 5): Promise<string[]> => {
  try {
    if (!shouldAttemptReadApi() || query.length < 2) {
      return [];
    }

    const response = await api.get("/api/items/search/suggestions", {
      params: { q: query, limit },
    });

    const apiResponse = response.data;
    return apiResponse?.data?.suggestions || apiResponse?.suggestions || [];
  } catch (error) {
    __DEV__ && console.error("Error fetching suggestions:", error);
    return [];
  }
};

/**
 * Loads the available category and warehouse filters for item search.
 */
export const getSearchFilters = async (): Promise<{
  categories: string[];
  warehouses: string[];
}> => {
  try {
    if (!shouldAttemptReadApi()) {
      return { categories: [], warehouses: [] };
    }

    const response = await api.get("/api/items/search/filters");
    const apiResponse = response.data;
    const data = apiResponse?.data || {};
    return {
      categories: Array.isArray(data.categories) ? data.categories : [],
      warehouses: Array.isArray(data.warehouses) ? data.warehouses : [],
    };
  } catch (error) {
    __DEV__ && console.error("Error fetching search filters:", error);
    return { categories: [], warehouses: [] };
  }
};

/**
 * Runs semantic search when the backend and network are available.
 */
export const searchItemsSemantic = async (query: string, limit: number = 20): Promise<Item[]> => {
  try {
    if (!shouldAttemptReadApi()) {
      return [];
    }

    const response = await api.get("/api/v2/items/semantic", {
      params: { query, limit },
    });

    const items = response.data.data?.items || [];
    return items.map((item: any) => ({
      ...item,
      id: item.id || item._id || item.item_code,
      name: item.name || item.item_name,
      item_name: item.item_name || item.name,
      item_code: item.item_code || item.barcode,
      barcode: item.barcode || item.item_code,
    }));
  } catch (error) {
    __DEV__ && console.error("Error in semantic search:", error);
    return [];
  }
};

/**
 * Fetches risk prediction summaries for a supervisor session view.
 */
export const getRiskPredictions = async (sessionId: string, limit: number = 10) => {
  try {
    if (!shouldAttemptReadApi()) return [];

    const response = await api.get("/api/v2/supervisor/predictions", {
      params: { session_id: sessionId, limit },
    });

    return response.data.data || [];
  } catch (error) {
    __DEV__ && console.error("Error fetching risk predictions:", error);
    return [];
  }
};

/**
 * Sends an image to the visual-identification endpoint and normalizes the result.
 */
export const identifyItem = async (imageUri: string): Promise<Item[]> => {
  try {
    if (!isOnline()) {
      throw new Error("Visual search requires internet connection");
    }

    const formData = new FormData();
    const filename = imageUri.split("/").pop();
    const match = /\.(\w+)$/.exec(filename || "");
    const type = match ? `image/${match[1]}` : "image";

    formData.append("file", {
      uri: imageUri,
      name: filename || "upload.jpg",
      type,
    } as any);

    const response = await api.post("/api/v2/items/identify", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 30000,
    });

    const items = response.data.data?.items || [];
    return items.map((item: any) => ({
      ...item,
      id: item.id || item._id,
      name: item.name || item.item_name,
    }));
  } catch (error) {
    __DEV__ && console.error("Error in visual search:", error);
    throw error;
  }
};

/**
 * Describes how an item has already been counted within a session.
 */
export interface ItemScanStatus {
  scanned: boolean;
  total_qty: number;
  locations: {
    floor_no: string | null;
    rack_no: string | null;
    counted_qty: number;
    counted_by: string;
    counted_at: string;
  }[];
}

/**
 * Checks whether an item has already been scanned in the current session.
 */
export const checkItemScanStatus = async (
  sessionId: string,
  itemCode: string
): Promise<ItemScanStatus> => {
  try {
    if (!shouldAttemptReadApi()) {
      const cachedLines = await getCountLinesBySessionFromCache(sessionId);
      const itemLines = cachedLines.filter((line) => line.item_code === itemCode);

      if (itemLines.length === 0) {
        return { scanned: false, total_qty: 0, locations: [] };
      }

      const totalQty = itemLines.reduce((sum, line) => sum + (line.counted_qty || 0), 0);
      const locations = itemLines.map((line) => ({
        floor_no: (line.floor_no as string) || null,
        rack_no: (line.rack_no as string) || null,
        counted_qty: line.counted_qty || 0,
        counted_by: line.counted_by || "offline_user",
        counted_at: (line.created_at as string) || new Date().toISOString(),
      }));

      return { scanned: true, total_qty: totalQty, locations };
    }

    const response = await api.get(`/api/sessions/${sessionId}/items/${itemCode}/scan-status`);
    return response.data;
  } catch (error) {
    console.error("Error checking item scan status:", error);
    return { scanned: false, total_qty: 0, locations: [] };
  }
};

const resolveCountLineItemName = async (countData: CreateCountLinePayload): Promise<string> => {
  if (hasMeaningfulCountLineName(countData)) {
    return countData.item_name!.trim();
  }

  try {
    const cachedItem = await getItemFromCache(countData.item_code);
    if (cachedItem) {
      return cachedItem.item_name;
    }
  } catch {
    // Ignore cache lookup error
  }

  return "Unknown Item";
};

const createOfflineCountLineResult = async (
  countData: CreateCountLinePayload,
  username?: string,
  degraded: boolean = false
): Promise<any & { _source: DataSource; _offline: boolean; _degraded?: boolean }> => {
  const itemName = await resolveCountLineItemName(countData);
  const offlineCountLine = (await createOfflineCountLine(countData, {
    username,
    itemName,
  })) as any;

  return {
    ...offlineCountLine,
    _source: "local" as DataSource,
    _offline: true,
    ...(degraded ? { _degraded: true } : {}),
  };
};

const ensureCountLineIdempotencyKey = (
  countData: CreateCountLinePayload
): CreateCountLinePayload => ({
  ...countData,
  idempotency_key: countData.idempotency_key?.trim() || generateUUID(),
});

const filterCountLinesByVerified = <T extends { verified?: boolean }>(
  lines: T[],
  verified?: boolean
): T[] => (verified !== undefined ? lines.filter((line) => line.verified === verified) : lines);

const paginateCountLineItems = (
  items: any[],
  requestedPage: number,
  requestedPageSize: number,
  source: DataSource = "cache",
  stale: boolean = false
): CountLineListResponse => {
  const total = items.length;
  const totalPages = Math.ceil(total / requestedPageSize);
  const startIndex = (requestedPage - 1) * requestedPageSize;
  const endIndex = startIndex + requestedPageSize;
  return {
    items: items.slice(startIndex, endIndex),
    pagination: {
      page: requestedPage,
      page_size: requestedPageSize,
      total,
      total_pages: totalPages,
      has_next: requestedPage < totalPages,
      has_prev: requestedPage > 1,
    },
    _source: source,
    _stale: stale,
  };
};

const buildOfflinePaginatedCountLines = async (
  sessionId: string,
  page: number,
  pageSize: number,
  source: DataSource,
  stale: boolean,
  verified?: boolean
) => {
  const cachedLines = await getCountLinesBySessionFromCache(sessionId);
  const filteredLines = filterCountLinesByVerified(cachedLines, verified);
  const paginated = paginateCountLineItems(filteredLines, page, pageSize, source, stale);

  return {
    ...paginated,
    items: await hydrateCountLineNames(paginated.items),
  };
};

/**
 * Persists a draft count line when the device is online.
 */
export const saveDraft = async (lineData: CreateCountLinePayload) => {
  try {
    if (!isOnline()) return null;
    const response = await api.post("/api/count-lines/draft", lineData);
    return response.data;
  } catch (error: any) {
    log.warn("Failed to save draft", {
      error: error?.message || String(error),
    });
    return null;
  }
};

const hasMeaningfulCountLineName = (line: {
  item_name?: string;
  item_code?: string;
  barcode?: string;
}) => {
  const name = typeof line.item_name === "string" ? line.item_name.trim() : "";
  if (!name) return false;

  const lowered = name.toLowerCase();
  if (lowered === "unknown item" || lowered === "n/a") {
    return false;
  }

  if (line.item_code && name === line.item_code) {
    return false;
  }

  if (line.barcode && name === line.barcode) {
    return false;
  }

  return true;
};

const hydrateCountLineNames = async <
  T extends {
    item_code?: string;
    item_name?: string;
    barcode?: string;
  },
>(
  lines: T[]
): Promise<T[]> =>
  Promise.all(
    lines.map(async (line) => {
      if (hasMeaningfulCountLineName(line) || !line.item_code) {
        return line;
      }

      try {
        const cachedItem = await getItemFromCache(line.item_code);
        if (cachedItem?.item_name?.trim()) {
          return {
            ...line,
            item_name: cachedItem.item_name.trim(),
          };
        }
      } catch {
        // Ignore cache lookup error and keep original line
      }

      return line;
    })
  );

/**
 * Creates a count line against the API and degrades to offline persistence when needed.
 */
export const createCountLine = async (
  countData: CreateCountLinePayload
): Promise<any & { _source?: DataSource; _offline?: boolean }> => {
  validateCountLinePayload(countData);
  const user = useAuthStore.getState().user;
  const countDataWithIdempotency = ensureCountLineIdempotencyKey(countData);

  try {
    const isOfflineSession = String(countDataWithIdempotency.session_id || "").startsWith(
      "offline_"
    );

    if (!isOnline() || isOfflineSession) {
      log.debug("Offline mode or offline session - creating offline count line", {
        isOnline: isOnline(),
        isOfflineSession,
      });
      // Must carry the idempotency key: the control-plane command path POSTs this
      // payload verbatim once connectivity returns, and without a key the server's
      // idempotent-replay guard cannot match a resubmission to the original line.
      return await submitCountLineCommand(countDataWithIdempotency);
    }

    log.debug("Online mode - creating count line via API");
    const response = await api.post("/api/count-lines", countDataWithIdempotency, {
      skipOfflineQueue: true,
    } as any);
    await cacheCountLine(response.data);

    log.debug("Created count line via API", {
      id: response.data._id || response.data.id,
    });
    return {
      ...response.data,
      _source: "api" as DataSource,
    };
  } catch (error: any) {
    if (error.response) {
      log.error("Server returned error, NOT falling back to offline", {
        status: error.response.status,
        data: error.response.data,
      });
      throw error;
    }

    log.error("Network error creating count line, falling back to offline", {
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      const offlineCountLine = await createOfflineCountLineResult(
        countDataWithIdempotency,
        user?.username,
        true
      );
      log.debug("Created offline count line as fallback", { id: offlineCountLine._id });
      return offlineCountLine;
    } catch (fallbackError) {
      log.error("Offline fallback also failed", {
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      throw new Error("Failed to save count line. Both online and offline storage failed.");
    }
  }
};

/**
 * Loads paginated count lines for a session with cache-aware offline behavior.
 */
export const getCountLines = async (
  sessionId: string,
  page: number = 1,
  pageSize: number = 50,
  verified?: boolean
): Promise<CountLineListResponse> => {
  try {
    if (!shouldAttemptReadApi()) {
      log.debug("Offline mode - returning cached count lines with pagination");
      return buildOfflinePaginatedCountLines(sessionId, page, pageSize, "cache", true, verified);
    }

    let url = `/api/count-lines/session/${sessionId}?page=${page}&page_size=${pageSize}`;
    if (verified !== undefined) {
      url += `&verified=${verified}`;
    }

    log.debug("Fetching count lines from API", { sessionId, page, pageSize });
    const response = await api.get(url);

    const countLinesToCache =
      response.data?.items && Array.isArray(response.data.items)
        ? response.data.items
        : Array.isArray(response.data)
          ? response.data
          : [];
    const hydratedLines = await hydrateCountLineNames(countLinesToCache);
    const reviewedLines = await overlayCountLineReviewState(hydratedLines);

    return {
      ...response.data,
      items: reviewedLines,
      _source: "api" as DataSource,
    };
  } catch (error: any) {
    log.warn("Count lines API unavailable; falling back to cache", {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      ...(await buildOfflinePaginatedCountLines(
        sessionId,
        page,
        pageSize,
        "cache",
        true,
        verified
      )),
      _degraded: true,
    };
  }
};

/**
 * Loads a single count line by identifier.
 */
export const getCountLineById = async (lineId: string) => {
  const response = await api.get(`/api/count-lines/${encodeURIComponent(lineId)}`);
  return response.data;
};

/**
 * Minimal assignable-user shape used by session assignment flows.
 */
export interface AssignableStaffUser {
  username: string;
  full_name?: string | null;
}

/**
 * Fetches the assignable staff list for workflow delegation.
 */
export const getAssignableStaffUsers = async (): Promise<AssignableStaffUser[]> => {
  const response = await api.get<AssignableStaffUser[]>("/api/users/assignable/staff");
  return Array.isArray(response.data) ? response.data : [];
};

/**
 * Checks whether an item already has count lines in the given session.
 */
export const checkItemCounted = async (sessionId: string, itemCode: string) => {
  try {
    if (!shouldAttemptReadApi()) {
      const cachedLines = await getCountLinesBySessionFromCache(sessionId);
      const itemLines = cachedLines.filter((line) => line.item_code === itemCode);
      return { already_counted: itemLines.length > 0, count_lines: itemLines };
    }

    const response = await api.get(`/api/count-lines/check/${sessionId}/${itemCode}`);
    return response.data;
  } catch (error) {
    __DEV__ && console.error("Error checking item counted:", error);

    const cachedLines = await getCountLinesBySessionFromCache(sessionId);
    const itemLines = cachedLines.filter((line) => line.item_code === itemCode);
    return { already_counted: itemLines.length > 0, count_lines: itemLines };
  }
};

/**
 * Fetches canonical SQL variance data for a session.
 *
 * Returns the canonical model from SqlVarianceEngine:
 *   audit_delta, operational_delta, movement_adjusted_expected,
 *   sql_qty_at_submission, variance_by_item.
 *
 * Non-canonical reconciliation fields (erp_drift, final_gap, count_variance)
 * are NOT consumed — see the ESLint authority-boundary guard and
 * plans/UI_UX_PROPOSAL_AUDIT.md Correction 1.
 */
export interface SessionSqlVarianceDTO {
  success?: boolean;
  data?: {
    session_id?: string;
    total_physical?: number | null;
    total_sql_at_submission?: number | null;
    audit_delta?: number | null;
    movement_adjusted_expected?: number | null;
    operational_delta?: number | null;
    variance_by_item?: Record<string, unknown>[];
    computed_at?: string;
  };
}

export const getSessionSqlVariance = async (
  sessionId: string
): Promise<SessionSqlVarianceDTO | null> => {
  try {
    if (!shouldAttemptReadApi()) {
      return null;
    }

    const response = await api.get(`/api/variance/session/${sessionId}/sql`);
    return response.data;
  } catch (error) {
    __DEV__ && console.error("Error fetching session SQL variance:", error);
    return null;
  }
};

/**
 * Adds quantity to an existing count line, optionally with batch data.
 */
export const addQuantityToCountLine = async (
  lineId: string,
  additionalQty: number,
  batches?: any[]
) => {
  try {
    const payload: any = { additional_qty: additionalQty };
    if (batches) {
      payload.batches = batches;
    }

    const response = await api.patch(`/api/count-lines/${lineId}/add-quantity`, payload);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Error adding quantity to count line:", error);
    throw error;
  }
};

/**
 * Returns the configured list of variance reasons for count review flows.
 */
export const getVarianceReasons = async () => {
  const response = await api.get("/api/variance-reasons");
  if (response.data && response.data.reasons && Array.isArray(response.data.reasons)) {
    return response.data.reasons.map((r: Record<string, unknown>) => ({
      ...r,
      code: r.id || r.code,
      label: r.label || r.name,
    }));
  }
  return response.data;
};

/**
 * Approves a count line through the supervisor review endpoint.
 */
export const approveCountLine = async (lineId: string) => {
  return approveCountLineCommand(lineId, undefined);
};

/**
 * Rejects a count line with optional notes or reassignment details.
 */
export const rejectCountLine = async (
  lineId: string,
  payload?: { notes?: string; assign_to?: string }
) => {
  return rejectCountLineCommand(lineId, payload);
};

/**
 * Applies a session status transition using the appropriate backend endpoint.
 */
export const updateSessionStatus = async (sessionId: string, status: string) => {
  const normalizedStatus = (status || "").toUpperCase();
  if (normalizedStatus === "COMPLETED" || normalizedStatus === "FINALIZED") {
    const response = await api.post(`/api/sessions/${sessionId}/finalize`);
    return response.data;
  }

  if (normalizedStatus === "CLOSED") {
    // Legacy "close" now maps to the canonical review handoff.
    const response = await api.put(`/api/sessions/${sessionId}/status?status=RECONCILE`);
    return response.data;
  }

  // All other status transitions go through the generic PUT /status endpoint
  // which validates against the SessionStateMachine
  const response = await api.put(
    `/api/sessions/${sessionId}/status?status=${encodeURIComponent(normalizedStatus)}`
  );
  return response.data;
};

/**
 * Finalizes a session through the supervisor-only finalize workflow.
 */
export const finalizeSession = async (
  sessionId: string,
  payload?: { note?: string; assessment_token?: string }
) => {
  try {
    const response = await api.post(`/api/sessions/${sessionId}/finalize`, payload || {});
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Finalize session error:", error);
    throw error;
  }
};

export interface FinalizationBlockerDTO {
  code: string;
  canonical_code?: string | null;
  description: string;
  severity?: string;
  entity_id?: string | null;
  action?: string | null;
}

export interface FinalizationAssessmentDTO {
  allowed: boolean;
  blockers: FinalizationBlockerDTO[];
  assessment_id: string;
  assessed_at: string;
}

export const getFinalizationAssessment = async (
  sessionId: string
): Promise<FinalizationAssessmentDTO> => {
  const response = await api.get(`/api/sessions/${sessionId}/finalize-assessment`);
  return response.data;
};

/**
 * Queues or creates an unknown item depending on network availability.
 */
export const createUnknownItem = async (itemData: Record<string, unknown>) => {
  try {
    if (!isOnline()) {
      await addToOfflineQueue("unknown_item", itemData);
      return { success: true, offline: true };
    }

    const response = await api.post("/api/unknown-items", itemData, {
      skipOfflineQueue: true,
    } as any);
    return response.data;
  } catch (error) {
    __DEV__ && console.error("Error creating unknown item:", error);
    await addToOfflineQueue("unknown_item", itemData);
    return { success: true, offline: true };
  }
};

/**
 * Requests a fresh ERP stock sync for a specific item code.
 */
export const refreshItemStock = async (itemCode: string) => {
  try {
    const response = await api.post(
      `/api/erp/items/${encodeURIComponent(itemCode)}/refresh-stock`,
      {},
      { timeout: 30000 }
    );
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Refresh stock error:", error);
    throw error;
  }
};

/**
 * Deletes a count line by identifier.
 */
export const deleteCountLine = async (lineId: string) => {
  try {
    const response = await api.delete(`/api/count-lines/${lineId}`);
    return response.data;
  } catch (error: any) {
    __DEV__ && console.error("Delete count line error:", error);
    throw error;
  }
};

/**
 * Marks a count line as verified.
 */
export const verifyStock = async (countLineId: string) => {
  return verifyStockCommand(countLineId);
};

/**
 * Removes the verified flag from a count line.
 */
export const unverifyStock = async (countLineId: string) => {
  return unverifyStockCommand(countLineId);
};
