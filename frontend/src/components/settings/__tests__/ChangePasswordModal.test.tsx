import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ChangePasswordModal } from "../ChangePasswordModal";
import { haptics } from "@/services/haptics";

jest.mock("../../../context/ThemeContext", () => ({
  useThemeContext: () => ({
    themeLegacy: {
      colors: {
        surface: "#ffffff",
        text: "#111827",
        textSecondary: "#6b7280",
        border: "#d1d5db",
        background: "#f9fafb",
        danger: "#ef4444",
        accent: "#2563eb",
        success: "#10b981",
      },
    },
  }),
}));

jest.mock("../../../services/api/authApi", () => ({
  authApi: {
    changePassword: jest.fn(),
  },
}));

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("ChangePasswordModal", () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with proper accessibility header role and form input labels", () => {
    const { getByRole, getByLabelText } = render(<ChangePasswordModal {...defaultProps} />);

    const titleElement = getByRole("header", { name: "Change Password" });
    expect(titleElement).toBeTruthy();

    expect(getByLabelText("Current Password")).toBeTruthy();
    expect(getByLabelText("New Password")).toBeTruthy();
    expect(getByLabelText("Confirm New Password")).toBeTruthy();
  });

  it("toggles password visibility with tactile haptic feedback", () => {
    const { getByLabelText } = render(<ChangePasswordModal {...defaultProps} />);

    const showButton = getByLabelText("Show current password");
    expect(showButton).toBeTruthy();

    fireEvent.press(showButton);

    expect(haptics.light).toHaveBeenCalled();
    expect(getByLabelText("Hide current password")).toBeTruthy();
  });

  it("displays password strength progressbar accessibility properties when new password is entered", () => {
    const { getByLabelText, getByRole } = render(<ChangePasswordModal {...defaultProps} />);

    const newPasswordInput = getByLabelText("New Password");
    fireEvent.changeText(newPasswordInput, "Abc12345");

    const progressBar = getByRole("progressbar");
    expect(progressBar).toBeTruthy();
    expect(progressBar.props.accessibilityValue).toEqual({
      min: 0,
      max: 4,
      now: 4,
    });
    expect(progressBar.props.accessibilityLabel).toContain("Password strength: 4 of 4 requirements met");
  });

  it("triggers tactile feedback and calls onClose when Cancel is pressed", () => {
    const { getByLabelText } = render(<ChangePasswordModal {...defaultProps} />);

    const cancelButton = getByLabelText("Cancel changing password");
    fireEvent.press(cancelButton);

    expect(haptics.light).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
