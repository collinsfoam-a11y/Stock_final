jest.mock("@/services/httpClient", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    put: jest.fn(),
    get: jest.fn(),
  },
}));

jest.mock("@/data/repositories/inventoryControlPlaneRepository", () => ({
  getPendingInventoryEvents: jest.fn(),
}));

jest.mock("@/data/repositories/countLineReviewControlPlaneRepository", () => ({
  getPendingCountLineReviewEvents: jest.fn(),
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
import {
  findActiveProjectedSessionForLocation,
  getPendingSessionEvents,
  resolveLocalSessionId,
} from "@/data/repositories/sessionControlPlaneRepository";
import { getPendingInventoryEvents } from "@/data/repositories/inventoryControlPlaneRepository";
import { getPendingCountLineReviewEvents } from "@/data/repositories/countLineReviewControlPlaneRepository";
import { createSessionCommand, getSessionFinalizationReadiness } from "../sessionControlPlane";

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

describe("getSessionFinalizationReadiness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getNetworkStatus as jest.Mock).mockReturnValue({ status: "ONLINE" });
    (resolveLocalSessionId as jest.Mock).mockResolvedValue("local-session-1");
    (getPendingSessionEvents as jest.Mock).mockResolvedValue([]);
    (getPendingInventoryEvents as jest.Mock).mockResolvedValue([]);
    (getPendingCountLineReviewEvents as jest.Mock).mockResolvedValue([]);
  });

  it("blocks a server session when inventory work is queued under its local ID", async () => {
    (getPendingInventoryEvents as jest.Mock).mockResolvedValue([
      { payload: { session_id: "local-session-1" } },
    ]);

    const result = await getSessionFinalizationReadiness("server-session-1");

    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.code).toBe("PENDING_LOCAL_SYNC");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("blocks a server session when review work is queued under its local ID", async () => {
    (getPendingCountLineReviewEvents as jest.Mock).mockResolvedValue([
      { payload: { session_id: "local-session-1" } },
    ]);

    const result = await getSessionFinalizationReadiness("server-session-1");

    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.count).toBe(1);
    expect(api.get).not.toHaveBeenCalled();
  });
});
