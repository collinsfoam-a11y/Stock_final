import Constants from "expo-constants";
import { Platform } from "react-native";
import { isValidBackendHealthResponse } from "./healthRequest";

const HEALTH_PATH = "/api/health";

const parsePort = (value?: string | null): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number(trimmed);
  if (port < 1 || port > 65535) return null;
  return port;
};

const getCandidatePorts = (): number[] => {
  const envPort = parsePort(process.env.EXPO_PUBLIC_BACKEND_PORT);
  const fallbackPorts = [8001, 8002, 8003, 8085];
  if (envPort) {
    return Array.from(new Set([envPort, ...fallbackPorts]));
  }
  return fallbackPorts;
};

const timeoutFetch = async (
  url: string,
  timeoutMs = 1500,
): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);
    return await isValidBackendHealthResponse(res);
  } catch (error) {
    // Only log significant errors, not common probe failures
    if (error instanceof Error && error.name !== "AbortError") {
      // Use debug level logging for probes to avoid console clutter
      // console.log(`[BackendURL] Probe failed for ${url}:`, error.message);
    }
    return false;
  }
};

const stripTrailingSlash = (url: string) =>
  url.endsWith("/") ? url.slice(0, -1) : url;

const getCurrentOrigin = (): string | null => {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return null;
  }

  try {
    return stripTrailingSlash(window.location.origin);
  } catch {
    return null;
  }
};

const getInitialBackendUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl) return stripTrailingSlash(envUrl);

  const currentOrigin = getCurrentOrigin();
  if (currentOrigin) return currentOrigin;

  const configUrl = Constants.expoConfig?.extra?.backendUrl as
    | string
    | undefined;
  if (configUrl) return stripTrailingSlash(configUrl);

  // Use Expo dev host when available (real devices on LAN).
  const hostUri = Constants.expoConfig?.hostUri;
  const expoHost = hostUri?.split(":")[0];
  if (expoHost) return `http://${expoHost}:8001`;

  // Android emulator cannot reach host localhost directly.
  if (Platform.OS === "android") return "http://10.0.2.2:8001";

  return "http://localhost:8001";
};

const buildCandidates = (): string[] => {
  const candidates: string[] = [];
  const ports = getCandidatePorts();

  const addCandidate = (url?: string | null) => {
    if (!url) return;
    candidates.push(stripTrailingSlash(url));
  };

  const addHostCandidate = (host: string) => {
    ports.forEach((port) => {
      candidates.push(`http://${host}:${port}`);
    });
  };

  const currentOrigin = getCurrentOrigin();
  addCandidate(currentOrigin);

  // 1) Explicit env override
  addCandidate(process.env.EXPO_PUBLIC_BACKEND_URL);

  // 2) Runtime config from app.config.js extra
  const configUrl = Constants.expoConfig?.extra?.backendUrl as
    | string
    | undefined;
  addCandidate(configUrl);

  // 3) Expo host URI (dev server IP) - best for LAN access
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host) {
      addHostCandidate(host);
    }
  }

  // 4) Platform-specific fallbacks
  if (Platform.OS === "android") {
    addHostCandidate("10.0.2.2");
  }

  // 5) Web same-host fallbacks
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const hostname = window.location.hostname || "localhost";
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    ports.forEach((port) => {
      candidates.push(`${protocol}://${hostname}:${port}`);
    });
    if (hostname !== "localhost") {
      addHostCandidate("localhost");
      addHostCandidate("127.0.0.1");
    }
  } else if (Platform.OS === "ios") {
    addHostCandidate("localhost");
    addHostCandidate("127.0.0.1");
  }

  // De-dupe while preserving priority order
  return Array.from(
    new Set(candidates.filter(Boolean).map(stripTrailingSlash)),
  );
};

// Best-effort initial URL (sync) used until async probing finishes.
export const BACKEND_URL = getInitialBackendUrl();

let resolvedBackendUrl: string | null = null;

export const resolveBackendUrl = async (): Promise<string> => {
  if (resolvedBackendUrl) return resolvedBackendUrl;

  const currentOrigin = getCurrentOrigin();
  if (currentOrigin) {
    const isCurrentOriginHealthy = await timeoutFetch(`${currentOrigin}${HEALTH_PATH}`, 1500);
    if (isCurrentOriginHealthy) {
      console.log(`[BackendURL] Reusing healthy same-origin backend: ${currentOrigin}`);
      resolvedBackendUrl = currentOrigin;
      return currentOrigin;
    }
  }

  const candidates = buildCandidates();

  console.log("[BackendURL] Probing candidates:", candidates);

  for (const url of candidates) {
    const isHealthy = await timeoutFetch(`${url}${HEALTH_PATH}`, 3000);
    if (!isHealthy) continue;

    console.log(`[BackendURL] Resolved healthy backend at: ${url}`);
    resolvedBackendUrl = url;
    return url;
  }

  // Fallback if nothing responds
  console.warn(
    "[BackendURL] No healthy backend found! Fallback to:",
    BACKEND_URL,
  );
  resolvedBackendUrl = BACKEND_URL;
  return BACKEND_URL;
};

export const initializeBackendURL = async (): Promise<string> => {
  const url = await resolveBackendUrl();
  console.log("[BackendURL] Initialized with:", url);
  return url;
};

export const getBackendURL = () => resolvedBackendUrl ?? BACKEND_URL;
