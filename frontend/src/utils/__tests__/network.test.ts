/**
 * Tests for network utility functions.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { useNetworkStore } from "../../store/networkStore";
import {
  getNetworkStatus,
  isDefinitelyOnline,
  shouldAttemptApiCall,
  isDefinitelyOffline,
  isNetworkUnknown,
  isOnline,
} from "../network";

// ---------------------------------------------------------------------------
// Helper to reset network store between tests
// ---------------------------------------------------------------------------

function setNetworkState(
  isOnline: boolean | undefined | null,
  isInternetReachable: boolean | null,
  connectionType: string = "wifi",
  isRestrictedMode: boolean = false
) {
  const store = useNetworkStore.getState();
  if (isOnline !== undefined && isOnline !== null) {
    store.setIsOnline(isOnline);
  }
  store.setIsInternetReachable(isInternetReachable);
  store.setConnectionType(connectionType);
  store.setRestrictedMode(isRestrictedMode);
}

beforeEach(() => {
  // Reset to defaults
  const store = useNetworkStore.getState();
  store.setIsOnline(true);
  store.setIsInternetReachable(null);
  store.setConnectionType("unknown");
  store.setRestrictedMode(false);
});

// ---------------------------------------------------------------------------
// getNetworkStatus
// ---------------------------------------------------------------------------

describe("getNetworkStatus", () => {
  it("returns ONLINE when isOnline=true and isInternetReachable=true", () => {
    setNetworkState(true, true);
    const result = getNetworkStatus();
    expect(result.status).toBe("ONLINE");
    expect(result.shouldAttemptApi).toBe(true);
    expect(result.shouldAllowWrites).toBe(true);
  });

  it("returns OFFLINE when isOnline=false", () => {
    setNetworkState(false, null);
    const result = getNetworkStatus();
    expect(result.status).toBe("OFFLINE");
    expect(result.shouldAttemptApi).toBe(false);
    expect(result.shouldAllowWrites).toBe(false);
  });

  it("returns OFFLINE when isInternetReachable=false (captive portal)", () => {
    setNetworkState(true, false);
    const result = getNetworkStatus();
    expect(result.status).toBe("OFFLINE");
  });

  it("returns UNKNOWN when isOnline=true but isInternetReachable=null", () => {
    setNetworkState(true, null);
    const result = getNetworkStatus();
    expect(result.status).toBe("UNKNOWN");
    expect(result.shouldAttemptApi).toBe(true);
    expect(result.shouldAllowWrites).toBe(false);
  });

  it("returns OFFLINE when in restricted mode", () => {
    setNetworkState(true, true, "wifi", true);
    const result = getNetworkStatus();
    expect(result.status).toBe("OFFLINE");
  });

  it("includes connection type in result", () => {
    setNetworkState(true, true, "cellular");
    const result = getNetworkStatus();
    expect(result.connectionType).toBe("cellular");
  });

  it("returns isOnline=false when network is actually offline", () => {
    setNetworkState(false, null);
    const result = getNetworkStatus();
    expect(result.isOnline).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDefinitelyOnline
// ---------------------------------------------------------------------------

describe("isDefinitelyOnline", () => {
  it("returns true when status is ONLINE", () => {
    setNetworkState(true, true);
    expect(isDefinitelyOnline()).toBe(true);
  });

  it("returns false when status is OFFLINE", () => {
    setNetworkState(false, null);
    expect(isDefinitelyOnline()).toBe(false);
  });

  it("returns false when status is UNKNOWN", () => {
    setNetworkState(true, null);
    expect(isDefinitelyOnline()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldAttemptApiCall
// ---------------------------------------------------------------------------

describe("shouldAttemptApiCall", () => {
  it("returns true when ONLINE", () => {
    setNetworkState(true, true);
    expect(shouldAttemptApiCall()).toBe(true);
  });

  it("returns true when UNKNOWN (optimistic for reads)", () => {
    setNetworkState(true, null);
    expect(shouldAttemptApiCall()).toBe(true);
  });

  it("returns false when OFFLINE", () => {
    setNetworkState(false, null);
    expect(shouldAttemptApiCall()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDefinitelyOffline
// ---------------------------------------------------------------------------

describe("isDefinitelyOffline", () => {
  it("returns true when status is OFFLINE", () => {
    setNetworkState(false, null);
    expect(isDefinitelyOffline()).toBe(true);
  });

  it("returns false when status is ONLINE", () => {
    setNetworkState(true, true);
    expect(isDefinitelyOffline()).toBe(false);
  });

  it("returns false when status is UNKNOWN", () => {
    setNetworkState(true, null);
    expect(isDefinitelyOffline()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isNetworkUnknown
// ---------------------------------------------------------------------------

describe("isNetworkUnknown", () => {
  it("returns true when status is UNKNOWN", () => {
    setNetworkState(true, null);
    expect(isNetworkUnknown()).toBe(true);
  });

  it("returns false when status is ONLINE", () => {
    setNetworkState(true, true);
    expect(isNetworkUnknown()).toBe(false);
  });

  it("returns false when status is OFFLINE", () => {
    setNetworkState(false, null);
    expect(isNetworkUnknown()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isOnline (legacy)
// ---------------------------------------------------------------------------

describe("isOnline (legacy)", () => {
  it("returns true when ONLINE", () => {
    setNetworkState(true, true);
    expect(isOnline()).toBe(true);
  });

  it("returns true when UNKNOWN (lenient for reads)", () => {
    setNetworkState(true, null);
    expect(isOnline()).toBe(true);
  });

  it("returns false when OFFLINE", () => {
    setNetworkState(false, null);
    expect(isOnline()).toBe(false);
  });
});
