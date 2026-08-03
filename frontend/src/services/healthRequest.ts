const PUBLIC_HEALTH_PATHS = new Set(["/health", "/api/health"]);

type HeadersLike = {
  get?: (name: string) => string | null | undefined;
};

type HealthProbeResponse = {
  ok: boolean;
  headers?: HeadersLike | null;
  clone: () => {
    json: () => Promise<unknown>;
  };
};

type MutableHeadersLike = {
  delete?: (name: string) => void;
  common?: MutableHeadersLike;
  [key: string]: unknown;
};

const normalizePath = (url: string): string => {
  try {
    const parsed = new URL(url, "http://localhost");
    const path = parsed.pathname.replace(/\/+$/, "");
    return path || "/";
  } catch {
    return url.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  }
};

const removeHeader = (headers: MutableHeadersLike | undefined, headerName: string): void => {
  if (!headers) return;

  if (typeof headers.delete === "function") {
    headers.delete(headerName);
    headers.delete(headerName.toLowerCase());
  }

  delete headers[headerName];
  delete headers[headerName.toLowerCase()];

  if (headers.common && headers.common !== headers) {
    removeHeader(headers.common, headerName);
  }
};

export const isPublicHealthRequestUrl = (url?: string | null): boolean => {
  if (!url) return false;
  return PUBLIC_HEALTH_PATHS.has(normalizePath(url));
};

export const stripHealthRequestHeaders = (
  headers?: MutableHeadersLike | null,
): MutableHeadersLike | null | undefined => {
  if (!headers) return headers;

  const removableHeaders = [
    "Authorization",
    "Content-Type",
    "User-Agent",
    "X-Device-ID",
    "X-Requested-With",
  ];

  removableHeaders.forEach((headerName) => removeHeader(headers, headerName));
  return headers;
};

const hasBackendHealthSignature = (payload: unknown): boolean => {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const data = payload as Record<string, unknown>;

  if (data.alive === true) {
    return true;
  }

  return (
    typeof data.status === "string" &&
    typeof data.timestamp === "string" &&
    (data.service === "stock-verify-api" ||
      (data.mongodb !== null && typeof data.mongodb === "object"))
  );
};

export const isValidBackendHealthResponse = async (
  response: HealthProbeResponse,
): Promise<boolean> => {
  if (!response.ok) {
    return false;
  }

  const contentType = response.headers?.get?.("content-type")?.toLowerCase() ?? "";
  if (contentType && !contentType.includes("application/json")) {
    return false;
  }

  try {
    const payload = await response.clone().json();
    return hasBackendHealthSignature(payload);
  } catch {
    return false;
  }
};
