import { useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import { API_BASE_URL } from "../services/httpClient";
import { useAuthStore } from "../store/authStore";
import { secureStorage } from "../services/storage/secureStorage";
import { handleUnauthorized } from "../services/authUnauthorizedHandler";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export const useWebSocket = (sessionId?: string) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const shouldReconnectRef = useRef(true);
  const { isAuthenticated } = useAuthStore();

  const connect = useCallback(async () => {
    if (!isAuthenticated || !shouldReconnectRef.current) return;

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
    const query = new URLSearchParams();
    if (token) {
      query.set("token", token);
    }
    if (sessionId) {
      query.set("session_id", sessionId);
    }
    const urlWithParams = query.toString() ? `${wsUrl}?${query.toString()}` : wsUrl;

    console.log("[WebSocket] Connecting to:", wsUrl.replace(/token=[^&]+/, "token=***"));

    // Use query param auth instead of subprotocols (server doesn't support subprotocol handshake)
    const socket = new WebSocket(urlWithParams);

    socket.onopen = () => {
      console.log("[WebSocket] Connected");
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
        console.error("[WebSocket] Error parsing message:", error);
      }
    };

    socket.onclose = (event) => {
      console.log("[WebSocket] Disconnected:", event.reason);
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
        console.log("[WebSocket] Attempting to reconnect in 5s...");
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      }
    };

    socket.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
    };

    socketRef.current = socket;
  }, [isAuthenticated, sessionId]);

  useEffect(() => {
    shouldReconnectRef.current = true;
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
  }, [connect]);

  const sendMessage = (message: WebSocketMessage) => {
    if (socketRef.current && isConnected) {
      socketRef.current.send(JSON.stringify(message));
    }
  };

  return { isConnected, lastMessage, sendMessage };
};
