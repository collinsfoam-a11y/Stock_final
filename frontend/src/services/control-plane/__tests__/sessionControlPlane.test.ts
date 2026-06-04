jest.mock("@/services/httpClient", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    put: jest.fn(),
  },
}));

jest.mock("@/store/authStore", () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      user: {
        username: "staff1",
        full_name: "Staff Member",
      },
    })),
  },
}));

jest.mock("@/core/config/controlPlaneFlags", () => ({
  controlPlaneFlags: {
    enableEventDrivenSessions: true,
  },
}));

jest.mock("@/utils/network", () => ({
  getNetworkStatus: jest.fn(),
}));

jest.mock("@/utils/uuid", () => ({
  generateOfflineId: jest.fn(() => "local-session-1"),
  generateUUID: jest.fn(() => "idempotency-key-1"),
}));

jest.mock("@/data/repositories/sessionControlPlaneRepository", () => ({
  bindServerSessionId: jest.fn(),
  buildSessionLocationKey: jest.fn(() => "showroom:first:qa"),
  findActiveProjectedSessionForLocation: jest.fn(() => {
    throw new Error("local control-plane store should not be touched");
  }),
  getPendingSessionEvents: jest.fn(),
  getProjectedSessionById: jest.fn(),
  getProjectedSessions: jest.fn(),
  markSessionEventFailed: jest.fn(),
  markSessionEventRetry: jest.fn(),
  markSessionEventSynced: jest.fn(),
  rebuildSessionProjections: jest.fn(),
  recordSessionEvent: jest.fn(),
  resolveLocalSessionId: jest.fn(),
  resolveServerSessionId: jest.fn(),
}));

jest.mock("@/services/offline/offlineStorage", () => ({
  cacheSession: jest.fn(),
  removeSessionFromCache: jest.fn(),
}));

jest.mock("@/services/observability/controlPlaneMetrics", () => ({
  incrementControlPlaneMetric: jest.fn(),
}));

jest.mock("@/services/control-plane/controlPlaneEventBus", () => ({
  controlPlaneEventBus: {
    publish: jest.fn(),
  },
}));

import api from "@/services/httpClient";
import { getNetworkStatus } from "@/utils/network";
import { findActiveProjectedSessionForLocation } from "@/data/repositories/sessionControlPlaneRepository";
import { createSessionCommand } from "../sessionControlPlane";

describe("createSessionCommand", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("posts directly when the network state should still attempt the API", async () => {
    (getNetworkStatus as jest.Mock).mockReturnValue({
      status: "UNKNOWN",
      isOnline: true,
      isInternetReachable: null,
      connectionType: "wifi",
      shouldAttemptApi: true,
      shouldAllowWrites: false,
    });
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        id: "server-session-1",
        warehouse: "Showroom - First Floor - QA1",
        status: "OPEN",
      },
    });

    await expect(
      createSessionCommand({
        warehouse: "Showroom - First Floor - QA1",
        type: "STANDARD",
        location_type: "Showroom",
        location_name: "First Floor",
        rack_no: "QA1",
      })
    ).resolves.toEqual({
      id: "server-session-1",
      warehouse: "Showroom - First Floor - QA1",
      status: "OPEN",
    });

    expect(findActiveProjectedSessionForLocation).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith(
      "/api/sessions",
      {
        warehouse: "Showroom - First Floor - QA1",
        type: "STANDARD",
        location_type: "Showroom",
        location_name: "First Floor",
        rack_no: "QA1",
      },
      expect.objectContaining({
        timeout: 3000,
        skipOfflineQueue: true,
        headers: {
          "X-Idempotency-Key": "idempotency-key-1",
        },
      })
    );
  });
});
