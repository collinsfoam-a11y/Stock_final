import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ScreenHeader } from "../ScreenHeader";
import { ThemeProvider } from "../../../context/ThemeContext";
import { useAuthStore } from "../../../store/authStore";

// NOTE: mock factories use React.createElement rather than JSX inside jest.mock to avoid babel issues.

// Mock expo-router
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock safeAreaInsets
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock authStore
jest.mock("../../../store/authStore", () => ({
  useAuthStore: jest.fn(),
}));

describe("ScreenHeader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthStore as unknown as jest.Mock).mockReturnValue({
      user: { username: "johndoe", full_name: "John Doe", role: "staff" },
      logout: jest.fn(),
    });
  });

  const renderWithTheme = (ui: React.ReactElement) => {
    return render(<ThemeProvider>{ui}</ThemeProvider>);
  };

  it("renders title and subtitle correctly", () => {
    const { getByText } = renderWithTheme(
      <ScreenHeader title="Dashboard" subtitle="Overview" />
    );
    expect(getByText("Dashboard")).toBeTruthy();
    expect(getByText("Overview")).toBeTruthy();
  });

  it("renders user full name when title is not provided", () => {
    const { getByText } = renderWithTheme(<ScreenHeader showUsername={true} />);
    expect(getByText("Welcome back")).toBeTruthy();
    expect(getByText("John Doe")).toBeTruthy();
  });

  it("provides correct accessibility label and role for back button", () => {
    const onBackPress = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <ScreenHeader showBackButton={true} onBackPress={onBackPress} />
    );

    const backButton = getByLabelText("Go back");
    expect(backButton).toBeTruthy();
    expect(backButton.props.accessibilityRole).toBe("button");

    fireEvent.press(backButton);
    expect(onBackPress).toHaveBeenCalledTimes(1);
  });

  it("provides correct accessibility label and role for settings button", () => {
    const { getByLabelText } = renderWithTheme(
      <ScreenHeader showSettingsButton={true} />
    );

    const settingsButton = getByLabelText("Settings");
    expect(settingsButton).toBeTruthy();
    expect(settingsButton.props.accessibilityRole).toBe("button");
  });

  it("provides correct accessibility label and role for logout button", () => {
    const { getByLabelText } = renderWithTheme(
      <ScreenHeader showLogoutButton={true} />
    );

    const logoutButton = getByLabelText("Logout");
    expect(logoutButton).toBeTruthy();
    expect(logoutButton.props.accessibilityRole).toBe("button");
  });

  it("provides correct accessibility label for custom right action", () => {
    const onRightPress = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <ScreenHeader
        rightAction={{
          icon: "add-circle-outline",
          onPress: onRightPress,
          label: "Add Record",
        }}
      />
    );

    const rightActionButton = getByLabelText("Add Record");
    expect(rightActionButton).toBeTruthy();
    expect(rightActionButton.props.accessibilityRole).toBe("button");

    fireEvent.press(rightActionButton);
    expect(onRightPress).toHaveBeenCalledTimes(1);
  });
});
