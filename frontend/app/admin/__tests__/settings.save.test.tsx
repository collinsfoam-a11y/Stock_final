import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import MasterSettingsScreen from "../settings";

const mockGetSystemSettings = jest.fn();
const mockUpdateSystemSettings = jest.fn();
const mockHasRole = jest.fn(() => true);
const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  push: jest.fn(),
  replace: jest.fn(),
};

const mockSettingsState = {
  settings: {
    offlineMode: false,
  },
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("../../../src/hooks/usePermission", () => ({
  usePermission: () => ({
    hasRole: mockHasRole,
  }),
}));

jest.mock("../../../src/hooks/useUiTokens", () => ({
  useUiTokens: () => ({
    mode: "light",
    colors: {
      accent: "#2563eb",
      accentStrong: "#1d4ed8",
      border: "#d1d5db",
      error: "#dc2626",
      success: "#16a34a",
      surface: "#ffffff",
      surfaceElevated: "#ffffff",
      textMuted: "#9ca3af",
      textPrimary: "#111827",
      textSecondary: "#4b5563",
      warning: "#d97706",
    },
    radius: { full: 999, md: 8 },
    spacing: { sm: 8, md: 12, lg: 16 },
  }),
}));

jest.mock("../../../src/services/api", () => ({
  getSystemSettings: (...args: unknown[]) => mockGetSystemSettings(...args),
  updateSystemSettings: (...args: unknown[]) => mockUpdateSystemSettings(...args),
}));

jest.mock("../../../src/store/settingsStore", () => ({
  useSettingsStore: (selector?: (state: typeof mockSettingsState) => unknown) =>
    selector ? selector(mockSettingsState) : mockSettingsState,
}));

// NOTE: mock factories below use React.createElement rather than JSX. JSX inside a
// jest.mock() factory crashes babel-plugin-jest-hoist when combined with
// babel-preset-expo ("expected node to be of a type VariableDeclarator").

jest.mock("../../../src/components/ui/AppearanceSettings", () => ({
  AppearanceSettings: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require("react-native");
    return React.createElement(Text, null, "Appearance settings");
  },
}));

jest.mock("../../../src/components/ui/ModernCard", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  const ModernCard = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);
  ModernCard.displayName = "ModernCard";
  return { ModernCard };
});

jest.mock("../../../src/components/settings", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, TextInput, View } = require("react-native");

  return {
    SettingsActionSection: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    SettingsActionRow: ({ label }: { label: string }) =>
      React.createElement(Text, null, label),
    SettingsSectionDivider: () => React.createElement(View, null),
    SettingsSectionHeading: ({ title }: { title: string }) =>
      React.createElement(Text, null, title),
    SettingsTextInputRow: ({
      value,
      onChangeText,
      testID,
    }: {
      value: string;
      onChangeText: (text: string) => void;
      testID?: string;
    }) => React.createElement(TextInput, { value, onChangeText, testID }),
    SettingsSyncStatus: () => React.createElement(Text, null, "Settings sync status"),
    UserSettingsSections: () => React.createElement(Text, null, "User settings sections"),
  };
});

jest.mock("../../../src/components/ui/ScreenContainer", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ScrollView, Text, View } = require("react-native");

  return {
    ScreenContainer: ({
      children,
      header,
      scrollable,
    }: {
      children: React.ReactNode;
      header?: {
        title?: string;
        subtitle?: string;
        customRightContent?: React.ReactNode;
      };
      scrollable?: boolean;
    }) => {
      const Container = scrollable ? ScrollView : View;
      return React.createElement(
        Container,
        null,
        header?.title ? React.createElement(Text, null, header.title) : null,
        header?.subtitle ? React.createElement(Text, null, header.subtitle) : null,
        header?.customRightContent ?? null,
        children
      );
    },
  };
});

jest.mock("@expo/vector-icons/Ionicons", () => "Ionicons");

describe("MasterSettingsScreen save", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSettingsState.settings.offlineMode = false;
    mockHasRole.mockReturnValue(true);
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockGetSystemSettings.mockResolvedValue({
      success: true,
      data: {
        api_timeout: 30,
        api_rate_limit: 120,
        cache_enabled: true,
        cache_ttl: 300,
        cache_max_size: 1000,
        auto_sync_enabled: true,
        sync_interval: 60,
        sync_batch_size: 100,
        session_timeout: 3600,
        max_concurrent_sessions: 10,
        enable_audit_log: true,
        log_retention_days: 30,
        log_level: "INFO",
        mongo_pool_size: 10,
        sql_pool_size: 5,
        query_timeout: 30,
        password_min_length: 8,
        password_require_uppercase: true,
        password_require_lowercase: true,
        password_require_numbers: true,
        jwt_expiration: 3600,
        enable_compression: true,
        enable_cors: false,
        max_request_size: 1048576,
      },
    });
    mockUpdateSystemSettings.mockResolvedValue({ success: true });
  });

  it("submits edited system settings through the approved API client", async () => {
    const { getByLabelText, getByTestId } = render(<MasterSettingsScreen />);

    await waitFor(() => {
      expect(getByTestId("system-setting-api_timeout").props.value).toBe("30");
    });

    fireEvent.changeText(getByTestId("system-setting-api_timeout"), "45");
    fireEvent.press(getByLabelText("Save system settings"));

    await waitFor(() => {
      expect(mockUpdateSystemSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          api_timeout: 45,
          enable_cors: false,
        })
      );
    });
  }, 15000);
});
