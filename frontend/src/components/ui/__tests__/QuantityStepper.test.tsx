import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { QuantityStepper } from "../QuantityStepper";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("QuantityStepper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with initial value", () => {
    const { getByText } = render(<QuantityStepper value={5} onChange={() => {}} />);
    expect(getByText("5")).toBeTruthy();
  });

  it("calls onChange and triggers haptics when incrementing", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<QuantityStepper value={5} onChange={onChange} />);

    fireEvent.press(getByLabelText("Increase quantity"));

    expect(onChange).toHaveBeenCalledWith(6);
    expect(haptics.light).toHaveBeenCalled();
  });

  it("calls onChange and triggers haptics when decrementing", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<QuantityStepper value={5} onChange={onChange} />);

    fireEvent.press(getByLabelText("Decrease quantity"));

    expect(onChange).toHaveBeenCalledWith(4);
    expect(haptics.light).toHaveBeenCalled();
  });

  it("respects min value and disables decrement button", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <QuantityStepper value={0} min={0} onChange={onChange} />
    );

    const decrementButton = getByLabelText("Decrease quantity");
    expect(decrementButton.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(decrementButton);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("respects max value and disables increment button", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <QuantityStepper value={10} max={10} onChange={onChange} />
    );

    const incrementButton = getByLabelText("Increase quantity");
    expect(incrementButton.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(incrementButton);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables both buttons when disabled prop is true", () => {
    const { getByLabelText } = render(
      <QuantityStepper value={5} onChange={() => {}} disabled={true} />
    );

    const decrementButton = getByLabelText("Decrease quantity");
    const incrementButton = getByLabelText("Increase quantity");

    expect(decrementButton.props.accessibilityState.disabled).toBe(true);
    expect(incrementButton.props.accessibilityState.disabled).toBe(true);
  });

  it("has correct accessibility roles", () => {
    const { getByLabelText } = render(<QuantityStepper value={5} onChange={() => {}} />);

    expect(getByLabelText("Decrease quantity").props.accessibilityRole).toBe("button");
    expect(getByLabelText("Increase quantity").props.accessibilityRole).toBe("button");
  });
});
