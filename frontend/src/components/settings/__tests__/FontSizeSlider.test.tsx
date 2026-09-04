import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { FontSizeSlider } from "../FontSizeSlider";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    selection: jest.fn(),
  },
}));

describe("FontSizeSlider Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with default props and displays current size label", () => {
    const { getByText } = render(
      <FontSizeSlider value={16} onValueChange={jest.fn()} />
    );

    expect(getByText("Font Size")).toBeTruthy();
    expect(getByText("Medium")).toBeTruthy();
    expect(getByText("Sample Text Preview")).toBeTruthy();
  });

  it("has correct accessibility attributes on slider and preview container", () => {
    const { getByLabelText } = render(
      <FontSizeSlider value={18} onValueChange={jest.fn()} />
    );

    const slider = getByLabelText("Font size");
    expect(slider).toBeTruthy();
    expect(slider.props.accessibilityValue).toEqual({
      min: 12,
      max: 22,
      now: 18,
      text: "Large",
    });

    const preview = getByLabelText("Sample Text Preview, Large");
    expect(preview).toBeTruthy();
    expect(preview.props.accessibilityRole).toBe("text");
  });

  it("triggers haptic feedback and onValueChange callback when slider value changes", () => {
    const onValueChangeMock = jest.fn();
    const { getByLabelText } = render(
      <FontSizeSlider value={16} onValueChange={onValueChangeMock} />
    );

    const slider = getByLabelText("Font size");
    fireEvent(slider, "valueChange", 18);

    expect(haptics.selection).toHaveBeenCalledTimes(1);
    expect(onValueChangeMock).toHaveBeenCalledWith(18);
  });

  it("does not trigger haptics or callback if value snaps to same value", () => {
    const onValueChangeMock = jest.fn();
    const { getByLabelText } = render(
      <FontSizeSlider value={16} onValueChange={onValueChangeMock} step={2} />
    );

    const slider = getByLabelText("Font size");
    fireEvent(slider, "valueChange", 16.2); // Snaps to 16

    expect(haptics.selection).not.toHaveBeenCalled();
    expect(onValueChangeMock).not.toHaveBeenCalled();
  });
});
