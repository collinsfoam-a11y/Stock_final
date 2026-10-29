import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { FontSizeSlider } from "../FontSizeSlider";

jest.mock("../../../hooks/useUiTokens", () => ({
  useUiTokens: () => ({
    colors: {
      textPrimary: "#111827",
      textSecondary: "#6b7280",
      textMuted: "#9ca3af",
      accent: "#2563eb",
      accentStrong: "#1d4ed8",
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
    radius: { md: 8 },
    mode: "light",
  }),
}));

jest.mock("@expo/vector-icons/Ionicons", () => "Ionicons");

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
}));

describe("FontSizeSlider", () => {
  const defaultProps = {
    value: 16,
    onValueChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with current size label and sample text preview", () => {
    const { getByText } = render(<FontSizeSlider {...defaultProps} />);

    expect(getByText("Font Size")).toBeTruthy();
    expect(getByText("Medium")).toBeTruthy();
    expect(getByText("Sample Text Preview")).toBeTruthy();
  });

  it("configures accessible attributes on the slider component", () => {
    const { getByLabelText } = render(<FontSizeSlider {...defaultProps} />);

    const slider = getByLabelText("Font size");
    expect(slider).toBeTruthy();
    expect(slider.props.accessibilityRole).toBe("adjustable");
    expect(slider.props.accessibilityHint).toBe("Adjusts application font size");
    expect(slider.props.accessibilityValue).toEqual({
      min: 12,
      max: 22,
      now: 16,
      text: "Medium",
    });
  });

  it("triggers onValueChange when the slider value changes", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <FontSizeSlider value={16} onValueChange={onValueChange} />
    );

    const slider = getByLabelText("Font size");
    fireEvent(slider, "valueChange", 18);

    expect(onValueChange).toHaveBeenCalledWith(18);
  });
});
