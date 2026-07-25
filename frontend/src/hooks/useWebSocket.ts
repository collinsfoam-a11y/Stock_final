import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { API_BASE_URL } from "../services/httpClient";
import { useAuthStore } from "../store/authStore";
import { secureStorage } from "../services/storage/secureStorage";
import { handleUnauthorized } from "../services/authUnauthorizedHandler";
import { createLogger } from "../services/logging";

interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

const log = createLogger("useWebSocket");
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

const isWebSocketMessage = (
  value: unknown,
): value is WebSocketMessage => {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
};

export const useWebSocket = (
  sessionId?: string,
  enabled = true,
  onMessage?: (message: WebSocketMessage) => void,
) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] =
    useState<WebSocketMessage | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated,
  );
  const isAuthenticatedRef = useRef(isAuthenticated);
  
  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);
  
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);
  
  const connect = useCallback(async () => {
    if (
      !enabled ||
      !isAuthenticatedRef.current ||
      !shouldReconnectRef.current
    ) {
      return;
    }
    
    const existingSocket = socketRef.current;
    if (
      existingSocket?.readyState === WebSocket.OPEN ||
      existingSocket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    
    try {
      const token = await secureStorage.getItem("auth_token");
      if (!token && Platform.OS !== "web") {
        setIsConnected(false);
        shouldReconnectRef.current = false;
        if (isAuthenticatedRef.current) {
          handleUnauthorized();
        }
        return;
      }
      
      const wsUrl =
        API_BASE_URL.replace(/^http:/, "ws:").replace(
          /^https:/,
          "wss:",
        ) + "/ws/updates";
        
      const query = new URLSearchParams();
      if (sessionId) {
        query.set("session_id", sessionId);
      }
      const url = query.toString()
        ? `${wsUrl}?${query.toString()}`
        : wsUrl;
        
      const protocols = token ? ["jwt", token] : undefined;
      const socket = new WebSocket(url, protocols);
      socketRef.current = socket;
      
      log.debug("Connecting websocket", {
        url: wsUrl,
        sessionId: sessionId ?? null,
      });
      
      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        reconnectAttemptRef.current = 0;
        clearReconnectTimer();
        setIsConnected(true);
        log.info("Websocket connected", {
          sessionId: sessionId ?? null,
        });
      };
      
      socket.onmessage = (event) => {
        if (socketRef.current !== socket) return;
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (!isWebSocketMessage(parsed)) {
            log.warn("Invalid websocket message", {
              sessionId: sessionId ?? null,
            });
            return;
          }
          setLastMessage(parsed);
          if (onMessage) {
            onMessage(parsed);
          }
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
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        setIsConnected(false);
        clearReconnectTimer();
        log.info("Websocket disconnected", {
          code: event.code,
          reason: event.reason || null,
          sessionId: sessionId ?? null,
        });
        
        if (event.code === 1008) {
          shouldReconnectRef.current = false;
          if (isAuthenticatedRef.current) {
            handleUnauthorized();
          }
          return;
        }
        
        if (
          !shouldReconnectRef.current ||
          !isAuthenticatedRef.current
        ) {
          return;
        }
        
        const attempt = reconnectAttemptRef.current++;
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
        
        reconnectTimeoutRef.current = setTimeout(() => {
          void connect();
        }, delayMs);
      };
    } catch (error) {
      setIsConnected(false);
      log.error("Failed to initialize websocket", {
        error: String(error),
        sessionId: sessionId ?? null,
      });
    }
  }, [clearReconnectTimer, enabled, sessionId]);
  
  useEffect(() => {
    shouldReconnectRef.current = true;
    if (!enabled || !isAuthenticated) {
      setIsConnected(false);
      setLastMessage(null);
      return;
    }
    void connect();
    
    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      const socket = socketRef.current;
      socketRef.current = null;
      if (
        socket &&
        socket.readyState !== WebSocket.CLOSED &&
        socket.readyState !== WebSocket.CLOSING
      ) {
        socket.close(1000, "Websocket hook cleanup");
      }
      setIsConnected(false);
    };
  }, [
    clearReconnectTimer,
    connect,
    enabled,
    isAuthenticated,
  ]);
  
  const sendMessage = useCallback(
    (message: WebSocketMessage): boolean => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      try {
        socket.send(JSON.stringify(message));
        return true;
      } catch (error) {
        log.error("Failed to send websocket message", {
          error: String(error),
          sessionId: sessionId ?? null,
        });
        return false;
      }
    },
    [sessionId],
  );
  
  return {
    isConnected,
    lastMessage,
    sendMessage,
  };
};
