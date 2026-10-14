import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { SyncStatusPill } from "../SyncStatusPill";
import { haptics } from "@/services/haptics";
import { subscribeSyncStatus, refreshSyncStatus, type SyncStatusSnapshot } from "../../../services/syncStatusPolling";
import { forceSync } from "../../../services/syncService";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

// Mock sync status polling & service
jest.mock("../../../services/syncStatusPolling", () => ({
  subscribeSyncStatus: jest.fn(),
  refreshSyncStatus: jest.fn(),
}));

jest.mock("../../../services/syncService", () => ({
  ...jest.requireActual("../../../services/syncService"),
  forceSync: jest.fn().mockResolvedValue(undefined),
}));

describe("SyncStatusPill", () => {
  let statusCallback: ((status: SyncStatusSnapshot) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    statusCallback = null;
    (subscribeSyncStatus as jest.Mock).mockImplementation((cb) => {
      statusCallback = cb;
      return jest.fn(); // unsubscribe mock
    });
  });

  it("renders synced status correctly with accessibility props and decorative icon", () => {
    const { getByLabelText, UNSAFE_queryByType } = render(<SyncStatusPill />);

    act(() => {
      statusCallback?.({
        isOnline: true,
        queuedOperations: 0,
        lastSync: new Date().toISOString(),
        cacheSize: 0,
        needsSync: false,
      });
    });

    const pill = getByLabelText("Sync status: Synced");
    expect(pill).toBeTruthy();
    expect(pill.props.accessibilityRole).toBe("button");
    expect(pill.props.accessibilityState.disabled).toBe(true);

    const icon = UNSAFE_queryByType(require("@expo/vector-icons/Ionicons").default);
    if (icon) {
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
    }
  });

  it("renders pending sync status and triggers haptics on press", async () => {
    const { getByLabelText } = render(<SyncStatusPill />);

    act(() => {
      statusCallback?.({
        isOnline: true,
        queuedOperations: 3,
        lastSync: new Date().toISOString(),
        cacheSize: 12,
        needsSync: true,
      });
    });

    const pill = getByLabelText("Sync status: 3 Pending");
    expect(pill.props.accessibilityState.disabled).toBe(false);
    expect(pill.props.accessibilityHint).toBe("Attempts to sync pending offline work.");

    await act(async () => {
      fireEvent.press(pill);
    });

    expect(haptics.light).toHaveBeenCalled();
    expect(forceSync).toHaveBeenCalled();
    expect(refreshSyncStatus).toHaveBeenCalled();
  });

  it("renders offline status correctly as disabled", () => {
    const { getByLabelText } = render(<SyncStatusPill />);

    act(() => {
      statusCallback?.({
        isOnline: false,
        queuedOperations: 2,
        lastSync: null,
        cacheSize: 8,
        needsSync: true,
      });
    });

    const pill = getByLabelText("Sync status: Offline (2)");
    expect(pill.props.accessibilityState.disabled).toBe(true);
  });
});
