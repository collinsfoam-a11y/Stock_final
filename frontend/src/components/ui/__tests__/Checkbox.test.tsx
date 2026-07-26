import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Checkbox } from "../Checkbox";
import { haptics } from "@/services/haptics";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("Checkbox Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with label and description", () => {
    const { getByText } = render(
      <Checkbox
        checked={false}
        onChange={() => {}}
        label="Test Checkbox"
        description="This is a description"
      />
    );

    expect(getByText("Test Checkbox")).toBeTruthy();
    expect(getByText("This is a description")).toBeTruthy();
  });

  it("applies correct accessibility attributes", () => {
    const { getByRole, UNSAFE_getByType } = render(
      <Checkbox
        checked={true}
        onChange={() => {}}
        label="Test Checkbox"
      />
    );

    const checkboxTouchable = getByRole("checkbox");
    expect(checkboxTouchable.props.accessibilityLabel).toBe("Test Checkbox");
    expect(checkboxTouchable.props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
    });

    const icon = UNSAFE_getByType(Ionicons);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
  });

  it("maps mixed/indeterminate state to accessibilityState.checked", () => {
    const { getByRole } = render(
      <Checkbox
        checked={false}
        indeterminate={true}
        onChange={() => {}}
        label="Test Checkbox"
      />
    );

    const checkboxTouchable = getByRole("checkbox");
    expect(checkboxTouchable.props.accessibilityState.checked).toBe("mixed");
  });

  it("calls onChange and triggers haptics when pressed", () => {
    const onChangeMock = jest.fn();
    const { getByRole } = render(
      <Checkbox
        checked={false}
        onChange={onChangeMock}
        label="Test Checkbox"
      />
    );

    fireEvent.press(getByRole("checkbox"));
    expect(onChangeMock).toHaveBeenCalledWith(true);
    expect(haptics.light).toHaveBeenCalled();
  });

  it("does not call onChange or trigger haptics when disabled", () => {
    const onChangeMock = jest.fn();
    const { getByRole } = render(
      <Checkbox
        checked={false}
        disabled={true}
        onChange={onChangeMock}
        label="Test Checkbox"
      />
    );

    const checkboxTouchable = getByRole("checkbox");
    expect(checkboxTouchable.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(checkboxTouchable);
    expect(onChangeMock).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });
});
