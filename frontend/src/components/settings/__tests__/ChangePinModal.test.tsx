import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { ChangePinModal } from "../ChangePinModal";
import { authApi } from "@/services/api/authApi";
import { haptics } from "@/services/haptics";

jest.mock("@/context/ThemeContext", () => ({
  useThemeContext: () => ({
    themeLegacy: {
      colors: {
        surface: "#ffffff",
        text: "#111827",
        textSecondary: "#6b7280",
        border: "#d1d5db",
        background: "#f3f4f6",
        danger: "#ef4444",
        accent: "#2563eb",
      },
    },
  }),
}));

jest.mock("@/services/api/authApi", () => ({
  authApi: {
    changePin: jest.fn(),
  },
}));

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("ChangePinModal", () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with correct accessibility roles, labels, and hints", () => {
    const { getByRole, getByLabelText } = render(<ChangePinModal {...defaultProps} />);

    // Title header
    expect(getByRole("header", { name: "Change PIN" })).toBeTruthy();

    // Inputs accessibility labels
    expect(getByLabelText("Current PIN")).toBeTruthy();
    expect(getByLabelText("New PIN")).toBeTruthy();
    expect(getByLabelText("Confirm New PIN")).toBeTruthy();

    // Buttons
    expect(getByRole("button", { name: "Cancel PIN change" })).toBeTruthy();
    expect(getByRole("button", { name: "Change PIN" })).toBeTruthy();
  });

  it("triggers light haptics and calls onClose when Cancel is pressed", () => {
    const { getByRole } = render(<ChangePinModal {...defaultProps} />);

    fireEvent.press(getByRole("button", { name: "Cancel PIN change" }));

    expect(haptics.light).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("triggers error haptics and displays alert when submission validation fails", async () => {
    const { getByLabelText, getByRole, getByText } = render(<ChangePinModal {...defaultProps} />);

    // Enter non-matching PINs
    fireEvent.changeText(getByLabelText("Current PIN"), "1234");
    fireEvent.changeText(getByLabelText("New PIN"), "5678");
    fireEvent.changeText(getByLabelText("Confirm New PIN"), "9999");

    fireEvent.press(getByRole("button", { name: "Change PIN" }));

    await waitFor(() => {
      const errorAlert = getByRole("alert");
      expect(errorAlert).toBeTruthy();
      expect(getByText("New PIN and confirmation do not match")).toBeTruthy();
      expect(haptics.error).toHaveBeenCalled();
    });
  });

  it("triggers success haptics and calls authApi.changePin on valid submission", async () => {
    (authApi.changePin as jest.Mock).mockResolvedValue({ success: true });

    const { getByLabelText, getByRole } = render(<ChangePinModal {...defaultProps} />);

    fireEvent.changeText(getByLabelText("Current PIN"), "1234");
    fireEvent.changeText(getByLabelText("New PIN"), "5678");
    fireEvent.changeText(getByLabelText("Confirm New PIN"), "5678");

    fireEvent.press(getByRole("button", { name: "Change PIN" }));

    await waitFor(() => {
      expect(authApi.changePin).toHaveBeenCalledWith("1234", "5678");
      expect(haptics.success).toHaveBeenCalled();
    });
  });
});
