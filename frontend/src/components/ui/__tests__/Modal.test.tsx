import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { Modal } from "../Modal";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("Modal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders title with header role and close button with accessible props", () => {
    const onClose = jest.fn();
    const { getByText, getByLabelText } = render(
      <Modal visible={true} onClose={onClose} title="Settings Dialog">
        <Text>Modal Content</Text>
      </Modal>
    );

    const titleElement = getByText("Settings Dialog");
    expect(titleElement.props.accessibilityRole).toBe("header");

    const closeButton = getByLabelText("Close Settings Dialog");
    expect(closeButton).toBeTruthy();

    fireEvent.press(closeButton);
    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("triggers haptics.light and onClose on backdrop press when closeOnBackdropPress is true", () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <Modal visible={true} onClose={onClose} closeOnBackdropPress={true}>
        <Text>Modal Content</Text>
      </Modal>
    );

    const backdrop = getByLabelText("Close modal backdrop");
    expect(backdrop.props.accessibilityRole).toBe("button");
    expect(backdrop.props.accessibilityHint).toBe("Navigates out of the modal dialog");

    fireEvent.press(backdrop);
    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not trigger onClose on backdrop press when closeOnBackdropPress is false", () => {
    const onClose = jest.fn();
    const { queryByLabelText } = render(
      <Modal visible={true} onClose={onClose} closeOnBackdropPress={false}>
        <Text>Modal Content</Text>
      </Modal>
    );

    expect(queryByLabelText("Close modal backdrop")).toBeNull();
  });
});
