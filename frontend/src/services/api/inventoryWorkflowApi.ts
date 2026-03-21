import { useAuthStore } from "../../store/authStore";
import { AppError } from "../../utils/errors";
import { retryWithBackoff } from "../../utils/retry";
import { CreateCountLinePayload, Item } from "../../types/scan";
import { validateBarcode } from "../../utils/validation";
import api from "../httpClient";
import { createLogger } from "../logging";
import { createOfflineCountLine } from "../offline/offlineCountLine";
import {
  addToOfflineQueue,
  cacheCountLine,
  cacheCountLines,
  cacheItem,
  getCountLinesBySessionFromCache,
  getItemFromCache,
  isCacheStale,
  searchItemsInCache,
  type DataSource,
} from "../offline/offlineStorage";
import { isOnline } from "./sessionManagementApi";

const log = createLogger("InventoryWorkflowApi");

export const getItemByBarcode = async (
  barcode: string,
  retryCount: number = 3,
  sessionId?: string,
  rackNo?: string
): Promise<Item & { _source?: DataSource; _cachedAt?: string; _stale?: boolean }> => {
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

  const trimmedBarcode = validation.value;

  log.debug(`Looking up barcode: ${trimmedBarcode}`, { original: barcode });

  const returnCachedItem = (
    cached: any
  ): Item & { _source: DataSource; _cachedAt: string; _stale: boolean } => {
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

  if (!isOnline()) {
    log.debug("Offline mode - searching cache");
    const items = await searchItemsInCache(trimmedBarcode);
    if (items.length > 0 && items[0]) {
      log.debug("Found in cache", { itemCode: items[0].item_code });
      return returnCachedItem(items[0]);
    }
    throw new AppError({
      code: "ITEM_CACHE_MISS",
      severity: "USER",
      message: `Item not found in offline cache: ${trimmedBarcode}`,
      userMessage: "Item not found in offline cache. Connect to internet to search.",
      context: { barcode: trimmedBarcode },
    });
  }

  try {
    log.debug("Online mode - calling API");

    const response = await retryWithBackoff(
      () =>
        api.get(`/api/v2/erp/items/barcode/${encodeURIComponent(trimmedBarcode)}/enhanced`, {
          params: {
            session_id: sessionId,
            rack_no: rackNo,
          },
        }),
      {
        retries: retryCount,
        backoffMs: 1000,
        shouldRetry: (error: any) => {
          const status = error?.response?.status;
          if (status && status >= 400 && status < 500) {
            return false;
          }
          return true;
        },
      }
    );

    const itemData = response.data.item || response.data;

    if (!itemData || !itemData.item_code) {
      throw new AppError({
        code: "ITEM_NOT_FOUND",
        severity: "USER",
        message: `Item not found: Barcode '${trimmedBarcode}' not in database`,
        userMessage: `No item found for barcode ${trimmedBarcode}`,
        context: { barcode: trimmedBarcode },
      });
    }

    const displayName = itemData.item_name || itemData.category || `Item ${itemData.item_code}`;
    const stockQty = itemData.stock_qty ?? itemData.current_stock ?? 0;

    let dataSource: DataSource = "api";
    if (response.data.metadata?.source === "sql_server_sync") {
      dataSource = "sql";
    } else if (response.data.metadata?.source === "cache") {
      dataSource = "cache";
    }

    const normalizedItem: Item & { _source: DataSource } = {
      id: itemData.id || itemData._id || itemData.item_code,
      name: itemData.name || displayName,
      item_code: itemData.item_code,
      barcode: itemData.barcode,
      item_name: itemData.item_name || displayName,
      uom_name: itemData.uom_name ?? itemData.uom ?? itemData.uom_code,
      uom: itemData.uom_name ?? itemData.uom ?? itemData.uom_code,
      sales_price: itemData.sales_price ?? itemData.sale_price ?? itemData.standard_rate,
      sale_price: itemData.sale_price ?? itemData.sales_price,
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
      manufacturing_date: itemData.manufacturing_date || itemData.mfg_date,
      expiry_date: itemData.expiry_date,
      mrp_variants: itemData.mrp_variants,
      is_serialized: itemData.is_serialized ?? false,
      is_misplaced: itemData.is_misplaced,
      expected_location: itemData.expected_location,
      _source: dataSource,
    };

    log.debug("Found via API", { itemCode: normalizedItem.item_code });

    try {
      await cacheItem({
        item_code: normalizedItem.item_code,
        barcode: normalizedItem.barcode,
        item_name:
          normalizedItem.item_name || normalizedItem.name || normalizedItem.item_code || "",
        description: (normalizedItem as any).description,
        uom: normalizedItem.uom ?? normalizedItem.uom_code ?? normalizedItem.uom_name,
        uom_name: normalizedItem.uom_name,
        mrp: normalizedItem.mrp,
        sales_price: normalizedItem.sales_price,
        sale_price: normalizedItem.sale_price ?? normalizedItem.sales_price,
        category: normalizedItem.category,
        subcategory: normalizedItem.subcategory,
        warehouse: normalizedItem.warehouse,
        manual_barcode: normalizedItem.manual_barcode,
        unit2_barcode: normalizedItem.unit2_barcode,
        unit_m_barcode: normalizedItem.unit_m_barcode,
        batch_id: normalizedItem.batch_id,
        current_stock: normalizedItem.current_stock || normalizedItem.stock_qty,
        is_serialized: normalizedItem.is_serialized,
      });
    } catch (cacheError) {
      log.warn("Failed to cache item", {
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }

    return normalizedItem;
  } catch (apiError: any) {
    const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
    const isNotFound = apiError?.response?.status === 404 || errorMessage.includes("404");

    if (isNotFound) {
      log.info("Item not found via API", { barcode: trimmedBarcode });
    } else {
      log.error("API call failed", { error: errorMessage });
    }

    log.debug("API failed, trying cache fallback");
    try {
      const items = await searchItemsInCache(trimmedBarcode);
      if (items.length > 0 && items[0]) {
        log.debug("Found in cache fallback", { itemCode: items[0].item_code });
        return {
          ...returnCachedItem(items[0]),
          _source: "cache" as DataSource,
          _degraded: true,
        } as any;
      }
      throw new AppError({
        code: "ITEM_NOT_FOUND",
        severity: "USER",
        message: "Item not found in cache",
        userMessage: `Barcode ${trimmedBarcode} not found. Please try again when online.`,
        context: { barcode: trimmedBarcode },
      });
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
  }
};

export const checkSerialUniqueness = async (
  sessionId: string,
  serialNumber: string
): Promise<{
  exists: boolean;
  item_code?: string;
  item_name?: string;
  counted_by?: string;
  floor_no?: string;
  rack_no?: string;
  status?: string;
  }> => {
  try {
    const response = await api.get(
      `/api/count-lines/check-serial/${sessionId}/${serialNumber}`,
    );
    return response.data;
  } catch (error) {
    console.error("Error checking serial uniqueness:", error);
    return { exists: false };
  }
};

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
      items: cachedItems.map((item) => ({
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
      })),
      total: cachedItems.length,
      hasMore: false,
    };
  }
};

export const searchItemsOptimized = async (
  query: string,
  page: number = 1,
  pageSize: number = 10,
  cursor?: string
): Promise<OptimizedSearchResult> => {
  try {
    if (!isOnline()) {
      const cachedItems = await searchItemsInCache(query);
      const mappedItems = cachedItems.map((item) => ({
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
        _source: "cache" as DataSource,
      }));
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

    for (const item of mappedItems.slice(0, 10)) {
      await cacheItem(item as any);
    }

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

export const getSearchSuggestions = async (query: string, limit: number = 5): Promise<string[]> => {
  try {
    if (!isOnline() || query.length < 2) {
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

export const getSearchFilters = async (): Promise<{
  categories: string[];
  warehouses: string[];
}> => {
  try {
    if (!isOnline()) {
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

export const searchItemsSemantic = async (query: string, limit: number = 20): Promise<Item[]> => {
  try {
    if (!isOnline()) {
      return [];
    }

    const response = await api.get("/api/v2/items/semantic", {
      params: { query, limit },
    });

    const items = response.data.data?.items || [];
    return items.map((item: any) => ({
      ...item,
      id: item.id || item._id,
      name: item.name || item.item_name,
    }));
  } catch (error) {
    __DEV__ && console.error("Error in semantic search:", error);
    return [];
  }
};

export const getRiskPredictions = async (sessionId: string, limit: number = 10) => {
  try {
    if (!isOnline()) return [];

    const response = await api.get("/api/v2/supervisor/predictions", {
      params: { session_id: sessionId, limit },
    });

    return response.data.data || [];
  } catch (error) {
    __DEV__ && console.error("Error fetching risk predictions:", error);
    return [];
  }
};

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

export const checkItemScanStatus = async (
  sessionId: string,
  itemCode: string
): Promise<ItemScanStatus> => {
  try {
    if (!isOnline()) {
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

export const createCountLine = async (
  countData: CreateCountLinePayload
): Promise<any & { _source?: DataSource; _offline?: boolean }> => {
  const resolveItemName = async (): Promise<string> => {
    if (countData.item_name?.trim()) {
      return countData.item_name.trim();
    }

    try {
      const cachedItem = await getItemFromCache(countData.item_code);
      if (cachedItem) return cachedItem.item_name;
    } catch {
      // Ignore cache lookup error
    }
    return "Unknown Item";
  };

  const user = useAuthStore.getState().user;

  try {
    const isOfflineSession = String(countData.session_id || "").startsWith("offline_");

    if (!isOnline() || isOfflineSession) {
      log.debug("Offline mode or offline session - creating offline count line", {
        isOnline: isOnline(),
        isOfflineSession,
      });

      const itemName = await resolveItemName();
      const offlineCountLine = (await createOfflineCountLine(countData, {
        username: user?.username,
        itemName,
      })) as any;

      log.debug("Created offline count line", { id: offlineCountLine._id });
      return {
        ...offlineCountLine,
        _source: "local" as DataSource,
        _offline: true,
      };
    }

    log.debug("Online mode - creating count line via API");
    const response = await api.post("/api/count-lines", countData, {
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

    const itemName = await resolveItemName();
    const offlineCountLine = (await createOfflineCountLine(countData, {
      username: user?.username,
      itemName,
    })) as any;

    log.debug("Created offline count line as fallback", {
      id: offlineCountLine._id,
    });
    return {
      ...offlineCountLine,
      _source: "local" as DataSource,
      _offline: true,
      _degraded: true,
    } as any;
  }
};

export const getCountLines = async (
  sessionId: string,
  page: number = 1,
  pageSize: number = 50,
  verified?: boolean
): Promise<{
  items: any[];
  pagination: any;
  _source?: DataSource;
  _stale?: boolean;
  _degraded?: boolean;
}> => {
  const paginateItems = (
    items: any[],
    requestedPage: number,
    requestedPageSize: number,
    source: DataSource = "cache",
    stale: boolean = false
  ) => {
    const total = items.length;
    const totalPages = Math.ceil(total / requestedPageSize);
    const startIndex = (requestedPage - 1) * requestedPageSize;
    const endIndex = startIndex + requestedPageSize;
    const pageItems = items.slice(startIndex, endIndex);

    return {
      items: pageItems,
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

  try {
    if (!isOnline()) {
      log.debug("Offline mode - returning cached count lines with pagination");

      const cachedLines = await getCountLinesBySessionFromCache(sessionId);
      const filteredLines =
        verified !== undefined
          ? cachedLines.filter((line) => line.verified === verified)
          : cachedLines;
      const hydratedLines = await hydrateCountLineNames(filteredLines);

      return paginateItems(hydratedLines, page, pageSize, "cache", true);
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
    if (hydratedLines.length > 0) {
      await cacheCountLines(hydratedLines);
    }

    return {
      ...response.data,
      items: hydratedLines,
      _source: "api" as DataSource,
    };
  } catch (error: any) {
    log.error("Error getting count lines, falling back to cache", {
      error: error instanceof Error ? error.message : String(error),
    });

    const cachedLines = await getCountLinesBySessionFromCache(sessionId);
    const filteredLines =
      verified !== undefined
        ? cachedLines.filter((line) => line.verified === verified)
        : cachedLines;
    const hydratedLines = await hydrateCountLineNames(filteredLines);

    return {
      ...paginateItems(hydratedLines, page, pageSize, "cache", true),
      _degraded: true,
    };
  }
};

export const getCountLineById = async (lineId: string) => {
  const response = await api.get(`/api/count-lines/${encodeURIComponent(lineId)}`);
  return response.data;
};

export interface AssignableStaffUser {
  username: string;
  full_name?: string | null;
}

export const getAssignableStaffUsers = async (): Promise<AssignableStaffUser[]> => {
  const response = await api.get<AssignableStaffUser[]>("/api/users/assignable/staff");
  return Array.isArray(response.data) ? response.data : [];
};

export const checkItemCounted = async (sessionId: string, itemCode: string) => {
  try {
    if (!isOnline()) {
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

export const approveCountLine = async (lineId: string) => {
  const response = await api.put(`/api/count-lines/${lineId}/approve`);
  return response.data;
};

export const rejectCountLine = async (
  lineId: string,
  payload?: { notes?: string; assign_to?: string }
) => {
  const response = await api.put(`/api/count-lines/${lineId}/reject`, payload || {});
  return response.data;
};

export const updateSessionStatus = async (sessionId: string, status: string) => {
  const normalizedStatus = (status || "").toUpperCase();
  if (normalizedStatus === "CLOSED" || normalizedStatus === "COMPLETED") {
    const endpoint =
      normalizedStatus === "COMPLETED"
        ? `/api/sessions/${sessionId}/finalize`
        : `/api/sessions/${sessionId}/complete`;
    const response = await api.post(endpoint);
    return response.data;
  }

  const response = await api.put(
    `/api/sessions/${sessionId}/status?status=${encodeURIComponent(normalizedStatus)}`
  );
  return response.data;
};

export const finalizeSession = async (
  sessionId: string,
  payload?: { note?: string }
) => {
  try {
    const response = await api.post(`/api/sessions/${sessionId}/finalize`, payload || {});
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Finalize session error:", error);
    throw error;
  }
};

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

export const deleteCountLine = async (lineId: string) => {
  try {
    const response = await api.delete(`/api/count-lines/${lineId}`);
    return response.data;
  } catch (error: any) {
    __DEV__ && console.error("Delete count line error:", error);
    throw error;
  }
};

export const verifyStock = async (countLineId: string) => {
  try {
    const response = await api.put(`/api/count-lines/${countLineId}/verify`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Verify stock error:", error);
    throw error;
  }
};

export const unverifyStock = async (countLineId: string) => {
  try {
    const response = await api.put(`/api/count-lines/${countLineId}/unverify`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Unverify stock error:", error);
    throw error;
  }
};
