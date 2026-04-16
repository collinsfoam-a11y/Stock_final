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
import { generateOfflineId } from "../../utils/uuid";

const log = createLogger("SessionManagementApi");

export interface CreateSessionParams {
  warehouse?: string;
  type?: string;
  location_type?: string;
  location_name?: string;
  rack_no?: string;
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

export const createSession = async (params: string | CreateSessionParams) => {
  const warehouse = typeof params === "string" ? params : params.warehouse;
  const sessionType = typeof params !== "string" ? params.type : undefined;
  const locationType = typeof params !== "string" ? params.location_type : undefined;
  const locationName = typeof params !== "string" ? params.location_name : undefined;
  const rackNo = typeof params !== "string" ? params.rack_no : undefined;

  const networkStatus = getNetworkStatus();

  log.debug("Create session requested", {
    warehouse,
    type: sessionType,
    networkStatus: networkStatus.status,
  });

  const createOfflineSession = () => ({
    id: generateOfflineId(),
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
  });

  try {
    if (!isOnline()) {
      log.info("Creating offline session", { warehouse, type: sessionType });
      const offlineSession = createOfflineSession();
      await cacheSession(offlineSession);
      await addToOfflineQueue("session", offlineSession);
      log.debug("Created offline session", {
        id: offlineSession.id,
        source: offlineSession._source,
      });
      return offlineSession;
    }

    const payload = {
      warehouse,
      location_type: locationType,
      location_name: locationName,
      rack_no: rackNo,
      ...(sessionType && { type: sessionType }),
    };

    const response = await api.post("/api/sessions", payload, {
      timeout: 3000,
      skipOfflineQueue: true,
    } as any);
    await cacheSession(response.data);
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

    const offlineSession = createOfflineSession();
    await cacheSession(offlineSession);
    await addToOfflineQueue("session", offlineSession);
    log.debug("Created offline session after API error", {
      id: offlineSession.id,
      source: offlineSession._source,
    });
    return offlineSession;
  }
};

export const getSessions = async (page: number = 1, pageSize: number = 20) => {
  try {
    if (!isOnline()) {
      const cache = await getSessionsCache();
      const allSessions = Object.values(cache);
      const skip = (page - 1) * pageSize;
      const paginatedSessions = allSessions.slice(skip, skip + pageSize);

      return {
        items: paginatedSessions,
        pagination: {
          page,
          page_size: pageSize,
          total: allSessions.length,
          total_pages: Math.ceil(allSessions.length / pageSize),
          has_next: skip + pageSize < allSessions.length,
          has_prev: page > 1,
        },
      };
    }

    const validPage = Math.max(1, Math.floor(Number(page)) || 1);
    const validPageSize = Math.max(1, Math.min(100, Math.floor(Number(pageSize)) || 20));

    const response = await api.get("/api/sessions", {
      params: {
        page: validPage,
        page_size: validPageSize,
      },
    });

    const responseData = response.data?.data ?? response.data;
    const sessions = Array.isArray(responseData?.items)
      ? responseData.items
      : Array.isArray(responseData)
        ? responseData
        : [];
    const pagination = responseData?.pagination ||
      response.data?.pagination || {
        page,
        page_size: pageSize,
        total: sessions.length,
        total_pages: 1,
        has_next: false,
        has_prev: false,
      };

    if (Array.isArray(sessions) && sessions.length > 0) {
      await cacheSessions(sessions);
    }

    let mergedSessions = sessions;
    try {
      const cache = await getSessionsCache();
      const cachedSessions = Object.values(cache);
      const user = useAuthStore.getState().user;
      const isSupervisor = user?.role === "supervisor";
      const visibleCached = isSupervisor
        ? cachedSessions
        : cachedSessions.filter((session) => session.staff_user === user?.username);

      if (visibleCached.length > 0) {
        const seenIds = new Set(
          sessions
            .map((session: any) => session?.id || session?.session_id || session?._id)
            .filter(Boolean)
        );
        const missingCached = visibleCached.filter((session) => !seenIds.has(session.id));
        if (missingCached.length > 0) {
          mergedSessions = [...sessions, ...missingCached];
        }
      }
    } catch (cacheError) {
      __DEV__ && console.warn("Unable to merge cached sessions:", cacheError);
    }

    return {
      items: mergedSessions,
      pagination,
    };
  } catch (error: any) {
    if (error?.response?.status !== 401) {
      __DEV__ && console.error("Error getting sessions:", error);
    }

    const cache = await getSessionsCache();
    const allSessions = Object.values(cache);
    const skip = (page - 1) * pageSize;
    const paginatedSessions = allSessions.slice(skip, skip + pageSize);

    return {
      items: paginatedSessions,
      pagination: {
        page,
        page_size: pageSize,
        total: allSessions.length,
        total_pages: Math.ceil(allSessions.length / pageSize),
        has_next: skip + pageSize < allSessions.length,
        has_prev: page > 1,
      },
    };
  }
};

export const getSession = async (sessionId: string) => {
  try {
    if (!isOnline()) {
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

export const getSessionStats = async (sessionId: string): Promise<SessionStatsResponse | null> => {
  try {
    if (!isOnline()) {
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
    if (!isOnline()) {
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

export const bulkCloseSessions = async (sessionIds: string[]) => {
  try {
    const response = await api.post("/api/sessions/bulk/close", sessionIds, {
      skipOfflineQueue: true,
    } as any);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Bulk close sessions error:", error);
    throw error;
  }
};

export const bulkReconcileSessions = async (sessionIds: string[]) => {
  try {
    const response = await api.post("/api/sessions/bulk/reconcile", sessionIds, {
      skipOfflineQueue: true,
    } as any);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Bulk reconcile sessions error:", error);
    throw error;
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
