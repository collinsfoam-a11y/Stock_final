import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { FontStylePicker } from "../FontStylePicker";
import { haptics } from "../../../services/haptics";

jest.mock("../../../services/haptics", () => ({
  haptics: {
    selection: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@expo/vector-icons/Ionicons", () => "Ionicons");

describe("FontStylePicker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders all font style options with correct labels and accessibility properties", () => {
    const onValueChange = jest.fn();
    const { getByLabelText, getByText } = render(
      <FontStylePicker value="system" onValueChange={onValueChange} />
    );

    expect(getByText("Font Style")).toBeTruthy();

    const systemBtn = getByLabelText("System font style");
    const serifBtn = getByLabelText("Serif font style");
    const monoBtn = getByLabelText("Mono font style");

    expect(systemBtn).toBeTruthy();
    expect(serifBtn).toBeTruthy();
    expect(monoBtn).toBeTruthy();

    expect(systemBtn.props.accessibilityRole).toBe("button");
    expect(systemBtn.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true, disabled: false })
    );
    expect(serifBtn.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false, disabled: false })
    );
  });

  it("triggers selection callback and centralized haptics when an option is pressed", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <FontStylePicker value="system" onValueChange={onValueChange} />
    );

    fireEvent.press(getByLabelText("Serif font style"));

    expect(haptics.selection).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("serif");
  });

  it("does not trigger callback or haptics when disabled", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <FontStylePicker value="system" onValueChange={onValueChange} disabled={true} />
    );

    const serifBtn = getByLabelText("Serif font style");
    expect(serifBtn.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );

    fireEvent.press(serifBtn);

    expect(haptics.selection).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("hides header icon from screen readers as decorative", () => {
    const { UNSAFE_getByType } = render(
      <FontStylePicker value="system" onValueChange={jest.fn()} />
    );

    const icon = UNSAFE_getByType(Ionicons);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
    expect(icon.props["aria-hidden"]).toBe(true);
  });
});
