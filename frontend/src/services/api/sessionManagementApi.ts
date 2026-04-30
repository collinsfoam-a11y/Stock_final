import { useAuthStore } from "../../store/authStore";
import api from "../httpClient";
import {
  addToOfflineQueue,
  cacheSession,
  cacheSessions,
  getCountLinesBySessionFromCache,
  getSessionFromCache,
  getSessionsCache,
  removeSessionFromCache,
  type DataSource,
} from "../offline/offlineStorage";
import { getNetworkStatus } from "../../utils/network";
import { createLogger } from "../logging";
import { generateUUID } from "../../utils/uuid";
import type { Session } from "../../types";

const log = createLogger("SessionManagementApi");

export interface CreateSessionParams {
  warehouse?: string;
  type?: string;
  location_type?: string;
  location_name?: string;
  rack_no?: string;
  client_session_id?: string;
  offline_id?: string;
}

export interface SessionStatsResponse {
  id: string;
  totalItems: number;
  scannedItems: number;
  verifiedItems: number;
  pendingItems: number;
  damageItems?: number;
  durationSeconds?: number;
  itemsPerMinute?: number;
}

type SessionCreateConfig = {
  warehouse?: string;
  sessionType?: string;
  locationType?: string;
  locationName?: string;
  rackNo?: string;
  clientSessionId?: string;
  offlineId?: string;
};

type SessionPage = {
  items: Session[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
};

const CLIENT_SESSION_ID_STORAGE_KEY = "client_session_id";
let memoryClientSessionId: string | null = null;

const getSessionIdentityStorage = () => {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return null;
  }
  return globalThis.localStorage;
};

const generateClientSessionId = () => {
  const runtimeCrypto = globalThis.crypto as Crypto | undefined;
  if (typeof runtimeCrypto?.randomUUID === "function") {
    return runtimeCrypto.randomUUID();
  }
  return generateUUID();
};

export const ensureSessionIdentity = (requestedId?: string): string => {
  const explicitId = requestedId?.trim();
  const storage = getSessionIdentityStorage();

  if (explicitId) {
    storage?.setItem(CLIENT_SESSION_ID_STORAGE_KEY, explicitId);
    memoryClientSessionId = explicitId;
    return explicitId;
  }

  const storedId = storage?.getItem(CLIENT_SESSION_ID_STORAGE_KEY)?.trim();
  if (storedId) {
    memoryClientSessionId = storedId;
    return storedId;
  }

  if (memoryClientSessionId) {
    return memoryClientSessionId;
  }

  const generatedId = generateClientSessionId();
  storage?.setItem(CLIENT_SESSION_ID_STORAGE_KEY, generatedId);
  memoryClientSessionId = generatedId;
  return generatedId;
};

const clearSessionIdentity = () => {
  const storage = getSessionIdentityStorage();
  storage?.removeItem(CLIENT_SESSION_ID_STORAGE_KEY);
  memoryClientSessionId = null;
};

const normalizeCreateSessionParams = (
  params: string | CreateSessionParams
): SessionCreateConfig => ({
  warehouse: typeof params === "string" ? params : params.warehouse,
  sessionType: typeof params !== "string" ? params.type : undefined,
  locationType: typeof params !== "string" ? params.location_type : undefined,
  locationName: typeof params !== "string" ? params.location_name : undefined,
  rackNo: typeof params !== "string" ? params.rack_no : undefined,
  clientSessionId: typeof params !== "string" ? params.client_session_id : undefined,
  offlineId: typeof params !== "string" ? params.offline_id : undefined,
});

const ensureSessionCreateIdentity = (config: SessionCreateConfig): SessionCreateConfig => {
  const clientSessionId = ensureSessionIdentity(config.clientSessionId || config.offlineId);
  return {
    ...config,
    clientSessionId,
    offlineId: config.offlineId || clientSessionId,
  };
};

const buildOfflineSession = ({
  warehouse,
  sessionType,
  locationType,
  locationName,
  rackNo,
  clientSessionId,
  offlineId,
}: SessionCreateConfig) => {
  const generatedId = clientSessionId || offlineId || generateUUID();
  return {
    id: generatedId,
    client_session_id: generatedId,
    offline_id: generatedId,
    warehouse,
    location_type: locationType,
    location_name: locationName,
    rack_no: rackNo,
    status: "OPEN",
    type: sessionType || "STANDARD",
    staff_user: "offline_user",
    staff_name: "Offline User",
    started_at: new Date().toISOString(),
    total_items: 0,
    total_variance: 0,
    _source: "offline" as DataSource,
    _createdOffline: true,
  };
};

const persistOfflineSession = async (offlineSession: ReturnType<typeof buildOfflineSession>) => {
  await cacheSession(offlineSession);
  await addToOfflineQueue("session", offlineSession);
  return offlineSession;
};

const buildSessionCreatePayload = ({
  warehouse,
  sessionType,
  locationType,
  locationName,
  rackNo,
  clientSessionId,
  offlineId,
}: SessionCreateConfig) => ({
  warehouse,
  location_type: locationType,
  location_name: locationName,
  rack_no: rackNo,
  ...(sessionType && { type: sessionType }),
  ...(clientSessionId && { client_session_id: clientSessionId }),
  ...(offlineId && { offline_id: offlineId }),
});

const paginateSessions = (sessions: Session[], page: number, pageSize: number): SessionPage => {
  const skip = (page - 1) * pageSize;
  return {
    items: sessions.slice(skip, skip + pageSize),
    pagination: {
      page,
      page_size: pageSize,
      total: sessions.length,
      total_pages: Math.ceil(sessions.length / pageSize),
      has_next: skip + pageSize < sessions.length,
      has_prev: page > 1,
    },
  };
};

const getOfflinePaginatedSessions = async (
  page: number,
  pageSize: number
): Promise<SessionPage> => {
  const cache = await getSessionsCache();
  return paginateSessions(Object.values(cache) as Session[], page, pageSize);
};

const normalizeSessionsResponse = (
  responseData: any,
  page: number,
  pageSize: number
): SessionPage => {
  const sessions = Array.isArray(responseData?.items)
    ? (responseData.items as Session[])
    : Array.isArray(responseData)
      ? (responseData as Session[])
      : [];
  return {
    items: sessions,
    pagination: responseData?.pagination || {
      page,
      page_size: pageSize,
      total: sessions.length,
      total_pages: 1,
      has_next: false,
      has_prev: false,
    },
  };
};

const mergeSessionsWithVisibleCache = async (sessions: Session[]): Promise<Session[]> => {
  const cache = await getSessionsCache();
  const cachedSessions = Object.values(cache) as Session[];
  const user = useAuthStore.getState().user;
  const isSupervisor = user?.role === "supervisor";
  const visibleCached = isSupervisor
    ? cachedSessions
    : cachedSessions.filter((session) => session.staff_user === user?.username);

  if (visibleCached.length === 0) {
    return sessions;
  }

  const seenIds = new Set(
    sessions.map((session) => session?.id || session?.session_id || session?._id).filter(Boolean)
  );
  const missingCached = visibleCached.filter((session) => !seenIds.has(session.id));
  return missingCached.length > 0 ? [...sessions, ...missingCached] : sessions;
};

/**
 * Returns whether the app should treat the network as safe for mutations.
 */
export const isOnline = () => {
  const { status, isOnline: rawOnline, isInternetReachable, connectionType } = getNetworkStatus();

  log.debug("Network Status Check", {
    status,
    isOnline: rawOnline,
    isInternetReachable,
    connectionType,
  });

  // M14 fix: Treat UNKNOWN as offline for write safety.
  // This prevents failed mutations on captive portals or flaky WiFi.
  return status === "ONLINE";
};

/**
 * Returns whether reads should attempt the API before falling back to cache.
 */
export const shouldAttemptReadApi = () => {
  const networkStatus = getNetworkStatus() as ReturnType<typeof getNetworkStatus> & {
    shouldAttemptApi?: boolean;
  };
  return networkStatus.shouldAttemptApi ?? networkStatus.status !== "OFFLINE";
};

/**
 * Creates a session online when possible and falls back to an offline placeholder otherwise.
 */
export const createSession = async (params: string | CreateSessionParams) => {
  const config = ensureSessionCreateIdentity(normalizeCreateSessionParams(params));
  const networkStatus = getNetworkStatus();

  log.debug("Create session requested", {
    warehouse: config.warehouse,
    type: config.sessionType,
    networkStatus: networkStatus.status,
  });

  try {
    if (!isOnline()) {
      log.info("Creating offline session", {
        warehouse: config.warehouse,
        type: config.sessionType,
      });
      const offlineSession = await persistOfflineSession(buildOfflineSession(config));
      log.debug("Created offline session", {
        id: offlineSession.id,
        source: offlineSession._source,
      });
      return offlineSession;
    }

    const pendingSession = buildOfflineSession(config);
    await cacheSession({ ...pendingSession, status: "PENDING_SYNC" });

    const response = await api.post("/api/sessions", buildSessionCreatePayload(config), {
      timeout: 3000,
      skipOfflineQueue: true,
    } as any);
    if (pendingSession.id && pendingSession.id !== response.data?.id) {
      await removeSessionFromCache(pendingSession.id);
    }
    await cacheSession(response.data);
    clearSessionIdentity();
    log.debug("Created session via API", {
      id: response.data?.id,
      status: response.data?.status,
    });
    return response.data;
  } catch (error: unknown) {
    const axiosError = error as {
      response?: { status?: number; data?: { detail?: string } };
    };

    if (axiosError?.response?.status === 400) {
      const errorMessage = axiosError.response.data?.detail || "Session creation failed";
      log.warn("Session creation rejected by server", { error: errorMessage });
      throw new Error(errorMessage);
    }

    log.warn("Error creating session, switching to offline mode", {
      error: error instanceof Error ? error.message : String(error),
    });

    const offlineSession = await persistOfflineSession(buildOfflineSession(config));
    log.debug("Created offline session after API error", {
      id: offlineSession.id,
      source: offlineSession._source,
    });
    return offlineSession;
  }
};

/**
 * Fetches paginated sessions with cache merge and offline fallback support.
 */
export const getSessions = async (page: number = 1, pageSize: number = 20) => {
  const validPage = Math.max(1, Math.floor(Number(page)) || 1);
  const validPageSize = Math.max(1, Math.min(100, Math.floor(Number(pageSize)) || 20));

  try {
    if (!shouldAttemptReadApi()) {
      return await getOfflinePaginatedSessions(validPage, validPageSize);
    }

    const response = await api.get("/api/sessions", {
      params: {
        page: validPage,
        page_size: validPageSize,
      },
    });

    const normalizedResponse = normalizeSessionsResponse(
      response.data?.data ?? response.data,
      validPage,
      validPageSize
    );

    if (normalizedResponse.items.length > 0) {
      await cacheSessions(normalizedResponse.items);
    }

    let mergedSessions = normalizedResponse.items;
    try {
      mergedSessions = await mergeSessionsWithVisibleCache(normalizedResponse.items);
    } catch (cacheError) {
      __DEV__ && console.warn("Unable to merge cached sessions:", cacheError);
    }

    return {
      items: mergedSessions,
      pagination: normalizedResponse.pagination,
    };
  } catch (error: any) {
    if (error?.response?.status !== 401) {
      __DEV__ && console.error("Error getting sessions:", error);
    }

    return await getOfflinePaginatedSessions(validPage, validPageSize);
  }
};

/**
 * Returns a single session from the API or offline cache.
 */
export const getSession = async (sessionId: string) => {
  try {
    if (!shouldAttemptReadApi()) {
      return await getSessionFromCache(sessionId);
    }

    if (sessionId.startsWith("offline_")) {
      return await getSessionFromCache(sessionId);
    }

    const response = await api.get(`/api/sessions/${sessionId}`);
    await cacheSession(response.data);
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404 && !sessionId.startsWith("offline_")) {
      log.warn(`Session ${sessionId} not found on server, removing from cache`);
      await removeSessionFromCache(sessionId);
      return null;
    }

    if (error?.response?.status !== 401) {
      log.warn("Error getting session:", error);
    }

    return await getSessionFromCache(sessionId);
  }
};

/**
 * Loads normalized session statistics for dashboards and active workflows.
 */
export const getSessionStats = async (sessionId: string): Promise<SessionStatsResponse | null> => {
  try {
    if (!shouldAttemptReadApi()) {
      log.debug("Offline - cannot fetch session stats from API");
      return null;
    }

    if (sessionId.startsWith("offline_")) {
      return null;
    }

    const response = await api.get(`/api/sessions/${sessionId}/stats`);
    const data = response.data;

    return {
      id: data.id,
      totalItems: data.total_items ?? 0,
      scannedItems: (data.verified_items ?? 0) + (data.pending_items ?? 0),
      verifiedItems: data.verified_items ?? 0,
      pendingItems: data.pending_items ?? 0,
      damageItems: data.damage_items ?? 0,
      durationSeconds: data.duration_seconds ?? 0,
      itemsPerMinute: data.items_per_minute ?? 0,
    };
  } catch (error: any) {
    if (error?.response?.status === 404) {
      if (!sessionId.startsWith("offline_")) {
        log.warn(`Session ${sessionId} not found on server, removing from cache`);
        await removeSessionFromCache(sessionId);
      }
    } else {
      log.warn("Error fetching session stats:", error);
    }
    return null;
  }
};

export const getRackProgress = async (sessionId: string) => {
  try {
    if (!shouldAttemptReadApi()) {
      const cachedLines = await getCountLinesBySessionFromCache(sessionId);

      if (cachedLines.length === 0) {
        return {
          data: [],
          message: "Offline mode - no cached count data available for this session",
          offline: true,
        };
      }

      const rackStats: Record<
        string,
        {
          counted: number;
          uniqueItems: Set<string>;
          totalQuantity: number;
          lastUpdated: string;
          hasDiscrepancies: boolean;
        }
      > = {};

      for (const line of cachedLines) {
        const rack = line.rack_no || line.rack || line.rack_id || "Unknown";
        let stats = rackStats[rack];

        if (!stats) {
          stats = {
            counted: 0,
            uniqueItems: new Set(),
            totalQuantity: 0,
            lastUpdated: line.counted_at || new Date().toISOString(),
            hasDiscrepancies: false,
          };
          rackStats[rack] = stats;
        }

        if (!stats.uniqueItems.has(line.item_code)) {
          stats.uniqueItems.add(line.item_code);
          stats.counted++;
        }

        stats.totalQuantity += line.counted_qty || 1;

        if (line.variance && Math.abs(line.variance) > 0) {
          stats.hasDiscrepancies = true;
        }

        const lineTime = line.counted_at;
        if (lineTime && lineTime > stats.lastUpdated) {
          stats.lastUpdated = lineTime;
        }
      }

      const rackProgress = Object.entries(rackStats)
        .filter(([rack]) => rack !== "Unknown")
        .map(([rack, stats]) => ({
          rack,
          total: null,
          counted: stats.counted,
          counted_quantity: stats.totalQuantity,
          percentage: null,
          offline: true,
          last_updated: stats.lastUpdated,
          has_discrepancies: stats.hasDiscrepancies,
          status: stats.hasDiscrepancies ? "discrepancies" : "counting",
          estimated_completion: null,
        }))
        .sort((a, b) => a.rack.localeCompare(b.rack));

      const totalItems = rackProgress.reduce((sum, rack) => sum + rack.counted, 0);
      const totalQuantity = rackProgress.reduce((sum, rack) => sum + rack.counted_quantity, 0);
      const racksWithDiscrepancies = rackProgress.filter((rack) => rack.has_discrepancies).length;

      return {
        data: rackProgress,
        message: `Offline mode - ${rackProgress.length} racks with ${totalItems} counted items (${totalQuantity} total quantity)${racksWithDiscrepancies > 0 ? `, ${racksWithDiscrepancies} racks with discrepancies` : ""}`,
        offline: true,
        summary: {
          total_racks: rackProgress.length,
          total_counted_items: totalItems,
          total_counted_quantity: totalQuantity,
          racks_with_discrepancies: racksWithDiscrepancies,
          last_sync: new Date().toISOString(),
        },
      };
    }

    const response = await api.get(`/api/v2/sessions/${sessionId}/rack-progress`);
    return response.data;
  } catch (error) {
    __DEV__ && console.error("Error getting rack progress:", error);
    return { data: [] };
  }
};

export const bulkExportSessions = async (sessionIds: string[], format: string = "excel") => {
  try {
    const response = await api.post("/api/sessions/bulk/export", sessionIds, {
      params: { format },
    });
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Bulk export sessions error:", error);
    throw error;
  }
};

export const getSessionsAnalytics = async () => {
  try {
    const response = await api.get("/api/sessions/analytics");
    return response.data;
  } catch (error: unknown) {
    log.error("Get sessions analytics error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
