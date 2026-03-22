import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { UserSettingsSections } from "../UserSettingsSections";

const mockCheckForUpdates = jest.fn();
const mockDismissUpdate = jest.fn();
const mockSetSetting = jest.fn();

const baseSettings = {
  notificationsEnabled: true,
  notificationSound: true,
  notificationBadge: true,
  autoSyncEnabled: true,
  autoSyncInterval: 15,
  syncOnReconnect: true,
  offlineMode: false,
  cacheExpiration: 24,
  maxQueueSize: 1000,
  scannerVibration: true,
  scannerSound: true,
  scannerAutoSubmit: true,
  scannerTimeout: 30,
  showItemImages: true,
  showItemPrices: true,
  showItemStock: true,
  columnVisibility: {
    mfgDate: true,
    expiryDate: true,
    serialNumber: true,
    mrp: true,
  },
  exportFormat: "csv" as const,
  backupFrequency: "weekly" as const,
  requireAuth: true,
  sessionTimeout: 30,
  biometricAuth: false,
  operationalMode: "routine" as const,
  imageCache: true,
  lazyLoading: true,
  debounceDelay: 300,
};

let mockVersionInfo: {
  current_version: string;
  update_available: boolean;
  force_update: boolean;
  release_notes_url?: string | null;
} | null = null;
let mockIsDismissed = false;

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      text: "#111827",
      textSecondary: "#6b7280",
      textTertiary: "#9ca3af",
      border: "#d1d5db",
      borderLight: "#e5e7eb",
      overlayPrimary: "#dbeafe",
      accent: "#2563eb",
      primary: "#2563eb",
    },
    spacing: { sm: 8, md: 12, lg: 16 },
    typography: { fontSize: { xs: 12, sm: 14, md: 16 } },
    borderRadius: { md: 10 },
  }),
}));

jest.mock("../../../hooks/useAppVersion", () => ({
  useAppVersion: () => ({ version: "1.0.0", buildVersion: "100" }),
}));

jest.mock("../../../hooks/useVersionCheck", () => ({
  useVersionCheck: () => ({
    versionInfo: mockVersionInfo,
    isChecking: false,
    updateAvailable: Boolean(mockVersionInfo?.update_available),
    forceUpdate: Boolean(mockVersionInfo?.force_update),
    error: null,
    checkForUpdates: mockCheckForUpdates,
    dismissUpdate: mockDismissUpdate,
    isDismissed: mockIsDismissed,
  }),
}));

jest.mock("../../../store/settingsStore", () => ({
  useSettingsStore: () => ({
    settings: baseSettings,
    setSetting: mockSetSetting,
  }),
}));

jest.mock("../../ui/GlassCard", () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));

jest.mock("../../ui/AnimatedPressable", () => ({
  AnimatedPressable: ({
    children,
    onPress,
    disabled,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TouchableOpacity } = require("react-native");
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled}>
        {children}
      </TouchableOpacity>
    );
  },
}));

jest.mock("@expo/vector-icons/Ionicons", () => "Ionicons");

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light" },
}));

describe("UserSettingsSections", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVersionInfo = null;
    mockIsDismissed = false;
  });

  it("dismisses optional updates when the Later action is chosen", async () => {
    const versionResult = {
      current_version: "1.1.0",
      update_available: true,
      force_update: false,
      release_notes_url: "https://downloads.example.com/latest.apk",
    };
    mockVersionInfo = versionResult;
    mockCheckForUpdates.mockResolvedValue(versionResult);

    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

    const { getByText } = render(<UserSettingsSections />);

    fireEvent.press(getByText("Check for Updates"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const buttons = alertSpy.mock.calls.at(-1)?.[2];
    const laterButton = buttons?.find((button) => button.text === "Later");

    expect(laterButton).toBeDefined();
    laterButton?.onPress?.();

    expect(mockDismissUpdate).toHaveBeenCalled();
  });

  it("shows a failure alert when version check returns an error payload", async () => {
    const versionResult = {
      current_version: "1.0.0",
      update_available: false,
      force_update: false,
      error: "Network unavailable",
    };
    mockCheckForUpdates.mockResolvedValue(versionResult);

    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

    const { getByText } = render(<UserSettingsSections />);
    fireEvent.press(getByText("Check for Updates"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Update Check Failed",
        "Unable to check for updates right now. Please try again shortly.",
      );
    });
  });

  it("shows dismissed optional updates as paused instead of prompting for update now", () => {
    mockVersionInfo = {
      current_version: "1.1.0",
      update_available: true,
      force_update: false,
      release_notes_url: "https://downloads.example.com/latest.apk",
    };
    mockIsDismissed = true;

    const { getByText, queryByText } = render(<UserSettingsSections />);

    expect(getByText("Update Reminder")).toBeTruthy();
    expect(getByText("Dismissed")).toBeTruthy();
    expect(queryByText("Update Now")).toBeNull();
  });

  it("does not cycle into unsupported operational modes from settings", () => {
    const { getByText } = render(<UserSettingsSections />);

    fireEvent.press(getByText("Operational Mode"));

    expect(mockSetSetting).not.toHaveBeenCalledWith("operationalMode", "live_audit");
    expect(mockSetSetting).not.toHaveBeenCalledWith("operationalMode", "training");
  });
});
