import api from "@/services/httpClient";
import * as sessionRepository from "@/data/repositories/sessionControlPlaneRepository";
import { getNetworkStatus } from "@/utils/network";
import { createSessionCommand } from "../sessionControlPlane";

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
        full_name: "Staff One",
      },
    })),
  },
}));

jest.mock("@/core/config/controlPlaneFlags", () => ({
  CONTROL_PLANE_PROJECTION_VERSION: "v4-control-plane",
  controlPlaneFlags: {
    enableEventDrivenSessions: true,
    enableProjectionReads: true,
    strictProjectionReads: false,
  },
}));

jest.mock("@/utils/uuid", () => ({
  generateOfflineId: jest.fn(() => "offline_local_session"),
  generateUUID: jest.fn(() => "idem-session-create"),
}));

jest.mock("@/utils/network", () => ({
  getNetworkStatus: jest.fn(),
}));

jest.mock("@/data/repositories/sessionControlPlaneRepository", () => ({
  bindServerSessionId: jest.fn(),
  buildSessionLocationKey: jest.fn(() => "WH|rack|A1"),
  findActiveProjectedSessionForLocation: jest.fn(),
  getPendingSessionEvents: jest.fn(),
  getProjectedSessionById: jest.fn(),
  getProjectedSessions: jest.fn(),
  markSessionEventFailed: jest.fn(),
  markSessionEventRetry: jest.fn(),
  markSessionEventSynced: jest.fn(),
  rebuildSessionProjections: jest.fn(),
  recordSessionEvent: jest.fn(),
  resolveLocalSessionId: jest.fn(async (sessionId: string) => sessionId),
  resolveServerSessionId: jest.fn(async (sessionId: string) => sessionId),
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

describe("sessionControlPlane storage fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getNetworkStatus as jest.Mock).mockReturnValue({
      status: "ONLINE",
      isOnline: true,
      isInternetReachable: true,
      connectionType: "wifi",
      shouldAttemptApi: true,
      shouldAllowWrites: true,
    });
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        id: "session-api",
        warehouse: "WH",
        status: "OPEN",
      },
    });
  });

  it("creates through the API when local projection storage has an invalid VFS state", async () => {
    (sessionRepository.findActiveProjectedSessionForLocation as jest.Mock).mockRejectedValue(
      new Error("Invalid VFS state")
    );

    const result = await createSessionCommand({
      warehouse: "WH",
      type: "STANDARD",
      rack_no: "A1",
    });

    expect(api.post).toHaveBeenCalledWith(
      "/api/sessions",
      {
        warehouse: "WH",
        type: "STANDARD",
        location_type: undefined,
        location_name: undefined,
        rack_no: "A1",
      },
      {
        timeout: 45000,
        skipOfflineQueue: true,
        headers: {
          "X-Idempotency-Key": "idem-session-create",
        },
      }
    );
    expect(sessionRepository.recordSessionEvent).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: "session-api",
      warehouse: "WH",
      status: "OPEN",
      _controlPlane: true,
      _projection_unavailable: true,
    });
  });

  it("does not attempt server creation when local storage is unavailable and network is offline", async () => {
    (getNetworkStatus as jest.Mock).mockReturnValue({
      status: "OFFLINE",
      isOnline: false,
      isInternetReachable: false,
      connectionType: "none",
      shouldAttemptApi: false,
      shouldAllowWrites: false,
    });
    (sessionRepository.findActiveProjectedSessionForLocation as jest.Mock).mockRejectedValue(
      new Error("navigator.storage not available")
    );

    await expect(
      createSessionCommand({
        warehouse: "WH",
        type: "STANDARD",
      })
    ).rejects.toMatchObject({
      code: "LOCAL_STORAGE_UNAVAILABLE",
    });

    expect(api.post).not.toHaveBeenCalled();
  });
});
