import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernHeader } from "../ModernHeader";
import { haptics } from "@/services/haptics";
import { useAuthStore } from "../../../store/authStore";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

// Mock auth store
jest.mock("../../../store/authStore", () => ({
  useAuthStore: jest.fn(),
}));

describe("ModernHeader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthStore as unknown as jest.Mock).mockReturnValue({
      role: "staff",
    });
  });

  it("triggers haptics.light on back button press", () => {
    const { getByLabelText } = render(
      <ModernHeader showBackButton={true} onBackPress={() => {}} />
    );

    fireEvent.press(getByLabelText("Go back"));
    expect(haptics.light).toHaveBeenCalled();
  });

  it("triggers haptics.light on settings button press", () => {
    // Need to mock user to show settings
    (useAuthStore as unknown as jest.Mock).mockReturnValue({
      id: "1",
      role: "staff",
    });

    const { getByLabelText } = render(
      <ModernHeader showSettingsButton={true} />
    );

    fireEvent.press(getByLabelText("Open settings"));
    expect(haptics.light).toHaveBeenCalled();
  });

  it("triggers haptics.light on right action press", () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <ModernHeader
        rightAction={{
          icon: "add",
          onPress: onPress,
          label: "Add Item",
        }}
      />
    );

    fireEvent.press(getByLabelText("Add Item"));
    expect(haptics.light).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
  });
});
