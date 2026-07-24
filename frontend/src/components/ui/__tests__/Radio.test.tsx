import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Radio, RadioOption } from "../Radio";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

const OPTIONS: RadioOption[] = [
  { value: "option1", label: "Option 1", description: "First option description" },
  { value: "option2", label: "Option 2" },
  { value: "option3", label: "Option 3", disabled: true },
];

describe("Radio Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders multiple options correctly with their labels and descriptions", () => {
    const { getByText } = render(
      <Radio options={OPTIONS} value="option1" onChange={() => {}} />
    );

    expect(getByText("Option 1")).toBeTruthy();
    expect(getByText("First option description")).toBeTruthy();
    expect(getByText("Option 2")).toBeTruthy();
    expect(getByText("Option 3")).toBeTruthy();
  });

  it("calls onChange and triggers light haptics when an enabled option is pressed", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <Radio options={OPTIONS} value="option1" onChange={onChange} />
    );

    fireEvent.press(getByLabelText("Option 2"));

    expect(onChange).toHaveBeenCalledWith("option2");
    expect(haptics.light).toHaveBeenCalled();
  });

  it("does not call onChange or trigger haptics when a disabled option is pressed", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <Radio options={OPTIONS} value="option1" onChange={onChange} />
    );

    fireEvent.press(getByLabelText("Option 3"));

    expect(onChange).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("applies correct accessibility attributes and states", () => {
    const { getByLabelText } = render(
      <Radio options={OPTIONS} value="option2" onChange={() => {}} />
    );

    const option1 = getByLabelText("Option 1");
    const option2 = getByLabelText("Option 2");
    const option3 = getByLabelText("Option 3");

    // Verify accessibilityRole
    expect(option1.props.accessibilityRole).toBe("radio");
    expect(option2.props.accessibilityRole).toBe("radio");
    expect(option3.props.accessibilityRole).toBe("radio");

    // Verify accessibilityState.selected
    expect(option1.props.accessibilityState.selected).toBe(false);
    expect(option2.props.accessibilityState.selected).toBe(true);

    // Verify accessibilityState.disabled
    expect(option1.props.accessibilityState.disabled).toBe(false);
    expect(option3.props.accessibilityState.disabled).toBe(true);
  });
});
