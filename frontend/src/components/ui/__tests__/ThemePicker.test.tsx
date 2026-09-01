import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { ThemePicker } from "../ThemePicker";
import { useSettingsStore } from "@/store/settingsStore";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    selection: jest.fn(),
  },
}));

// Mock authApi to prevent connectionManager or backend sync errors in store tests
jest.mock("@/services/api/authApi", () => ({
  authApi: {
    getUserSettings: jest.fn().mockResolvedValue({ theme: "light" }),
    updateUserSettings: jest.fn().mockResolvedValue({ success: true }),
  },
}));

describe("ThemePicker Component", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        theme: "light",
      },
    });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("renders Light and Dark theme options correctly", () => {
    const { getByText, getByLabelText } = render(<ThemePicker />);

    expect(getByText("Appearance Mode")).toBeTruthy();
    expect(getByText("Light")).toBeTruthy();
    expect(getByText("Dark")).toBeTruthy();

    expect(getByLabelText("Light theme")).toBeTruthy();
    expect(getByLabelText("Dark theme")).toBeTruthy();
  });

  it("applies correct accessibility properties and selected states", () => {
    const { getByLabelText } = render(<ThemePicker />);

    const lightButton = getByLabelText("Light theme");
    const darkButton = getByLabelText("Dark theme");

    expect(lightButton.props.accessibilityRole).toBe("button");
    expect(darkButton.props.accessibilityRole).toBe("button");

    expect(lightButton.props.accessibilityState.selected).toBe(true);
    expect(darkButton.props.accessibilityState.selected).toBe(false);
  });

  it("triggers selection haptics and updates settings on press", () => {
    const { getByLabelText } = render(<ThemePicker />);

    const darkButton = getByLabelText("Dark theme");
    fireEvent.press(darkButton);

    expect(haptics.selection).toHaveBeenCalled();
    expect(useSettingsStore.getState().settings.theme).toBe("dark");

    act(() => {
      jest.advanceTimersByTime(500);
    });
  });
});
