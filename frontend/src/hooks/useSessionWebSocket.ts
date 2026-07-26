import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { API_BASE_URL } from "../services/httpClient";
import { useAuthStore } from "../store/authStore";
import { secureStorage } from "../services/storage/secureStorage";
import { handleUnauthorized } from "../services/authUnauthorizedHandler";
import { createLogger } from "../services/logging";

const log = createLogger("useSessionWebSocket");

interface WebSocketMetrics {
  socketsCreated: number;
  socketsClosed: number;
  reconnects: number;
  reconnectTimeMs: number;
  messagesReceived: number;
  duplicateMessagesDropped: number;
  subscriberNotifications: number;
}

const metrics: WebSocketMetrics = {
  socketsCreated: 0,
  socketsClosed: 0,
  reconnects: 0,
  reconnectTimeMs: 0,
  messagesReceived: 0,
  duplicateMessagesDropped: 0,
  subscriberNotifications: 0,
};

const logMetrics = () => {
  log.debug("WebSocket Metrics", metrics);
};

export type WebSocketMessage = {
  type: string;
  [key: string]: unknown;
};

const isWebSocketMessage = (value: unknown): value is WebSocketMessage => {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as Record<string, unknown>).type === "string"
  );
};

type EventType = string;
type MessageCallback = (message: WebSocketMessage) => void;
type Unsubscribe = () => void;

interface SessionSocketState {
  socket: WebSocket | null;
  subscribers: Map<EventType, Set<MessageCallback>>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  shouldReconnect: boolean;
  reconnectAttempt: number;
  connectingPromise: Promise<void> | null;
  lastMessageIds: Map<string, number>;
}

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

const sessionStates = new Map<string, SessionSocketState>();
const connectionListeners = new Map<string, Set<(connected: boolean) => void>>();

function getConnectionListeners(sessionId: string): Set<(connected: boolean) => void> {
  let listeners = connectionListeners.get(sessionId);
  if (!listeners) {
    listeners = new Set();
    connectionListeners.set(sessionId, listeners);
  }
  return listeners;
}

function notifyConnectionChange(sessionId: string, connected: boolean) {
  const listeners = connectionListeners.get(sessionId);
  if (listeners) {
    listeners.forEach((callback) => {
      try {
        callback(connected);
      } catch {
        // ignore listener errors
      }
    });
  }
}

function getSessionState(sessionId: string): SessionSocketState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      socket: null,
      subscribers: new Map(),
      reconnectTimer: null,
      shouldReconnect: true,
      reconnectAttempt: 0,
      connectingPromise: null,
      lastMessageIds: new Map(),
    };
    sessionStates.set(sessionId, state);
    metrics.socketsCreated++;
    logMetrics();
  }
  return state;
}

function clearReconnectTimer(state: SessionSocketState) {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

function countSubscribers(state: SessionSocketState): number {
  let count = 0;
  state.subscribers.forEach((set) => {
    count += set.size;
  });
  return count;
}

function addSubscriber(
  state: SessionSocketState,
  eventType: EventType,
  callback: MessageCallback,
): Unsubscribe {
  if (!state.subscribers.has(eventType)) {
    state.subscribers.set(eventType, new Set());
  }
  state.subscribers.get(eventType)!.add(callback);

  return () => {
    const typeCallbacks = state.subscribers.get(eventType);
    if (typeCallbacks) {
      typeCallbacks.delete(callback);
      if (typeCallbacks.size === 0) {
        state.subscribers.delete(eventType);
      }
    }
  };
}

function notifySubscribers(state: SessionSocketState, message: WebSocketMessage) {
  const dedupeKey: string = (message.event_id as string | undefined) || `${message.type}:${JSON.stringify(message)}`;
  const typeCallbacks = state.subscribers.get(message.type);
  const wildcardCallbacks = state.subscribers.get("*");

  if (!typeCallbacks && !wildcardCallbacks) {
    return;
  }

  // Track duplicates
  if (state.lastMessageIds.has(dedupeKey)) {
    metrics.duplicateMessagesDropped++;
    return;
  }
  state.lastMessageIds.set(dedupeKey, Date.now());

  // Clean up old entries
  if (state.lastMessageIds.size > 1000) {
    const now = Date.now();
    for (const [key, timestamp] of state.lastMessageIds.entries()) {
      if (now - timestamp > 60000) {
        state.lastMessageIds.delete(key);
      }
    }
  }

  metrics.messagesReceived++;

  if (typeCallbacks) {
    typeCallbacks.forEach((callback) => {
      try {
        callback(message);
        metrics.subscriberNotifications++;
      } catch {
        // ignore subscriber errors
      }
    });
  }

  if (wildcardCallbacks) {
    wildcardCallbacks.forEach((callback) => {
      try {
        callback(message);
        metrics.subscriberNotifications++;
      } catch {
        // ignore subscriber errors
      }
    });
  }

  logMetrics();
}

function closeSocket(state: SessionSocketState, reason: string) {
  const socket = state.socket;
  if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
    try {
      socket.close(1000, reason);
      metrics.socketsClosed++;
      logMetrics();
    } catch {
      // ignore close errors
    }
  }
  state.socket = null;
  state.connectingPromise = null;
  clearReconnectTimer(state);
}

async function ensureSocket(state: SessionSocketState, sessionId: string) {
  const startTime = Date.now();
  if (
    state.socket?.readyState === WebSocket.OPEN ||
    state.socket?.readyState === WebSocket.CONNECTING ||
    state.connectingPromise
  ) {
    return state.connectingPromise;
  }

  clearReconnectTimer(state);

  const promise = (async () => {
    const token = await secureStorage.getItem("auth_token");
    if (!token && Platform.OS !== "web") {
      state.shouldReconnect = false;
      if (useAuthStore.getState().isAuthenticated) {
        handleUnauthorized();
      }
      return;
    }

    const wsUrl =
      API_BASE_URL.replace(/^http:/, "ws:").replace(/^https:/, "wss:") +
      "/ws/updates";
    const query = new URLSearchParams();
    if (sessionId) {
      query.set("session_id", sessionId);
    }
    const url = query.toString() ? `${wsUrl}?${query.toString()}` : wsUrl;
    const protocols = token ? ["jwt", token] : undefined;

    const socket = new WebSocket(url, protocols);
    state.socket = socket;

    log.debug("Connecting websocket", {
      url: wsUrl,
      sessionId: sessionId ?? null,
    });

    socket.onopen = () => {
      const reconnectTime = Date.now() - startTime;
      metrics.reconnectTimeMs = reconnectTime;
      log.debug("WebSocket reconnect time", { reconnectTime });
      if (state.socket !== socket) return;
      state.reconnectAttempt = 0;
      clearReconnectTimer(state);
      notifyConnectionChange(sessionId, true);
      log.info("Websocket connected", { sessionId: sessionId ?? null });
    };

    socket.onmessage = (event) => {
      if (state.socket !== socket) return;
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (!isWebSocketMessage(parsed)) {
          log.warn("Invalid websocket message", { sessionId: sessionId ?? null });
          return;
        }
        notifySubscribers(state, parsed);
      } catch (error) {
        log.error("Failed to parse websocket message", {
          error: String(error),
          sessionId: sessionId ?? null,
        });
      }
    };

    socket.onerror = (error) => {
      log.warn("Websocket transport error", {
        error: String(error),
        sessionId: sessionId ?? null,
      });
    };

    socket.onclose = (event) => {
      if (state.socket === socket) {
        state.socket = null;
        state.connectingPromise = null;
      }
      clearReconnectTimer(state);
      log.info("Websocket disconnected", {
        code: event.code,
        reason: event.reason || null,
        sessionId: sessionId ?? null,
      });

      if (event.code === 1008) {
        state.shouldReconnect = false;
        if (useAuthStore.getState().isAuthenticated) {
          handleUnauthorized();
        }
        return;
      }

      if (!state.shouldReconnect || countSubscribers(state) === 0) {
        return;
      }

      const attempt = state.reconnectAttempt++;
      const baseDelay = Math.min(
        INITIAL_RECONNECT_DELAY_MS * 2 ** attempt,
        MAX_RECONNECT_DELAY_MS,
      );
      const delayMs = baseDelay + Math.floor(Math.random() * 1_000);

      log.warn("Retrying websocket connection", {
        delayMs,
        attempt: attempt + 1,
        sessionId: sessionId ?? null,
      });

      state.reconnectTimer = setTimeout(() => {
        void ensureSocket(state, sessionId);
        metrics.reconnects++;
        logMetrics();
      }, delayMs);
    };
  })();

  state.connectingPromise = promise;
  return promise;
}

export function useSessionWebSocket(sessionId?: string) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setIsConnected(false);
      return;
    }

    const state = getSessionState(sessionId);

    const listeners = getConnectionListeners(sessionId);
    const listener = (connected: boolean) => {
      setIsConnected(connected);
    };
    listeners.add(listener);

    const unsubscribe = addSubscriber(state, "*", () => {
      // wildcard subscriber marker - actual delivery goes to typed subscribers
    });

    void ensureSocket(state, sessionId);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        connectionListeners.delete(sessionId);
      }
      unsubscribe();
      if (countSubscribers(state) === 0) {
        closeSocket(state, "No more subscribers");
      }
    };
  }, [sessionId]);

  const subscribe = useCallback(
    (eventType: EventType, callback: MessageCallback): Unsubscribe => {
      if (!sessionId) {
        log.debug("No sessionId, skipping subscription", { eventType });
        return () => {};
      }

      log.debug("Subscribing to event", { eventType, sessionId });
      const state = getSessionState(sessionId);
      const unsubscribe = addSubscriber(state, eventType, callback);

      void ensureSocket(state, sessionId);

      return () => {
        log.debug("Unsubscribing from event", { eventType, sessionId });
        unsubscribe();
        if (countSubscribers(state) === 0) {
          closeSocket(state, "No more subscribers");
        }
      };
    },
    [sessionId],
  );

  return { isConnected, subscribe };
}
