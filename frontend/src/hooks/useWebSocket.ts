import { useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import { API_BASE_URL } from "../services/httpClient";
import { useAuthStore } from "../store/authStore";
import { secureStorage } from "../services/storage/secureStorage";
import { handleUnauthorized } from "../services/authUnauthorizedHandler";
import { createLogger } from "../services/logging";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

const log = createLogger("useWebSocket");
const WS_CLIENT_ID_KEY = "websocket_client_id";
const WS_CURSOR_KEY_PREFIX = "websocket_replay_cursor";

const createClientId = () =>
  `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

const cursorStorageKey = (sessionId?: string) =>
  `${WS_CURSOR_KEY_PREFIX}:${sessionId || "global"}`;

const extractReplaySequence = (message: WebSocketMessage): number | null => {
  const replay = message.replay;
  const rawSequence =
    replay && typeof replay === "object"
      ? replay.ws_sequence
      : message.ws_sequence;
  const parsed =
    typeof rawSequence === "number" ? rawSequence : Number.parseInt(String(rawSequence), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const extractReplayEventId = (message: WebSocketMessage): string | null => {
  const replay = message.replay;
  if (!replay || typeof replay !== "object") return null;
  const replayEventId = replay.replay_event_id;
  return typeof replayEventId === "string" && replayEventId.trim()
    ? replayEventId.trim()
    : null;
};

export const useWebSocket = (sessionId?: string, enabled: boolean = true) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const shouldReconnectRef = useRef(true);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const getClientId = useCallback(async () => {
    const existing = await secureStorage.getItem(WS_CLIENT_ID_KEY);
    if (existing) return existing;
    const created = createClientId();
    await secureStorage.setItem(WS_CLIENT_ID_KEY, created);
    return created;
  }, []);

  const acknowledgeReplay = useCallback(
    async (message: WebSocketMessage, clientId: string) => {
      const wsSequence = extractReplaySequence(message);
      if (!wsSequence) return;

      await secureStorage.setItem(cursorStorageKey(sessionId), String(wsSequence));

      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;

      socket.send(
        JSON.stringify({
          type: "websocket_replay_ack",
          client_id: clientId,
          ws_sequence: wsSequence,
          replay_event_id: extractReplayEventId(message),
        }),
      );
    },
    [sessionId],
  );

  const connect = useCallback(async () => {
    if (!enabled || !isAuthenticated || !shouldReconnectRef.current) return;

    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const token = await secureStorage.getItem("auth_token");
    if (!token && Platform.OS !== "web") {
      setIsConnected(false);
      if (isAuthenticated) {
        handleUnauthorized();
      }
      return;
    }

    const clientId = await getClientId();
    const durableCursor = await secureStorage.getItem(cursorStorageKey(sessionId));

    // Convert http:// to ws:// or https:// to wss://
    const wsUrl = API_BASE_URL.replace(/^http/, "ws") + "/ws/updates";
    const query = new URLSearchParams();
    if (token) {
      query.set("token", token);
    }
    if (sessionId) {
      query.set("session_id", sessionId);
    }
    query.set("ws_client_id", clientId);
    if (durableCursor) {
      query.set("last_ws_sequence", durableCursor);
    }
    const urlWithParams = query.toString() ? `${wsUrl}?${query.toString()}` : wsUrl;

    log.debug("Connecting websocket", {
      url: wsUrl,
      sessionId: sessionId ?? null,
    });

    // Use query param auth instead of subprotocols (server doesn't support subprotocol handshake)
    const socket = new WebSocket(urlWithParams);

    socket.onopen = () => {
      log.info("Websocket connected", { sessionId: sessionId ?? null });
      setIsConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setLastMessage(message);
        void acknowledgeReplay(message, clientId).catch((error) => {
          log.warn("Failed to acknowledge websocket replay message", {
            error: String(error),
            sessionId: sessionId ?? null,
          });
        });
      } catch (error) {
        log.error("Failed to parse websocket message", {
          error: String(error),
          sessionId: sessionId ?? null,
        });
      }
    };

    socket.onclose = (event) => {
      log.info("Websocket disconnected", {
        code: event.code,
        reason: event.reason || null,
        sessionId: sessionId ?? null,
      });
      setIsConnected(false);
      socketRef.current = null;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Policy violation / auth failure: stop reconnecting and force auth cleanup.
      if (event.code === 1008) {
        shouldReconnectRef.current = false;
        if (isAuthenticated) {
          handleUnauthorized();
        }
        return;
      }

      if (event.code === 1000) {
        return;
      }

      // Reconnect logic
      if (shouldReconnectRef.current && isAuthenticated) {
        log.warn("Retrying websocket connection", {
          delayMs: 5000,
          sessionId: sessionId ?? null,
        });
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      }
    };

    socket.onerror = (error) => {
      log.error("Websocket transport error", {
        error: String(error),
        sessionId: sessionId ?? null,
      });
    };

    socketRef.current = socket;
  }, [acknowledgeReplay, enabled, getClientId, isAuthenticated, sessionId]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    if (!enabled) {
      setIsConnected(false);
      setLastMessage(null);
      return () => {
        shouldReconnectRef.current = false;
      };
    }

    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (socketRef.current) {
        socketRef.current.close(1000, "Component unmounted");
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect, enabled]);

  const sendMessage = (message: WebSocketMessage) => {
    if (socketRef.current && isConnected) {
      socketRef.current.send(JSON.stringify(message));
    }
  };

  return { isConnected, lastMessage, sendMessage };
};
