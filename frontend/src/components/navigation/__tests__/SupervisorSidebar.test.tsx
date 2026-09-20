import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SupervisorSidebar } from "../SupervisorSidebar";
import { haptics } from "@/services/haptics";

const mockPush = jest.fn();
const mockLogout = jest.fn();

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
    medium: jest.fn(),
    heavy: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useSegments: () => ["supervisor", "dashboard"],
}));

jest.mock("../../../store/authStore", () => ({
  useAuthStore: () => ({
    user: { full_name: "John Supervisor", role: "supervisor" },
    logout: mockLogout,
  }),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#2563eb",
      surface: "#ffffff",
      surfaceElevated: "#f8fafc",
      text: "#0f172a",
      textSecondary: "#64748b",
      border: "#e2e8f0",
      borderLight: "#f1f5f9",
      error: "#ef4444",
      overlayPrimary: "rgba(37, 99, 235, 0.1)",
    },
  }),
}));

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  default: () => ({ width: 1024, height: 768 }),
}));

describe("SupervisorSidebar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders brand section, user profile, nav items, and logout button", () => {
    const { getByText, getByLabelText } = render(<SupervisorSidebar />);

    expect(getByText("Supervisor Hub")).toBeTruthy();
    expect(getByText("John Supervisor")).toBeTruthy();
    expect(getByText("Supervisor")).toBeTruthy();
    expect(getByLabelText("Logout")).toBeTruthy();
  });

  it("toggles section expansion when section header is pressed", () => {
    const { getByLabelText } = render(<SupervisorSidebar />);

    const headerButton = getByLabelText("Overview section");
    expect(headerButton.props.accessibilityState.expanded).toBe(true);

    fireEvent.press(headerButton);

    expect(headerButton.props.accessibilityState.expanded).toBe(false);
    expect(haptics.light).toHaveBeenCalled();
  });

  it("navigates on item press and triggers haptic feedback", () => {
    const { getByLabelText } = render(<SupervisorSidebar />);

    const itemButton = getByLabelText("Count Sessions");
    fireEvent.press(itemButton);

    expect(haptics.light).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/supervisor/sessions");
  });

  it("triggers onToggleCollapse when collapse button is pressed", () => {
    const mockToggle = jest.fn();
    const { getByLabelText } = render(
      <SupervisorSidebar collapsed={false} onToggleCollapse={mockToggle} />
    );

    const collapseButton = getByLabelText("Collapse supervisor sidebar");
    fireEvent.press(collapseButton);

    expect(haptics.light).toHaveBeenCalled();
    expect(mockToggle).toHaveBeenCalled();
  });

  it("calls logout on logout button press", () => {
    const { getByLabelText } = render(<SupervisorSidebar />);

    const logoutButton = getByLabelText("Logout");
    fireEvent.press(logoutButton);

    expect(haptics.light).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalled();
  });
});
