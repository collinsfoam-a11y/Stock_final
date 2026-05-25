import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
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
});
