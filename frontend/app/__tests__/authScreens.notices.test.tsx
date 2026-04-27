/* eslint-disable @typescript-eslint/no-require-imports */

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";

import LoginScreen from "../login";
import Register from "../register";
import { resetRouteNoticeCache } from "../../src/hooks/useRouteNotice";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

let mockNoticeParams: Record<string, string | string[] | undefined> = {};
let mockRegistrationAvailability: {
  status: "loading" | "ready" | "error";
  publicRegistrationAllowed: boolean;
} = {
  status: "ready",
  publicRegistrationAllowed: true,
};

const mockLoginAuthStoreState = {
  login: jest.fn(),
  loginWithPin: jest.fn(),
  authenticateWithBiometrics: jest.fn(),
  isLoading: false,
  lastLoggedUser: null,
};

const mockRegisterAuthStoreState = {
  establishSession: jest.fn(),
  waitForHydration: jest.fn(async () => true),
};

jest.mock("../../src/components/ui/ModernHeader", () => () => null);

jest.mock("../../src/components/ui/ModernCard", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, null, children);
  },
}));

jest.mock("../../src/components/ui/ModernButton", () => ({
  __esModule: true,
  default: ({
    title,
    onPress,
  }: {
    title: string;
    onPress?: () => void;
  }) => {
    const React = require("react");
    const { Text, TouchableOpacity } = require("react-native");
    return React.createElement(
      TouchableOpacity,
      { onPress },
      React.createElement(Text, null, title),
    );
  },
}));

jest.mock("../../src/components/ui/ModernInput", () => ({
  __esModule: true,
  default: ({
    label,
    value,
    onChangeText,
    error,
  }: {
    label?: string;
    value: string;
    onChangeText: (value: string) => void;
    error?: string;
  }) => {
    const React = require("react");
    const { Text, TextInput, View } = require("react-native");
    return React.createElement(
      View,
      null,
      label ? React.createElement(Text, null, label) : null,
      React.createElement(TextInput, { value, onChangeText }),
      error ? React.createElement(Text, null, error) : null,
    );
  },
}));

jest.mock("../../src/components/branding/BrandLogo", () => ({
  BrandLogo: () => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, "Brand Logo");
  },
}));

jest.mock("../../src/components/auth/AuthNoticeCard", () => ({
  __esModule: true,
  default: ({
    title,
    message,
  }: {
    title: string;
    message: string;
  }) => {
    const React = require("react");
    const { Text, View } = require("react-native");
    return React.createElement(
      View,
      null,
      React.createElement(Text, null, title),
      React.createElement(Text, null, message),
    );
  },
}));

jest.mock("@/components/auth/AuthNoticeCard", () => ({
  __esModule: true,
  default: ({
    title,
    message,
  }: {
    title: string;
    message: string;
  }) => {
    const React = require("react");
    const { Text, View } = require("react-native");
    return React.createElement(
      View,
      null,
      React.createElement(Text, null, title),
      React.createElement(Text, null, message),
    );
  },
}));

jest.mock("../../src/store/authStore", () => ({
  useAuthStore: (
    selector?: (state: typeof mockLoginAuthStoreState) => unknown,
  ) =>
    typeof selector === "function"
      ? selector(mockLoginAuthStoreState)
      : mockLoginAuthStoreState,
}));

jest.mock("@/store/authStore", () => ({
  useAuthStore: (
    selector?: (state: typeof mockRegisterAuthStoreState) => unknown,
  ) =>
    typeof selector === "function"
      ? selector(mockRegisterAuthStoreState)
      : mockRegisterAuthStoreState,
}));

jest.mock("../../src/store/settingsStore", () => ({
  useSettingsStore: (
    selector: (state: { settings: { biometricAuth: boolean } }) => unknown,
  ) =>
    selector({
      settings: {
        biometricAuth: false,
      },
    }),
}));

jest.mock("@/bootstrap/usePublicRegistrationAvailability", () => ({
  usePublicRegistrationAvailability: () => mockRegistrationAvailability,
}));

jest.mock("@/components/AppLogo", () => ({
  AppLogo: () => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, "App Logo");
  },
}));

jest.mock("@/services/api/api", () => ({
  registerUser: jest.fn(),
}));

jest.mock("@/utils/roleNavigation", () => ({
  __esModule: true,
  getRouteForRole: jest.fn(() => "/staff"),
}));

describe("auth screen notices", () => {
  const mockUseRouter = useRouter as jest.Mock;
  const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;
  const mockUsePathname = usePathname as jest.Mock;
  let consoleWarnSpy: jest.SpyInstance;

  beforeAll(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetRouteNoticeCache();
    mockNoticeParams = {};
    mockRegistrationAvailability = {
      status: "ready",
      publicRegistrationAllowed: true,
    };
    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
      canGoBack: jest.fn(() => true),
    });
    mockUseLocalSearchParams.mockImplementation(() => mockNoticeParams);
    mockUsePathname.mockReturnValue("/login");
  });

  it("redirects closed registration deep links to login with a route notice", async () => {
    mockRegistrationAvailability = {
      status: "ready",
      publicRegistrationAllowed: false,
    };

    render(<Register />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login?notice=registration_closed");
    });
  });

  it("shows the closed-registration notice on the login screen", async () => {
    mockNoticeParams = {
      notice: "registration_closed",
    };

    const { getByText } = render(<LoginScreen />);

    await waitFor(() => {
      expect(getByText("Account Creation Closed")).toBeTruthy();
    });

    expect(
      getByText(
        "This workspace is already set up. Sign in and ask an administrator to create your account.",
      ),
    ).toBeTruthy();
  });

  it("does not redirect when registration availability cannot be verified", async () => {
    mockRegistrationAvailability = {
      status: "error",
      publicRegistrationAllowed: false,
    };

    render(<Register />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
