import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { SyncStatusPill } from "../SyncStatusPill";
import { haptics } from "@/services/haptics";
import * as syncStatusPolling from "@/services/syncStatusPolling";
import * as syncService from "@/services/syncService";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

jest.mock("@/services/syncService", () => {
  const actual = jest.requireActual("@/services/syncService");
  return {
    ...actual,
    forceSync: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock("@/services/syncStatusPolling", () => {
  let subscriber: ((status: any) => void) | null = null;
  return {
    subscribeSyncStatus: jest.fn((sub) => {
      subscriber = sub;
      return jest.fn();
    }),
    refreshSyncStatus: jest.fn(),
    __triggerSubscriber: (status: any) => {
      if (subscriber) {
        subscriber(status);
      }
    },
  };
});

describe("SyncStatusPill", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders null when status is not yet available", () => {
    const { queryByText } = render(<SyncStatusPill />);
    expect(queryByText("Synced")).toBeNull();
  });

  it("renders correctly when online and synced", () => {
    const { getByText, getByLabelText } = render(<SyncStatusPill />);

    act(() => {
      (syncStatusPolling as any).__triggerSubscriber({
        isOnline: true,
        queuedOperations: 0,
      });
    });

    expect(getByText("Synced")).toBeTruthy();
    const pill = getByLabelText("Sync status: Synced");
    expect(pill.props.accessibilityRole).toBe("button");
  });

  it("hides decorative icon from screen readers", () => {
    const { UNSAFE_queryByType } = render(<SyncStatusPill />);

    act(() => {
      (syncStatusPolling as any).__triggerSubscriber({
        isOnline: true,
        queuedOperations: 0,
      });
    });

    const Ionicons = require("@expo/vector-icons/Ionicons").default;
    const icon = UNSAFE_queryByType(Ionicons);
    if (icon) {
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
    }
  });

  it("triggers haptics and forceSync when manual sync is pressed with pending items", async () => {
    const { getByLabelText } = render(<SyncStatusPill />);

    act(() => {
      (syncStatusPolling as any).__triggerSubscriber({
        isOnline: true,
        queuedOperations: 3,
      });
    });

    const button = getByLabelText("Sync status: 3 Pending");

    await act(async () => {
      fireEvent.press(button);
    });

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(syncService.forceSync).toHaveBeenCalledTimes(1);
  });
});
