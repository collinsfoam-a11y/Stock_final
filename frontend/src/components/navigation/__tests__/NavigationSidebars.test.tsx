import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SupervisorSidebar } from "../SupervisorSidebar";
import { AdminSidebar } from "../AdminSidebar";
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

jest.mock("expo-blur", () => ({
  BlurView: ({ children }: any) => <>{children}</>,
}));

jest.mock("../../../store/authStore", () => ({
  useAuthStore: () => ({
    user: { full_name: "Test User", role: "admin" },
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

describe("Navigation Sidebars (SupervisorSidebar & AdminSidebar)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sidebarCases = [
    {
      name: "SupervisorSidebar",
      Component: SupervisorSidebar,
      brandText: "Supervisor Hub",
      roleText: "Administrator",
      headerSectionLabel: "Overview section",
      itemLabel: "Count Sessions",
      expectedRoute: "/supervisor/sessions",
      collapseLabel: "Collapse supervisor hub",
    },
    {
      name: "AdminSidebar",
      Component: AdminSidebar,
      brandText: "Admin Control",
      roleText: "Administrator",
      headerSectionLabel: "Access Control section",
      itemLabel: "User Accounts",
      expectedRoute: "/admin/users",
      collapseLabel: "Collapse admin control",
    },
  ];

  describe.each(sidebarCases)(
    "$name",
    ({
      Component,
      brandText,
      roleText,
      headerSectionLabel,
      itemLabel,
      expectedRoute,
      collapseLabel,
    }) => {
      it("renders brand section, user profile, nav items, and logout button", () => {
        const { getByText, getByLabelText } = render(<Component />);

        expect(getByText(brandText)).toBeTruthy();
        expect(getByText("Test User")).toBeTruthy();
        expect(getByText(roleText)).toBeTruthy();
        expect(getByLabelText("Logout")).toBeTruthy();
      });

      it("toggles section header expansion on press", () => {
        const { getByLabelText } = render(<Component />);

        const headerButton = getByLabelText(headerSectionLabel);
        expect(headerButton.props.accessibilityState.expanded).toBe(true);

        fireEvent.press(headerButton);

        expect(headerButton.props.accessibilityState.expanded).toBe(false);
        expect(haptics.light).toHaveBeenCalled();
      });

      it("navigates on item press and triggers haptic feedback", () => {
        const { getByLabelText } = render(<Component />);

        const itemButton = getByLabelText(itemLabel);
        fireEvent.press(itemButton);

        expect(haptics.light).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith(expectedRoute);
      });

      it("triggers onToggleCollapse when collapse button is pressed", () => {
        const mockToggle = jest.fn();
        const { getByLabelText } = render(
          <Component collapsed={false} onToggleCollapse={mockToggle} />
        );

        const collapseButton = getByLabelText(collapseLabel);
        fireEvent.press(collapseButton);

        expect(haptics.light).toHaveBeenCalled();
        expect(mockToggle).toHaveBeenCalled();
      });

      it("calls logout on logout button press", () => {
        const { getByLabelText } = render(<Component />);

        const logoutButton = getByLabelText("Logout");
        fireEvent.press(logoutButton);

        expect(haptics.light).toHaveBeenCalled();
        expect(mockLogout).toHaveBeenCalled();
      });
    }
  );
});
