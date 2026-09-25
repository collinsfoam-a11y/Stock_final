import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { AdminCrashScreen } from "../AdminCrashScreen";
import { haptics } from "@/services/haptics";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("AdminCrashScreen", () => {
  const mockError = new Error("Test admin screen error message");
  const mockResetError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders title, error message, and recovery buttons with proper accessibility labels", () => {
    const { getByText, getByLabelText } = render(
      <AdminCrashScreen error={mockError} resetError={mockResetError} />
    );

    expect(getByText("Admin Panel Error")).toBeTruthy();
    expect(getByText("Test admin screen error message")).toBeTruthy();

    const tryAgainButton = getByLabelText("Retry loading admin panel");
    const dashboardButton = getByLabelText("Return to admin dashboard");
    const logoutButton = getByLabelText("Log out after admin panel error");

    expect(tryAgainButton).toBeTruthy();
    expect(dashboardButton).toBeTruthy();
    expect(logoutButton).toBeTruthy();
  });

  it("triggers haptics.light and resetError when Try Again is pressed", () => {
    const { getByLabelText } = render(
      <AdminCrashScreen error={mockError} resetError={mockResetError} />
    );

    const tryAgainButton = getByLabelText("Retry loading admin panel");
    fireEvent.press(tryAgainButton);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(mockResetError).toHaveBeenCalledTimes(1);
  });

  it("triggers haptics.light, resetError, and navigates home when Go to Dashboard is pressed", () => {
    const { getByLabelText } = render(
      <AdminCrashScreen error={mockError} resetError={mockResetError} />
    );

    const dashboardButton = getByLabelText("Return to admin dashboard");
    fireEvent.press(dashboardButton);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(mockResetError).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/admin");
  });

  it("triggers haptics.light, resetError, and navigates to welcome when Logout is pressed", () => {
    const { getByLabelText } = render(
      <AdminCrashScreen error={mockError} resetError={mockResetError} />
    );

    const logoutButton = getByLabelText("Log out after admin panel error");
    fireEvent.press(logoutButton);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(mockResetError).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/welcome");
  });
});
