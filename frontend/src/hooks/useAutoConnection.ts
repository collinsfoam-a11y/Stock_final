/**
 * Auto Connection Hook
 * Handles automatic backend connection setup and reconnection
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { Platform } from "react-native";
import { createLogger } from "../services/logging";
import ConnectionManager, { ConnectionInfo } from "../services/connectionManager";
// import EnvironmentConfig from "../config/environment";

const log = createLogger("AutoConnectionHook");

interface UseAutoConnectionOptions {
  onConnectionChange?: (connection: ConnectionInfo) => void;
  onConnectionError?: (error: Error) => void;
  enableAutoReconnect?: boolean;
  reconnectInterval?: number;
}

interface UseAutoConnectionReturn {
  connection: ConnectionInfo | null;
  isConnected: boolean;
  isReconnecting: boolean;
  reconnect: () => Promise<void>;
  error: Error | null;
  lastChecked: string | null;
  enhancedReconnect: () => Promise<void>;
}

export const useAutoConnection = (
  options: UseAutoConnectionOptions = {}
): UseAutoConnectionReturn => {
  const {
    onConnectionChange,
    onConnectionError,
    enableAutoReconnect = true,
    reconnectInterval = 30000, // 30 seconds
  } = options;

  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize connection managers
  const connectionManager = ConnectionManager.getInstance();
  // const environmentConfig = EnvironmentConfig.getInstance(); // Unused

  // Handle connection changes from ConnectionManager
  useEffect(() => {
    const handleConnectionChange = (newConnection: ConnectionInfo) => {
      log.info("Connection changed", {
        url: newConnection.backendUrl,
        healthy: newConnection.isHealthy,
        timestamp: newConnection.lastChecked,
      });

      setConnection(newConnection);
      setError(null);
      setIsReconnecting(false);

      if (onConnectionChange) {
        onConnectionChange(newConnection);
      }
    };

    connectionManager.addListener(handleConnectionChange);

    return () => {
      connectionManager.removeListener(handleConnectionChange);
    };
  }, [connectionManager, onConnectionChange]);

  // Manual reconnect function
  const reconnect = useCallback(async (): Promise<void> => {
    log.info("Manual reconnection requested");
    setIsReconnecting(true);
    setError(null);

    try {
      await connectionManager.reconnect();
      log.info("Reconnection successful");
    } catch (err) {
      log.error("Reconnection failed", { error: err });
      setError(err instanceof Error ? err : new Error("Reconnection failed"));

      if (onConnectionError) {
        onConnectionError(err instanceof Error ? err : new Error("Reconnection failed"));
      }
    } finally {
      setIsReconnecting(false);
    }
  }, [connectionManager, onConnectionError]);

  // Auto-reconnect on network/app foreground
  // Use a ref for isReconnecting to avoid re-running the effect every time it changes
  const isReconnectingRef = useRef(isReconnecting);
  isReconnectingRef.current = isReconnecting;

  useEffect(() => {
    if (!enableAutoReconnect) {
      return;
    }

    // Set up auto-reconnect intervals
    const interval = setInterval(async () => {
      const currentConnection = connectionManager.getConnection();

      // Only attempt reconnection if we have a connection but it's unhealthy
      if (currentConnection && !currentConnection.isHealthy && !isReconnectingRef.current) {
        log.info("Auto-reconnection: detected unhealthy connection");
        await reconnect();
      }
    }, reconnectInterval);

    // Platform-specific app state listening
    if (Platform.OS === "ios") {
      // iOS app state listener would go here
    } else if (Platform.OS === "android") {
      // Android app state listener would go here
    }

    return () => {
      if (Platform.OS === "ios") {
        // Cleanup iOS listener
      }
      if (Platform.OS === "android") {
        // Cleanup Android listener
      }
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [enableAutoReconnect, reconnectInterval, reconnect, connectionManager]);

  // Cleanup on unmount
  useEffect(() => {
    const timeoutRef = reconnectTimeoutRef.current;
    return () => {
      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }
    };
  }, []);

  // Enhanced reconnect with retry logic
  const enhancedReconnect = useCallback(async (): Promise<void> => {
    setIsReconnecting(true);
    setError(null);

    const maxRetries = 3;
    let retryCount = 0;

    const attemptReconnect = async (): Promise<boolean> => {
      try {
        await connectionManager.reconnect();
        return true;
      } catch (err) {
        log.error(`Reconnection attempt ${retryCount + 1} failed`, {
          error: err,
        });

        if (retryCount < maxRetries) {
          retryCount++;
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          log.info(`Retrying in ${delay}ms...`);

          await new Promise((resolve) => setTimeout(resolve, delay));
          return await attemptReconnect();
        } else {
          return false;
        }
      }
    };

    try {
      const success = await attemptReconnect();
      if (success) {
        log.info("Enhanced reconnection successful");
      } else {
        throw new Error("Failed to reconnect after multiple attempts");
      }
    } catch (err) {
      log.error("Enhanced reconnection failed", { error: err });
      setError(err instanceof Error ? err : new Error("Enhanced reconnection failed"));

      if (onConnectionError) {
        onConnectionError(err instanceof Error ? err : new Error("Enhanced reconnection failed"));
      }
    } finally {
      setIsReconnecting(false);
    }
  }, [connectionManager, onConnectionError]);

  return {
    connection,
    isConnected: connection?.isHealthy ?? false,
    isReconnecting,
    reconnect: reconnect, // Keep original reconnect for compatibility
    error,
    lastChecked: connection?.lastChecked ?? null,
    enhancedReconnect, // Add the enhanced reconnect function
  };
};
