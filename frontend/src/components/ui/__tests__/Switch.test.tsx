import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Switch } from "../Switch";
import { haptics } from "@/services/haptics";
import { OPERATIONAL_HIT_SLOP } from "@/utils/accessibility";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("Switch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly", () => {
    const { getByRole } = render(
      <Switch value={false} onValueChange={() => {}} accessibilityLabel="Test Switch" />
    );
    expect(getByRole("switch")).toBeTruthy();
  });

  it("calls onValueChange when pressed", () => {
    const onValueChange = jest.fn();
    const { getByRole } = render(
      <Switch value={false} onValueChange={onValueChange} />
    );

    fireEvent.press(getByRole("switch"));

    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it("triggers haptics on press", () => {
    const { getByRole } = render(
      <Switch value={false} onValueChange={() => {}} />
    );

    fireEvent.press(getByRole("switch"));

    expect(haptics.light).toHaveBeenCalled();
  });

  it("does not call onValueChange when disabled", () => {
    const onValueChange = jest.fn();
    const { getByRole } = render(
      <Switch value={false} onValueChange={onValueChange} disabled={true} />
    );

    fireEvent.press(getByRole("switch"));

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("applies correct accessibility state", () => {
    const { getByRole, rerender } = render(
      <Switch value={true} onValueChange={() => {}} />
    );

    expect(getByRole("switch").props.accessibilityState.checked).toBe(true);

    rerender(<Switch value={false} onValueChange={() => {}} />);
    expect(getByRole("switch").props.accessibilityState.checked).toBe(false);
  });

  it("applies accessibilityLabel", () => {
    const { getByLabelText } = render(
      <Switch value={false} onValueChange={() => {}} accessibilityLabel="Enable notifications" />
    );

    expect(getByLabelText("Enable notifications")).toBeTruthy();
  });

  it("applies hitSlop for better touch target", () => {
    const { getByRole } = render(
      <Switch value={false} onValueChange={() => {}} />
    );

    expect(getByRole("switch").props.hitSlop).toEqual(OPERATIONAL_HIT_SLOP.standard);
  });
});
