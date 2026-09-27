import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import {
  SettingsActionRow,
  SettingsTextInputRow,
  SettingsSectionHeading,
  SettingsActionSection,
} from "../SettingsScreenPrimitives";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    selection: jest.fn(),
    light: jest.fn(),
  },
}));

jest.mock("@expo/vector-icons/Ionicons", () => "Ionicons");

describe("SettingsScreenPrimitives", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("SettingsSectionHeading & SettingsActionSection", () => {
    it("renders heading title", () => {
      const { getByText } = render(<SettingsSectionHeading title="General Settings" />);
      expect(getByText("General Settings")).toBeTruthy();
    });

    it("renders action section with children", () => {
      const { getByText } = render(
        <SettingsActionSection title="Preferences">
          <SettingsSectionHeading title="Child Content" />
        </SettingsActionSection>
      );
      expect(getByText("Preferences")).toBeTruthy();
      expect(getByText("Child Content")).toBeTruthy();
    });
  });

  describe("SettingsTextInputRow", () => {
    it("renders text input row with label and decorative icon props", () => {
      const onChangeText = jest.fn();
      const { getByLabelText, UNSAFE_getByType } = render(
        <SettingsTextInputRow
          icon="search"
          label="Search Query"
          value="Test"
          onChangeText={onChangeText}
          description="Enter search text"
        />
      );

      expect(getByLabelText("Search Query")).toBeTruthy();

      const ionicon = UNSAFE_getByType("Ionicons" as any);
      expect(ionicon.props["aria-hidden"]).toBe(true);
      expect(ionicon.props.accessibilityElementsHidden).toBe(true);
    });

    it("handles text input changes", () => {
      const onChangeText = jest.fn();
      const { getByLabelText } = render(
        <SettingsTextInputRow
          icon="key"
          label="API Key"
          value=""
          onChangeText={onChangeText}
        />
      );

      fireEvent.changeText(getByLabelText("API Key"), "new-key");
      expect(onChangeText).toHaveBeenCalledWith("new-key");
    });
  });

  describe("SettingsActionRow", () => {
    it("renders button row and triggers haptics on press", () => {
      const onPress = jest.fn();
      const { getByRole, UNSAFE_getAllByType } = render(
        <SettingsActionRow
          icon="notifications"
          label="Notification Sounds"
          onPress={onPress}
          type="navigation"
        />
      );

      const button = getByRole("button");
      fireEvent.press(button);

      expect(onPress).toHaveBeenCalled();
      expect(haptics.selection).toHaveBeenCalled();

      const ionicons = UNSAFE_getAllByType("Ionicons" as any);
      ionicons.forEach((icon) => {
        expect(icon.props["aria-hidden"]).toBe(true);
      });
    });

    it("renders switch row and triggers haptics on toggle", () => {
      const onValueChange = jest.fn();
      const { getByRole, UNSAFE_getByType } = render(
        <SettingsActionRow
          icon="moon"
          label="Dark Mode"
          type="switch"
          value={false}
          onValueChange={onValueChange}
        />
      );

      const switchComp = getByRole("switch");
      fireEvent(switchComp, "valueChange", true);

      expect(onValueChange).toHaveBeenCalledWith(true);
      expect(haptics.light).toHaveBeenCalled();

      const ionicon = UNSAFE_getByType("Ionicons" as any);
      expect(ionicon.props["aria-hidden"]).toBe(true);
    });

    it("does not fire press handler when disabled", () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <SettingsActionRow
          icon="lock-closed"
          label="Locked Option"
          disabled={true}
          onPress={onPress}
        />
      );

      fireEvent.press(getByRole("button"));
      expect(onPress).not.toHaveBeenCalled();
      expect(haptics.selection).not.toHaveBeenCalled();
    });
  });
});
