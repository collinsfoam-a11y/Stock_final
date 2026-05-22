import { useAuthStore } from "../../store/authStore";
import api from "../httpClient";
import {
  cacheSession,
  cacheSessions,
  getCountLinesBySessionFromCache,
  getSessionFromCache,
  getSessionsCache,
  removeSessionFromCache,
} from "../offline/offlineStorage";
import { getNetworkStatus } from "../../utils/network";
import { createLogger } from "../logging";
import type { Session } from "../../types";
import {
  ProjectionReadError,
  getProjectedSessionStatsRead,
} from "../control-plane/countLineControlPlane";
import {
  createSessionCommand,
  finalizeSessionCommand,
  getProjectedSessionRead,
  getProjectedSessionsRead,
  updateSessionStatusCommand,
} from "../control-plane/sessionControlPlane";
import { isLocalDbUnavailableError } from "@/db/localDbErrors";

const log = createLogger("SessionManagementApi");

interface ApiErrorLike {
  response?: { status?: number; data?: unknown };
  message?: string;
}

type CachedSession = Session & { _local_session_id?: string };
type ProjectedSessionWithSync = Session & { _sync_status?: string };

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

type SessionCreateConfig = {
  warehouse?: string;
  sessionType?: string;
  locationType?: string;
  locationName?: string;
  rackNo?: string;
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

const normalizeCreateSessionParams = (
  params: string | CreateSessionParams
): SessionCreateConfig => ({
  warehouse: typeof params === "string" ? params : params.warehouse,
  sessionType: typeof params !== "string" ? params.type : undefined,
  locationType: typeof params !== "string" ? params.location_type : undefined,
  locationName: typeof params !== "string" ? params.location_name : undefined,
  rackNo: typeof params !== "string" ? params.rack_no : undefined,
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

const readProjectedSessions = async (): Promise<Session[]> => {
  try {
    return ((await getProjectedSessionsRead()) || []) as Session[];
  } catch (error) {
    const details = {
      error: error instanceof Error ? error.message : String(error),
    };
    if (isLocalDbUnavailableError(error)) {
      log.debug("Unable to read projected sessions", details);
    } else {
      log.warn("Unable to read projected sessions", details);
    }
    return [];
  }
};

const readProjectedSession = async (sessionId: string): Promise<Session | null> => {
  try {
    return ((await getProjectedSessionRead(sessionId)) || null) as Session | null;
  } catch (error) {
    const details = {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    };
    if (isLocalDbUnavailableError(error)) {
      log.debug("Unable to read projected session", details);
    } else {
      log.warn("Unable to read projected session", details);
    }
    return null;
  }
};

const readProjectedSessionStats = async (
  sessionId: string
): Promise<{
  scannedItems: number;
  pendingItems: number;
  verifiedItems: number;
  lastCountedAt: string | null;
} | null> => {
  try {
    return await getProjectedSessionStatsRead(sessionId);
  } catch (error) {
    if (error instanceof ProjectionReadError) {
      throw error;
    }
    const details = {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    };
    if (isLocalDbUnavailableError(error)) {
      log.debug("Unable to read projected session stats", details);
    } else {
      log.warn("Unable to read projected session stats", details);
    }
    return null;
  }
};

const getOfflinePaginatedSessions = async (
  page: number,
  pageSize: number
): Promise<SessionPage> => {
  const projectedSessions = await readProjectedSessions();
  if (projectedSessions.length > 0) {
    return paginateSessions(projectedSessions, page, pageSize);
  }

  try {
    const cache = await getSessionsCache();
    return paginateSessions(Object.values(cache) as Session[], page, pageSize);
  } catch (error) {
    log.warn("Unable to read cached sessions", {
      error: error instanceof Error ? error.message : String(error),
    });
    return paginateSessions([], page, pageSize);
  }
};

const normalizeSessionsResponse = (
  responseData: { items?: Session[]; pagination?: SessionPage["pagination"] } | Session[],
  page: number,
  pageSize: number
): SessionPage => {
  const sessions = Array.isArray(responseData)
    ? responseData
    : Array.isArray((responseData as { items?: Session[] }).items)
      ? (responseData as { items: Session[] }).items
      : [];
  const pagination = Array.isArray(responseData) ? undefined : responseData?.pagination;
  return {
    items: sessions,
    pagination: pagination || {
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
    sessions
      .flatMap((session) => [
        session?.id,
        session?.session_id,
        session?._id,
        (session as CachedSession)?._local_session_id,
      ])
      .filter(Boolean)
  );
  const missingCached = visibleCached.filter(
    (session) =>
      !seenIds.has(session.id) &&
      !seenIds.has(session.session_id) &&
      !seenIds.has((session as CachedSession)._local_session_id)
  );
  return missingCached.length > 0 ? [...sessions, ...missingCached] : sessions;
};

const mergeProjectedSessions = async (sessions: Session[]): Promise<Session[]> => {
  const projectedSessions = await readProjectedSessions();
  if (projectedSessions.length === 0) {
    return sessions;
  }

  const merged = new Map<string, Session>();
  for (const session of sessions) {
    const key = String(session?.id || session?.session_id || session?._id);
    if (key) {
      merged.set(key, session);
    }
  }

  for (const projectedSession of projectedSessions) {
    const displayId = String(projectedSession.id);
    const existing = merged.get(displayId);
    if (!existing) {
      merged.set(displayId, projectedSession as Session);
      continue;
    }

    if (
      (projectedSession as ProjectedSessionWithSync)._sync_status &&
      (projectedSession as ProjectedSessionWithSync)._sync_status !== "synced"
    ) {
      merged.set(displayId, {
        ...existing,
        ...projectedSession,
      } as Session);
    }
  }

  return Array.from(merged.values());
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
  const config = normalizeCreateSessionParams(params);
  const networkStatus = getNetworkStatus();

  log.debug("Create session requested", {
    warehouse: config.warehouse,
    type: config.sessionType,
    networkStatus: networkStatus.status,
  });

  try {
    const result = await createSessionCommand({
      warehouse: config.warehouse,
      type: config.sessionType,
      location_type: config.locationType,
      location_name: config.locationName,
      rack_no: config.rackNo,
    });
    await cacheSession(result);
    return result;
  } catch (error: unknown) {
    const axiosError = error as {
      response?: { status?: number; data?: { detail?: string } };
    };

    if (axiosError?.response?.status === 400) {
      const errorMessage = axiosError.response.data?.detail || "Session creation failed";
      log.warn("Session creation rejected by server", { error: errorMessage });
      throw new Error(errorMessage);
    }
    throw error;
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

    let mergedSessions = await mergeProjectedSessions(normalizedResponse.items);
    try {
      mergedSessions = await mergeSessionsWithVisibleCache(mergedSessions);
    } catch (cacheError) {
      __DEV__ && console.warn("Unable to merge cached sessions:", cacheError);
    }

    return {
      items: mergedSessions,
      pagination: normalizedResponse.pagination,
    };
  } catch (error: unknown) {
    if ((error as ApiErrorLike)?.response?.status !== 401) {
      __DEV__ && console.error("Error getting sessions:", error);
    }

    return await getOfflinePaginatedSessions(validPage, validPageSize);
  }
};

/**
 * Returns a single session from the API or offline cache.
 */
export const getSession = async (sessionId: string) => {
  const projectedSession = await readProjectedSession(sessionId);

  try {
    if (!shouldAttemptReadApi()) {
      return projectedSession || (await getSessionFromCache(sessionId));
    }

    if (sessionId.startsWith("offline_")) {
      return projectedSession || (await getSessionFromCache(sessionId));
    }

    const response = await api.get(`/api/sessions/${sessionId}`);
    await cacheSession(response.data);
    return projectedSession
      ? {
          ...response.data,
          ...projectedSession,
        }
      : response.data;
  } catch (error: unknown) {
    const apiError = error as ApiErrorLike;
    if (apiError?.response?.status === 404 && !sessionId.startsWith("offline_")) {
      log.warn(`Session ${sessionId} not found on server, removing from cache`);
      await removeSessionFromCache(sessionId);
      return projectedSession;
    }

    if (apiError?.response?.status !== 401) {
      log.warn("Error getting session:", error);
    }

    return projectedSession || (await getSessionFromCache(sessionId));
  }
};

/**
 * Loads normalized session statistics for dashboards and active workflows.
 */
export const getSessionStats = async (sessionId: string): Promise<SessionStatsResponse | null> => {
  const projectedStats = await readProjectedSessionStats(sessionId);

  try {
    if (projectedStats && !shouldAttemptReadApi()) {
      return {
        id: sessionId,
        totalItems: 0,
        scannedItems: projectedStats.scannedItems,
        verifiedItems: projectedStats.verifiedItems,
        pendingItems: projectedStats.pendingItems,
      };
    }

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
      scannedItems: Math.max(
        (data.verified_items ?? 0) + (data.pending_items ?? 0),
        projectedStats?.scannedItems ?? 0
      ),
      verifiedItems: Math.max(data.verified_items ?? 0, projectedStats?.verifiedItems ?? 0),
      pendingItems: Math.max(data.pending_items ?? 0, projectedStats?.pendingItems ?? 0),
      damageItems: data.damage_items ?? 0,
      durationSeconds: data.duration_seconds ?? 0,
      itemsPerMinute: data.items_per_minute ?? 0,
    };
  } catch (error: unknown) {
    if ((error as ApiErrorLike)?.response?.status === 404) {
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
      const { resolveProjectionSessionIds } =
        await import("../../data/repositories/sessionControlPlaneRepository");
      const cachedLines = await getCountLinesBySessionFromCache(
        await resolveProjectionSessionIds(sessionId)
      );

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

export const updateSessionStatus = async (sessionId: string, status: string, note?: string) =>
  updateSessionStatusCommand(sessionId, status, note);

export const finalizeSession = async (sessionId: string, payload?: { note?: string }) =>
  finalizeSessionCommand(sessionId, payload);
