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

export const useWebSocket = (sessionId?: string, enabled: boolean = true) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const shouldReconnectRef = useRef(true);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

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

    // Convert http:// to ws:// or https:// to wss://
    const wsUrl = API_BASE_URL.replace(/^http/, "ws") + "/ws/updates";
    // session_id is not sensitive — safe to keep in the query string.
    const query = new URLSearchParams();
    if (sessionId) {
      query.set("session_id", sessionId);
    }
    const urlWithParams = query.toString() ? `${wsUrl}?${query.toString()}` : wsUrl;

    log.debug("Connecting websocket", {
      url: wsUrl,
      sessionId: sessionId ?? null,
    });

    // Auth via Sec-WebSocket-Protocol subprotocol. The browser/RN runtime joins
    // the array entries with ", " into the Sec-WebSocket-Protocol header, which
    // the server parses as ["jwt", "<token>"] (see backend
    // websocket_api.py:_extract_jwt_from_websocket + _parse_subprotocols).
    // This keeps the bearer token out of the URL, where it would otherwise be
    // logged by proxies/nginx/browser history.
    const protocols = token ? ["jwt", token] : undefined;
    const socket = new WebSocket(urlWithParams, protocols);

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
  }, [enabled, isAuthenticated, sessionId]);

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
