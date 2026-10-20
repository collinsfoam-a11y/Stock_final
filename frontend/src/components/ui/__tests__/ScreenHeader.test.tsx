import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ScreenHeader } from "../ScreenHeader";
import { haptics } from "@/services/haptics";
import { useAuthStore } from "../../../store/authStore";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
    medium: jest.fn(),
  },
}));

// Mock safeBackNavigation
jest.mock("../../../utils/navigation", () => ({
  safeBackNavigation: jest.fn(),
}));

// Mock expo-router
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
  }),
}));

// Mock safe-area-context
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 10, bottom: 0, left: 0, right: 0 }),
}));

// Mock theme context
jest.mock("../../../context/ThemeContext", () => ({
  useThemeContext: () => ({
    theme: {
      colors: {
        text: { primary: "#000000", secondary: "#666666", tertiary: "#999999" },
        accent: "#007AFF",
        danger: "#FF3B30",
      },
    },
    isDark: false,
  }),
}));

describe("ScreenHeader", () => {
  const mockUser = {
    username: "johndoe",
    full_name: "John Doe",
    role: "staff",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: mockUser as any,
      isAuthenticated: true,
      logout: jest.fn().mockResolvedValue(undefined),
    });
  });

  it("renders header action buttons with standardized accessibility props and haptics on press", () => {
    const handleCustomAction = jest.fn();
    const handleBack = jest.fn();

    const { getByTestId } = render(
      <ScreenHeader
        title="Test Screen"
        showBackButton={true}
        onBackPress={handleBack}
        showSettingsButton={true}
        showLogoutButton={true}
        rightAction={{
          icon: "filter",
          onPress: handleCustomAction,
          label: "Filter list",
        }}
        logoutConfirmMessage={null}
      />
    );

    // 1. Back button
    const backBtn = getByTestId("back-button");
    expect(backBtn.props.accessibilityRole).toBe("button");
    expect(backBtn.props.accessibilityLabel).toBe("Go back");
    expect(backBtn.props.accessibilityHint).toBe("Returns to the previous operational screen.");

    fireEvent.press(backBtn);
    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(handleBack).toHaveBeenCalledTimes(1);

    // 2. Settings button
    const settingsBtn = getByTestId("settings-button");
    expect(settingsBtn.props.accessibilityRole).toBe("button");
    expect(settingsBtn.props.accessibilityLabel).toBe("Open settings");
    expect(settingsBtn.props.accessibilityHint).toBe("Navigates to user and system settings.");

    fireEvent.press(settingsBtn);
    expect(haptics.light).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith("/staff/settings");

    // 3. Custom right action button
    const rightActionBtn = getByTestId("right-action-button");
    expect(rightActionBtn.props.accessibilityRole).toBe("button");
    expect(rightActionBtn.props.accessibilityLabel).toBe("Filter list");

    fireEvent.press(rightActionBtn);
    expect(haptics.light).toHaveBeenCalledTimes(3);
    expect(handleCustomAction).toHaveBeenCalledTimes(1);

    // 4. Logout button (triggers haptics.medium)
    const logoutBtn = getByTestId("logout-button");
    expect(logoutBtn.props.accessibilityRole).toBe("button");
    expect(logoutBtn.props.accessibilityLabel).toBe("Log out");
    expect(logoutBtn.props.accessibilityHint).toBe("Logs out of the current session.");

    fireEvent.press(logoutBtn);
    expect(haptics.medium).toHaveBeenCalledTimes(1);
  });

  it("hides internal Ionicons from screen reader tree", () => {
    const { UNSAFE_getAllByType } = render(
      <ScreenHeader
        title="Accessibility Test"
        showBackButton={true}
        showSettingsButton={true}
        logoutConfirmMessage={null}
      />
    );

    const Ionicons = require("@expo/vector-icons/Ionicons").default;
    const iconElements = UNSAFE_getAllByType(Ionicons);

    expect(iconElements.length).toBeGreaterThan(0);
    iconElements.forEach((icon) => {
      expect(icon.props.importantForAccessibility).toBe("no");
      expect(icon.props.accessibilityElementsHidden).toBe(true);
    });
  });
});
