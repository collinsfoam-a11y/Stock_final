import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  canAttemptLiveApi,
  getConnectivityState,
  getWritePolicyDecision,
  setSyncReplayInProgress,
  shouldForceOfflineWrites,
} from "../connectivityState";
import { getNetworkStatus } from "../../utils/network";

jest.mock("../../utils/network", () => ({
  getNetworkStatus: jest.fn(),
}));

describe("connectivityState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSyncReplayInProgress(false);
  });

  it("maps ONLINE to ONLINE", () => {
    (getNetworkStatus as jest.Mock).mockReturnValue({ status: "ONLINE" });

    expect(getConnectivityState()).toBe("ONLINE");
    expect(getWritePolicyDecision()).toBe("DIRECT");
    expect(canAttemptLiveApi()).toBe(true);
    expect(shouldForceOfflineWrites()).toBe(false);
  });

  it("maps OFFLINE to OFFLINE", () => {
    (getNetworkStatus as jest.Mock).mockReturnValue({ status: "OFFLINE" });

    expect(getConnectivityState()).toBe("OFFLINE");
    expect(getWritePolicyDecision()).toBe("ENQUEUE");
    expect(canAttemptLiveApi()).toBe(false);
    expect(shouldForceOfflineWrites()).toBe(true);
  });

  it("maps UNKNOWN to UNKNOWN and blocks writes", () => {
    (getNetworkStatus as jest.Mock).mockReturnValue({ status: "UNKNOWN" });

    expect(getConnectivityState()).toBe("UNKNOWN");
    expect(getWritePolicyDecision()).toBe("BLOCK");
    expect(canAttemptLiveApi()).toBe(true);
    expect(shouldForceOfflineWrites()).toBe(false);
  });

  it("maps online network + active replay to SYNCING and enqueues writes", () => {
    (getNetworkStatus as jest.Mock).mockReturnValue({ status: "ONLINE" });
    setSyncReplayInProgress(true);

    expect(getConnectivityState()).toBe("SYNCING");
    expect(getWritePolicyDecision()).toBe("ENQUEUE");
    expect(canAttemptLiveApi()).toBe(true);
    expect(shouldForceOfflineWrites()).toBe(true);
  });
});
