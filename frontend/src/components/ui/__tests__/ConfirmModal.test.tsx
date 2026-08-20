import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ConfirmModal } from "../ConfirmModal";
import { haptics } from "@/services/haptics";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
    medium: jest.fn(),
  },
}));

describe("ConfirmModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("triggers haptics.light on cancel press", () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <ConfirmModal
        visible={true}
        onClose={onClose}
        title="Test Title"
        message="Test Message"
        onConfirm={() => {}}
      />
    );

    fireEvent.press(getByLabelText("Cancel"));
    expect(haptics.light).toHaveBeenCalled();
  });

  it("triggers haptics.light on confirm press (default)", () => {
    const onConfirm = jest.fn();
    const { getByLabelText } = render(
      <ConfirmModal
        visible={true}
        onClose={() => {}}
        title="Test Title"
        message="Test Message"
        onConfirm={onConfirm}
      />
    );

    fireEvent.press(getByLabelText("Confirm"));
    expect(haptics.light).toHaveBeenCalled();
  });

  it("triggers haptics.medium on confirm press (danger)", () => {
    const onConfirm = jest.fn();
    const { getByLabelText } = render(
      <ConfirmModal
        visible={true}
        onClose={() => {}}
        title="Test Title"
        message="Test Message"
        onConfirm={onConfirm}
        danger={true}
      />
    );

    fireEvent.press(getByLabelText("Confirm"));
    expect(haptics.medium).toHaveBeenCalled();
  });

  it("applies proper accessibility attributes to title, icon, and buttons", () => {
    const { getByText, getByLabelText, UNSAFE_getByType } = render(
      <ConfirmModal
        visible={true}
        onClose={() => {}}
        title="Test Title"
        message="Test Message"
        onConfirm={() => {}}
        loading={true}
      />
    );

    // Title accessibility header role
    const titleElement = getByText("Test Title");
    expect(titleElement.props.accessibilityRole).toBe("header");

    // Decorative icon
    const iconElement = UNSAFE_getByType(Ionicons);
    expect(iconElement.props.accessibilityElementsHidden).toBe(true);
    expect(iconElement.props.importantForAccessibility).toBe("no");

    // Confirm button accessibility state when loading
    const confirmBtn = getByLabelText("Confirm");
    expect(confirmBtn.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });

    // Cancel button accessibility state when loading
    const cancelBtn = getByLabelText("Cancel");
    expect(cancelBtn.props.accessibilityState).toEqual({
      disabled: true,
    });
  });
});
