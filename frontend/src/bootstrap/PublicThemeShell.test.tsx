import React from "react";
import { Text } from "react-native";
import { render, waitFor } from "@testing-library/react-native";

import PublicThemeShell from "./PublicThemeShell";

const mockReplace = jest.fn();
const mockLoadSettings = jest.fn(async () => undefined);

let mockSession: {
  status: "loading" | "guest" | "authenticated";
  user: { username: string; role: "staff" | "supervisor" | "admin" } | null;
} = {
  status: "guest",
  user: null,
};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock("../components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../context/ThemeContext", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../store/settingsStore", () => ({
  useSettingsStore: (
    selector: (state: { loadSettings: () => Promise<void> }) => unknown,
  ) =>
    selector({
      loadSettings: mockLoadSettings,
    }),
}));

jest.mock("./useWebPublicSession", () => ({
  useWebPublicSession: () => mockSession,
  getPublicRouteForRole: (role: string) => `/${role}`,
}));

describe("PublicThemeShell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = {
      status: "guest",
      user: null,
    };
  });

  it("renders guest children and loads settings", async () => {
    const { getByText } = render(
      <PublicThemeShell>
        <Text>Guest Content</Text>
      </PublicThemeShell>,
    );

    expect(getByText("Guest Content")).toBeTruthy();

    await waitFor(() => {
      expect(mockLoadSettings).toHaveBeenCalled();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects authenticated users to their role home", async () => {
    mockSession = {
      status: "authenticated",
      user: {
        username: "demo-user",
        role: "admin",
      },
    };

    render(
      <PublicThemeShell>
        <Text>Guest Content</Text>
      </PublicThemeShell>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/admin");
    });
  });
});
