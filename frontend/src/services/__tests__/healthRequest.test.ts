import apiClient from "../httpClient";
import {
  isPublicHealthRequestUrl,
  isValidBackendHealthResponse,
  stripHealthRequestHeaders,
} from "../healthRequest";

jest.mock("../connectionManager", () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({
      addListener: jest.fn(),
      removeListener: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

describe("health request helpers", () => {
  const createProbeResponse = ({
    ok = true,
    contentType = "application/json",
    body,
    jsonError,
  }: {
    ok?: boolean;
    contentType?: string;
    body?: unknown;
    jsonError?: Error;
  }) => ({
    ok,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? contentType : null,
    },
    clone: () => ({
      json: async () => {
        if (jsonError) {
          throw jsonError;
        }
        return body;
      },
    }),
  });

  it("matches only the public health endpoints", () => {
    expect(isPublicHealthRequestUrl("/health")).toBe(true);
    expect(isPublicHealthRequestUrl("/api/health")).toBe(true);
    expect(isPublicHealthRequestUrl("http://localhost:8001/api/health?warm=1")).toBe(true);

    expect(isPublicHealthRequestUrl("/health/detailed")).toBe(false);
    expect(isPublicHealthRequestUrl("/api/metrics/health")).toBe(false);
    expect(isPublicHealthRequestUrl("/api/diagnosis/health")).toBe(false);
  });

  it("removes non-simple headers from health requests", () => {
    const headers = {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
      "User-Agent": "StockVerifyApp/1.0",
      "X-Device-ID": "device-1",
      common: {
        Authorization: "Bearer token",
        "content-type": "application/json",
      },
    };

    stripHealthRequestHeaders(headers);

    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers["User-Agent"]).toBeUndefined();
    expect(headers["X-Device-ID"]).toBeUndefined();
    expect(headers.common.Authorization).toBeUndefined();
    expect(headers.common["content-type"]).toBeUndefined();
  });

  it("accepts only backend JSON health responses", async () => {
    await expect(
      isValidBackendHealthResponse(
        createProbeResponse({
          body: {
            status: "healthy",
            timestamp: "2026-03-12T12:00:00",
            service: "stock-verify-api",
            mongodb: { status: "healthy" },
          },
        }),
      ),
    ).resolves.toBe(true);

    await expect(
      isValidBackendHealthResponse(
        createProbeResponse({
          contentType: "text/html; charset=utf-8",
          body: "<!DOCTYPE html><html></html>",
        }),
      ),
    ).resolves.toBe(false);

    await expect(
      isValidBackendHealthResponse(
        createProbeResponse({
          body: { ok: true, message: "not a health payload" },
        }),
      ),
    ).resolves.toBe(false);

    await expect(
      isValidBackendHealthResponse(
        createProbeResponse({
          jsonError: new Error("invalid json"),
        }),
      ),
    ).resolves.toBe(false);
  });

  it("keeps JSON content type scoped to write requests", () => {
    expect(apiClient.defaults.headers.common["Content-Type"]).toBeUndefined();
    expect(apiClient.defaults.headers.common["content-type"]).toBeUndefined();
    expect(apiClient.defaults.headers.post["Content-Type"]).toBe("application/json");
    expect(apiClient.defaults.headers.put["Content-Type"]).toBe("application/json");
    expect(apiClient.defaults.headers.patch["Content-Type"]).toBe("application/json");
  });
});
