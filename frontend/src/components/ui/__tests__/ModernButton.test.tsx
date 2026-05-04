import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernButton } from "../ModernButton";
import { haptics } from "../../../services/haptics";

jest.mock("../../../services/haptics", () => ({
  haptics: {
    light: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("ModernButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with title", () => {
    const { getByText } = render(
      <ModernButton title="Test Button" onPress={() => {}} />
    );
    expect(getByText("Test Button")).toBeTruthy();
  });

  it("calls onPress and triggers haptic on press", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ModernButton title="Press Me" onPress={onPress} />
    );

    fireEvent.press(getByText("Press Me"));

    expect(onPress).toHaveBeenCalled();
    expect(haptics.light).toHaveBeenCalled();
  });

  it("forwards the event argument to onPress", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ModernButton title="Press Me" onPress={onPress} />
    );

    const mockEvent = { nativeEvent: { pageX: 10, pageY: 20 } };
    fireEvent.press(getByText("Press Me"), mockEvent);

    expect(onPress).toHaveBeenCalledWith(expect.objectContaining(mockEvent));
  });

  it("does not crash when onPress is missing", () => {
    const { getByText } = render(
      <ModernButton title="No Handler" onPress={undefined as any} />
    );

    expect(() => fireEvent.press(getByText("No Handler"))).not.toThrow();
  });

  it("shows loading state and updates accessibility label", () => {
    const { getByLabelText } = render(
      <ModernButton title="Submit" onPress={() => {}} loading={true} />
    );

    expect(getByLabelText("Loading, Submit")).toBeTruthy();
  });

  it("does not trigger onPress or haptic when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ModernButton title="Disabled" onPress={onPress} disabled={true} />
    );

    fireEvent.press(getByText("Disabled"));

    expect(onPress).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("does not trigger onPress or haptic when loading", () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <ModernButton title="Loading" onPress={onPress} loading={true} />
    );

    fireEvent.press(getByLabelText("Loading, Loading"));

    expect(onPress).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });
});
