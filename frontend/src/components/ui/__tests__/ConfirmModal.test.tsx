import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ConfirmModal } from "../ConfirmModal";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

// Mock Modal component to just render children
jest.mock("../Modal", () => ({
  Modal: ({ children, visible }: any) => (visible ? children : null),
}));

describe("ConfirmModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    title: "Confirm Action",
    message: "Are you sure?",
    onConfirm: jest.fn(),
  };

  it("renders correctly with title and message", () => {
    const { getByText } = render(<ConfirmModal {...defaultProps} />);
    expect(getByText("Confirm Action")).toBeTruthy();
    expect(getByText("Are you sure?")).toBeTruthy();
  });

  it("calls onConfirm and triggers haptics when confirm is pressed", async () => {
    const onConfirm = jest.fn();
    const { getByLabelText } = render(
      <ConfirmModal {...defaultProps} onConfirm={onConfirm} confirmLabel="Yes, Delete" />
    );

    fireEvent.press(getByLabelText("Yes, Delete"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalled();
  });

  it("calls onCancel and triggers haptics when cancel is pressed", () => {
    const onCancel = jest.fn();
    const { getByLabelText } = render(
      <ConfirmModal {...defaultProps} onCancel={onCancel} cancelLabel="No, Stay" />
    );

    fireEvent.press(getByLabelText("No, Stay"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalled();
  });

  it("calls onClose when cancel is pressed and onCancel is not provided", () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <ConfirmModal {...defaultProps} onClose={onClose} cancelLabel="Cancel" />
    );

    fireEvent.press(getByLabelText("Cancel"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables buttons when loading is true", () => {
    const onConfirm = jest.fn();
    const { getByLabelText } = render(
      <ConfirmModal {...defaultProps} onConfirm={onConfirm} loading={true} confirmLabel="Confirm" cancelLabel="Cancel" />
    );

    fireEvent.press(getByLabelText("Confirm"));
    fireEvent.press(getByLabelText("Cancel"));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });
});
