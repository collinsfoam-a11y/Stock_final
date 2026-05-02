import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernInput } from "../ModernInput";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {
    Light: "light",
  },
}));

describe("ModernInput", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(
      <ModernInput
        label="Test Label"
        value=""
        onChangeText={() => {}}
      />
    );
    expect(getByText("Test Label")).toBeTruthy();
  });

  it("calls onChangeText when text changes", () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <ModernInput
        placeholder="Enter text"
        value=""
        onChangeText={onChangeText}
      />
    );

    fireEvent.changeText(getByPlaceholderText("Enter text"), "Hello");
    expect(onChangeText).toHaveBeenCalledWith("Hello");
  });

  it("shows clear button when showClearButton is true and value is not empty", () => {
    const { queryByLabelText } = render(
      <ModernInput
        showClearButton={true}
        value="Some text"
        onChangeText={() => {}}
      />
    );

    expect(queryByLabelText("Clear input")).toBeTruthy();
  });

  it("does not show clear button when showClearButton is false", () => {
    const { queryByLabelText } = render(
      <ModernInput
        showClearButton={false}
        value="Some text"
        onChangeText={() => {}}
      />
    );

    expect(queryByLabelText("Clear input")).toBeNull();
  });

  it("does not show clear button when value is empty", () => {
    const { queryByLabelText } = render(
      <ModernInput
        showClearButton={true}
        value=""
        onChangeText={() => {}}
      />
    );

    expect(queryByLabelText("Clear input")).toBeNull();
  });

  it("clears input and triggers haptic when clear button is pressed", () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = render(
      <ModernInput
        showClearButton={true}
        value="Some text"
        onChangeText={onChangeText}
      />
    );

    fireEvent.press(getByLabelText("Clear input"));

    expect(onChangeText).toHaveBeenCalledWith("");
    if (Platform.OS !== "web") {
      expect(Haptics.impactAsync).toHaveBeenCalled();
    }
  });

  it("does not show clear button when disabled", () => {
    const { queryByLabelText } = render(
      <ModernInput
        disabled={true}
        showClearButton={true}
        value="Some text"
        onChangeText={() => {}}
      />
    );

    expect(queryByLabelText("Clear input")).toBeNull();
  });
});
