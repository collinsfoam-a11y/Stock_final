/**
 * Dynamic Connection Manager
 * Automatically detects and updates backend connection when ports/IPs change
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createLogger } from "./logging";
import { isValidBackendHealthResponse } from "./healthRequest";

const log = createLogger("ConnectionManager");

// Connection state
interface ConnectionInfo {
  backendUrl: string;
  backendPort: number;
  backendIp: string;
  lastChecked: string;
  isHealthy: boolean;
}

const STORAGE_KEY = "connection_info";
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 5000; // 5 seconds

class ConnectionManager {
  private static instance: ConnectionManager;
  private currentConnection: ConnectionInfo | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private listeners: ((connection: ConnectionInfo) => void)[] = [];
  private isInitialized = false;

  private constructor() {
    // ❌ NO side effects in constructor
    // Moved to initialize() method
  }

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * Initialize connection with fallback detection
   * MOVED from constructor to prevent import-time execution
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Try to load saved connection first
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.currentConnection = JSON.parse(saved);
        log.info("Loaded saved connection", this.currentConnection);
      }

      // Always detect on startup to handle network changes
      await this.detectAndSetConnection();

      // Start health monitoring
      this.startHealthMonitoring();
      
      // Mark as initialized to prevent re-initialization
      this.isInitialized = true;
    } catch (error) {
      log.error("Failed to initialize connection", error);
      // Set fallback connection
      this.setFallbackConnection();
      this.isInitialized = true; // Mark even on failure to prevent retry loops
    }
  }

  /**
   * Detect best available backend connection
   */
  private async detectAndSetConnection(): Promise<ConnectionInfo> {
    log.info("Starting backend connection detection...");

    const currentOrigin = this.getCurrentOrigin();
    if (currentOrigin) {
      const isCurrentOriginHealthy = await this.checkHealth(currentOrigin);
      if (isCurrentOriginHealthy) {
        const currentUrl = new URL(currentOrigin);
        const sameOriginConnection: ConnectionInfo = {
          backendUrl: currentOrigin,
          backendPort: this.getUrlPort(currentUrl),
          backendIp: currentUrl.hostname,
          lastChecked: new Date().toISOString(),
          isHealthy: true,
        };

        await this.setCurrentConnection(sameOriginConnection);
        log.info("Selected healthy same-origin connection", sameOriginConnection);
        return sameOriginConnection;
      }
    }

    const candidates = await this.buildConnectionCandidates();
    const bestConnection = await this.findHealthyConnection(candidates);

    if (bestConnection) {
      await this.setCurrentConnection(bestConnection);
      log.info("Selected healthy connection", bestConnection);
    } else {
      log.warn("No healthy connections found, using fallback");
      this.setFallbackConnection();
    }

    return this.currentConnection!;
  }

  /**
   * Build list of potential backend connections
   */
  private async buildConnectionCandidates(): Promise<
    { url: string; priority: number }[]
  > {
    const candidates: { url: string; priority: number }[] = [];
    const normalize = (url: string) => url.replace(/\/+$/, "");

    // 1. Environment variable override
    const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (envUrl) {
      candidates.push({ url: normalize(envUrl), priority: 10 });
    }

    const currentOrigin = this.getCurrentOrigin();
    if (currentOrigin) {
      candidates.push({ url: normalize(currentOrigin), priority: 11 });
    }

    // 1.5 Current connection gets high priority for stability.
    if (this.currentConnection?.backendUrl) {
      candidates.push({
        url: normalize(this.currentConnection.backendUrl),
        priority: 9,
      });
    }

    // 2. Expo host URI (best signal on LAN in development)
    const hostUri = Constants.expoConfig?.hostUri;
    const expoHost = hostUri?.split(":")[0];
    if (expoHost) {
      candidates.push({ url: `http://${expoHost}:8001`, priority: 8 });
    }

    // 3. Platform-specific defaults
    if (Platform.OS === "android") {
      // Android emulator default
      candidates.push({ url: "http://10.0.2.2:8001", priority: 5 });
    }

    // 4. Common development ports
    const commonPorts = [8001, 8002, 8003, 8085];
    const detectedIp = this.getDeviceIp();

    for (const port of commonPorts) {
      candidates.push({
        url: `http://${detectedIp}:${port}`,
        priority: port === 8001 ? 7 : 6,
      });
    }

    // 5. Localhost fallback (safe for web/simulators; poor on real devices)
    if (Platform.OS === "web" || Platform.OS === "ios") {
      candidates.push({ url: "http://localhost:8001", priority: 3 });
      candidates.push({ url: "http://127.0.0.1:8001", priority: 2 });
    }

    // Remove duplicates and sort by priority
    const unique = Array.from(
      new Map(candidates.map((c) => [c.url, c])).values(),
    ).sort((a, b) => b.priority - a.priority);

    log.debug("Built connection candidates", unique);
    return unique;
  }

  /**
   * Get device IP for network detection
   */
  private getDeviceIp(): string {
    const hostUri = Constants.expoConfig?.hostUri;
    const expoHost = hostUri?.split(":")[0];
    if (expoHost) return expoHost;

    if (Platform.OS === "android") return "10.0.2.2";
    if (Platform.OS === "web") return "localhost";
    return "127.0.0.1";
  }

  private getCurrentOrigin(): string | null {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return null;
    }

    try {
      return window.location.origin.replace(/\/+$/, "");
    } catch {
      return null;
    }
  }

  private getUrlPort(url: URL): number {
    const parsedPort = parseInt(url.port, 10);
    if (!Number.isNaN(parsedPort) && parsedPort > 0) {
      return parsedPort;
    }
    return url.protocol === "https:" ? 443 : 80;
  }

  /**
   * Find first healthy connection from candidates
   */
  private async findHealthyConnection(
    candidates: { url: string; priority: number }[],
  ): Promise<ConnectionInfo | null> {
    for (const candidate of candidates) {
      const isHealthy = await this.checkHealth(candidate.url);
      if (isHealthy) {
        const url = new URL(candidate.url);
        return {
          backendUrl: candidate.url,
          backendPort: this.getUrlPort(url),
          backendIp: url.hostname,
          lastChecked: new Date().toISOString(),
          isHealthy: true,
        };
      }
    }

    return null;
  }

  /**
   * Check if backend is healthy
   */
  private async checkHealth(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);

      const response = await fetch(`${url}/api/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return await isValidBackendHealthResponse(response);
    } catch (error: any) {
      if (error && error.name !== "AbortError") {
        log.debug(`Health check failed for ${url}`, { error });
      }
      return false;
    }
  }

  /**
   * Set fallback connection when no healthy backend is found
   */
  private setFallbackConnection(): void {
    const defaultFallbackUrl =
      Platform.OS === "android" ? "http://10.0.2.2:8001" : "http://localhost:8001";
    const rawFallbackUrl =
      process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || defaultFallbackUrl;
    const fallbackUrl = /^https?:\/\//i.test(rawFallbackUrl)
      ? rawFallbackUrl
      : `http://${rawFallbackUrl}`;

    let parsedFallback: URL;
    try {
      parsedFallback = new URL(fallbackUrl);
    } catch (error) {
      log.warn("Invalid fallback backend URL, using default", {
        configuredUrl: rawFallbackUrl,
        error,
      });
      parsedFallback = new URL(defaultFallbackUrl);
    }

    const normalizedUrl = parsedFallback.toString().replace(/\/+$/, "");
    const defaultPort = parsedFallback.protocol === "https:" ? 443 : 8001;
    const fallback: ConnectionInfo = {
      backendUrl: normalizedUrl,
      backendPort: parseInt(parsedFallback.port, 10) || defaultPort,
      backendIp: parsedFallback.hostname,
      lastChecked: new Date().toISOString(),
      isHealthy: false,
    };

    this.currentConnection = fallback;
    this.saveConnection(fallback);
    this.notifyListeners(fallback);

    log.warn("Using fallback connection", fallback);
  }

  /**
   * Set current connection and notify listeners
   */
  private async setCurrentConnection(
    connection: ConnectionInfo,
  ): Promise<void> {
    this.currentConnection = connection;
    await this.saveConnection(connection);
    this.notifyListeners(connection);
  }

  /**
   * Save connection to persistent storage
   */
  private async saveConnection(connection: ConnectionInfo): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
    } catch (error) {
      log.error("Failed to save connection", error);
    }
  }

  /**
   * Notify all listeners of connection change
   */
  private notifyListeners(connection: ConnectionInfo): void {
    this.listeners.forEach((listener) => {
      try {
        listener(connection);
      } catch (error) {
        log.error("Error in connection listener", error);
      }
    });
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      if (this.currentConnection) {
        const wasHealthy = this.currentConnection.isHealthy;
        const isHealthy = await this.checkHealth(
          this.currentConnection.backendUrl,
        );

        if (wasHealthy !== isHealthy) {
          // Health status changed, update connection
          const updatedConnection = {
            ...this.currentConnection,
            isHealthy,
            lastChecked: new Date().toISOString(),
          };

          await this.setCurrentConnection(updatedConnection);
        }

        // If current connection is unhealthy, try to find new one
        if (!isHealthy) {
          log.info("Current connection unhealthy, re-detecting...");
          await this.detectAndSetConnection();
        }
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health monitoring
   */
  public stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Get current connection info
   */
  public getConnection(): ConnectionInfo | null {
    return this.currentConnection;
  }

  /**
   * Add listener for connection changes
   */
  public addListener(listener: (connection: ConnectionInfo) => void): void {
    this.listeners.push(listener);

    // Immediately notify with current connection
    if (this.currentConnection) {
      listener(this.currentConnection);
    }
  }

  /**
   * Remove listener
   */
  public removeListener(listener: (connection: ConnectionInfo) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Manual reconnection attempt
   */
  public async reconnect(): Promise<ConnectionInfo> {
    log.info("Manual reconnection requested");
    return await this.detectAndSetConnection();
  }

  /**
   * Force update backend URL
   */
  public async setBackendUrl(url: string): Promise<void> {
    try {
      const urlObj = new URL(url);
      const connection: ConnectionInfo = {
        backendUrl: url,
        backendPort: parseInt(urlObj.port) || 8001,
        backendIp: urlObj.hostname,
        lastChecked: new Date().toISOString(),
        isHealthy: await this.checkHealth(url),
      };

      await this.setCurrentConnection(connection);
      log.info("Backend URL manually updated", connection);
    } catch (error) {
      log.error("Failed to set backend URL", error);
    }
  }
}

export default ConnectionManager;
export type { ConnectionInfo };
