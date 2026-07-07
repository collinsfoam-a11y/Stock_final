import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ThemePicker } from "../ThemePicker";
import { haptics } from "@/services/haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    selection: jest.fn(),
  },
}));

// Mock useSettingsStore
jest.mock("../../../store/settingsStore", () => ({
  useSettingsStore: (selector: any) => {
    const state = {
      settings: { theme: "light" },
      setSetting: jest.fn(),
    };
    return selector(state);
  },
}));

describe("ThemePicker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with accessibility props", () => {
    const { getByLabelText, UNSAFE_getAllByType } = render(<ThemePicker />);

    const lightButton = getByLabelText("Light Mode");
    const darkButton = getByLabelText("Dark Mode");

    expect(lightButton).toBeTruthy();
    expect(darkButton).toBeTruthy();
    expect(lightButton.props.accessibilityRole).toBe("button");
    expect(darkButton.props.accessibilityRole).toBe("button");

    // Check that icons are hidden from accessibility
    const icons = UNSAFE_getAllByType(Ionicons);
    icons.forEach(icon => {
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
    });
  });

  it("triggers selection haptic and calls setSetting when a theme is pressed", () => {
    const { getByLabelText } = render(<ThemePicker />);
    const darkButton = getByLabelText("Dark Mode");

    fireEvent.press(darkButton);

    expect(haptics.selection).toHaveBeenCalled();
  });

  it("reflects selected state in accessibilityState", () => {
    const { getByLabelText } = render(<ThemePicker />);

    const lightButton = getByLabelText("Light Mode");
    const darkButton = getByLabelText("Dark Mode");

    // Based on our mock, light is selected
    expect(lightButton.props.accessibilityState.selected).toBe(true);
    expect(darkButton.props.accessibilityState.selected).toBe(false);
  });
});
