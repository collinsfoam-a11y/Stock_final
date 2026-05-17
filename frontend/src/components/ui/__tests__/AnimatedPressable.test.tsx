import React from "react";
import { Platform, Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";

import { AnimatedPressable } from "../AnimatedPressable";

describe("AnimatedPressable", () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatformOS,
    });
  });

  it("does not trigger haptics on web press interactions", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });

    const { getByText } = render(
      <AnimatedPressable onPress={() => undefined}>
        <Text>Tap me</Text>
      </AnimatedPressable>,
    );

    fireEvent(getByText("Tap me"), "pressIn");

    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
