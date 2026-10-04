import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { RackProgressCard } from "../RackProgressCard";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("RackProgressCard Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with rack name, percentage, and verification statistics", () => {
    const { getByText } = render(
      <RackProgressCard
        rack="A-12"
        total={20}
        counted={15}
        percentage={75}
      />
    );

    expect(getByText("Rack A-12")).toBeTruthy();
    expect(getByText("75%")).toBeTruthy();
    expect(getByText("15 / 20 items verified")).toBeTruthy();
  });

  it("triggers haptics.light and calls onPress when pressed", () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <RackProgressCard
        rack="A-12"
        total={20}
        counted={15}
        percentage={75}
        onPress={onPress}
      />
    );

    const card = getByRole("button");
    fireEvent.press(card);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("applies correct accessibility attributes and selected state", () => {
    const { getByRole } = render(
      <RackProgressCard
        rack="B-05"
        total={10}
        counted={10}
        percentage={100}
        isSelected={true}
      />
    );

    const button = getByRole("button");
    expect(button.props.accessibilityLabel).toBe(
      "Rack B-05, 100% completed. 10 of 10 items verified."
    );
    expect(button.props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it("hides decorative icons from screen readers", () => {
    const { UNSAFE_getByType } = render(
      <RackProgressCard
        rack="C-01"
        total={5}
        counted={1}
        percentage={20}
      />
    );

    // Get Ionicons component
    const icon = UNSAFE_getByType("Ionicons" as React.ComponentType<any>);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
    expect(icon.props["aria-hidden"]).toBe(true);
  });
});
