import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { QuantityStepper } from "../QuantityStepper";
import { haptics } from "../../../services/haptics";

// Mock haptics service
jest.mock("../../../services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

// Mock theme context
jest.mock("../../../context/ThemeContext", () => ({
  useThemeContext: () => ({
    themeLegacy: {
      colors: {
        surfaceElevated: "#fff",
        border: "#ccc",
        surface: "#eee",
        text: "#000",
      },
    },
  }),
}));

describe("QuantityStepper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with initial value", () => {
    const { getByText, getByLabelText } = render(
      <QuantityStepper value={5} onChange={() => {}} />
    );
    expect(getByText("5")).toBeTruthy();
    expect(getByLabelText("Current quantity: 5")).toBeTruthy();
  });

  it("calls onChange with incremented value when plus is pressed", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <QuantityStepper value={5} onChange={onChange} />
    );

    fireEvent.press(getByLabelText("Increase quantity"));

    expect(onChange).toHaveBeenCalledWith(6);
    expect(haptics.light).toHaveBeenCalled();
  });

  it("calls onChange with decremented value when minus is pressed", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <QuantityStepper value={5} onChange={onChange} />
    );

    fireEvent.press(getByLabelText("Decrease quantity"));

    expect(onChange).toHaveBeenCalledWith(4);
    expect(haptics.light).toHaveBeenCalled();
  });

  it("disables decrement button when value is at min", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <QuantityStepper value={0} min={0} onChange={onChange} />
    );

    const decrementButton = getByLabelText("Decrease quantity");
    fireEvent.press(decrementButton);

    expect(onChange).not.toHaveBeenCalled();
    expect(decrementButton.props.accessibilityState.disabled).toBe(true);
  });

  it("disables increment button when value is at max", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <QuantityStepper value={10} max={10} onChange={onChange} />
    );

    const incrementButton = getByLabelText("Increase quantity");
    fireEvent.press(incrementButton);

    expect(onChange).not.toHaveBeenCalled();
    expect(incrementButton.props.accessibilityState.disabled).toBe(true);
  });

  it("disables both buttons when disabled prop is true", () => {
    const { getByLabelText } = render(
      <QuantityStepper value={5} onChange={() => {}} disabled={true} />
    );

    expect(getByLabelText("Decrease quantity").props.accessibilityState.disabled).toBe(true);
    expect(getByLabelText("Increase quantity").props.accessibilityState.disabled).toBe(true);
  });

  it("applies hitSlop to buttons", () => {
    const { getByLabelText } = render(
      <QuantityStepper value={5} onChange={() => {}} />
    );

    const decrementButton = getByLabelText("Decrease quantity");
    const incrementButton = getByLabelText("Increase quantity");

    expect(decrementButton.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
    expect(incrementButton.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
  });
});
