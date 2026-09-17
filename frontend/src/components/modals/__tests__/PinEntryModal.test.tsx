import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { PinEntryModal } from "../PinEntryModal";
import { haptics } from "@/services/haptics";
import { verifyPin } from "@/services/api/api";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
    medium: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("@/services/api/api", () => ({
  verifyPin: jest.fn(),
}));

describe("PinEntryModal", () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onSuccess: jest.fn(),
    action: "delete_scan",
    staffUsername: "staff1",
    entityId: "123",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders inputs with proper accessibility labels and hints", () => {
    const { getByLabelText } = render(<PinEntryModal {...defaultProps} />);

    const usernameInput = getByLabelText("Supervisor Username");
    const pinInput = getByLabelText("Supervisor PIN");
    const reasonInput = getByLabelText("Reason for Override");

    expect(usernameInput).toBeTruthy();
    expect(pinInput).toBeTruthy();
    expect(reasonInput).toBeTruthy();

    expect(usernameInput.props.accessibilityHint).toBe(
      "Enter the supervisor username for override"
    );
    expect(pinInput.props.accessibilityHint).toBe(
      "Enter the numeric PIN for supervisor authorization"
    );
    expect(reasonInput.props.accessibilityHint).toBe(
      "Enter the reason why supervisor override is required"
    );
  });

  it("triggers haptics.light and onClose when Cancel button is pressed", () => {
    const { getByLabelText } = render(<PinEntryModal {...defaultProps} />);

    fireEvent.press(getByLabelText("Cancel"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("triggers haptics.error and displays alert role message when submitting empty fields", () => {
    const { getByLabelText, getByRole } = render(<PinEntryModal {...defaultProps} />);

    fireEvent.press(getByLabelText("Authorize"));

    expect(haptics.error).toHaveBeenCalledTimes(1);
    const errorAlert = getByRole("alert");
    expect(errorAlert).toBeTruthy();
    expect(errorAlert.props.children).toBe("All fields are required");
  });

  it("triggers haptics.medium, verifyPin, and haptics.success on successful authorization", async () => {
    (verifyPin as jest.Mock).mockResolvedValueOnce({ success: true });

    const { getByLabelText } = render(<PinEntryModal {...defaultProps} />);

    fireEvent.changeText(getByLabelText("Supervisor Username"), "sup1");
    fireEvent.changeText(getByLabelText("Supervisor PIN"), "1234");
    fireEvent.changeText(getByLabelText("Reason for Override"), "Correction needed");

    await act(async () => {
      fireEvent.press(getByLabelText("Authorize"));
    });

    expect(haptics.medium).toHaveBeenCalledTimes(1);
    expect(verifyPin).toHaveBeenCalledWith({
      supervisor_username: "sup1",
      pin: "1234",
      action: "delete_scan",
      reason: "Correction needed",
      staff_username: "staff1",
      entity_id: "123",
    });

    await waitFor(() => {
      expect(haptics.success).toHaveBeenCalledTimes(1);
      expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("triggers haptics.error and displays error alert on failed verification", async () => {
    (verifyPin as jest.Mock).mockResolvedValueOnce({ success: false });

    const { getByLabelText, getByRole } = render(<PinEntryModal {...defaultProps} />);

    fireEvent.changeText(getByLabelText("Supervisor Username"), "sup1");
    fireEvent.changeText(getByLabelText("Supervisor PIN"), "0000");
    fireEvent.changeText(getByLabelText("Reason for Override"), "Correction needed");

    await act(async () => {
      fireEvent.press(getByLabelText("Authorize"));
    });

    expect(haptics.error).toHaveBeenCalledTimes(1);
    const errorAlert = getByRole("alert");
    expect(errorAlert).toBeTruthy();
    expect(errorAlert.props.children).toBe("Invalid credentials or insufficient permissions");
  });
});
