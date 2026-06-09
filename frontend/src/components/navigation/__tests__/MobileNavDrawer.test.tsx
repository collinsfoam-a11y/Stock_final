import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { MobileNavDrawer } from "../MobileNavDrawer";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useSegments: () => ["supervisor", "dashboard"],
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("../../../store/authStore", () => ({
  useAuthStore: (selector?: (state: { user: { role: string } }) => unknown) => {
    const state = { user: { role: "supervisor" } };
    return selector ? selector(state) : state;
  },
}));

jest.mock("../../../hooks/useUiTokens", () => ({
  useUiTokens: () => ({
    mode: "light",
    colors: {
      accent: "#2563eb",
      background: "#ffffff",
      border: "#d1d5db",
      surface: "#f3f4f6",
      textMuted: "#9ca3af",
      textPrimary: "#111827",
      textSecondary: "#4b5563",
    },
    radius: { md: 8, lg: 12 },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  }),
}));

describe("MobileNavDrawer", () => {
  beforeEach(() => mockPush.mockClear());

  it("renders a menu button and keeps the drawer closed initially", () => {
    const { getByLabelText, queryByText } = render(<MobileNavDrawer role="supervisor" />);

    expect(getByLabelText("Open navigation menu")).toBeTruthy();
    // Items are not rendered until the drawer is opened.
    expect(queryByText("Count Sessions")).toBeNull();
  });

  it("opens the drawer and navigates to the selected supervisor route", () => {
    const { getByLabelText, getByText } = render(<MobileNavDrawer role="supervisor" />);

    fireEvent.press(getByLabelText("Open navigation menu"));

    expect(getByText("Count Sessions")).toBeTruthy();

    fireEvent.press(getByText("Count Sessions"));

    expect(mockPush).toHaveBeenCalledWith("/supervisor/sessions");
  });

  it("shows admin navigation when role is admin", () => {
    const { getByLabelText, getByText } = render(<MobileNavDrawer role="admin" />);

    fireEvent.press(getByLabelText("Open navigation menu"));

    // Admin-only label from ADMIN_NAV_GROUPS.
    expect(getByText("User Accounts")).toBeTruthy();
  });
});
