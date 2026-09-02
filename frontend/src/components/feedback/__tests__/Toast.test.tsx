import React from "react";
import { render } from "@testing-library/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Toast } from "../Toast";
import { haptics } from "../../../services/haptics";

jest.mock("../../../services/haptics", () => ({
  haptics: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    light: jest.fn(),
  },
}));

describe("Toast Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with accessibility attributes and message", () => {
    const { getByLabelText, getByText } = render(
      <Toast message="Operation succeeded" type="success" visible={true} onHide={jest.fn()} />
    );

    const alertElement = getByLabelText("success notification: Operation succeeded");
    expect(alertElement).toBeTruthy();
    expect(alertElement.props.accessibilityRole).toBe("alert");

    expect(getByText("Operation succeeded")).toBeTruthy();
  });

  it("hides decorative icon from screen readers using getDecorativeIconProps", () => {
    const { UNSAFE_getByType } = render(
      <Toast message="Info toast" type="info" visible={true} onHide={jest.fn()} />
    );

    const icon = UNSAFE_getByType(Ionicons);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
    expect(icon.props["aria-hidden"]).toBe(true);
  });

  it("triggers haptics.success when a success toast becomes visible", () => {
    render(<Toast message="Success" type="success" visible={true} onHide={jest.fn()} />);

    expect(haptics.success).toHaveBeenCalledTimes(1);
  });

  it("triggers haptics.error when an error toast becomes visible", () => {
    render(<Toast message="Error occurred" type="error" visible={true} onHide={jest.fn()} />);

    expect(haptics.error).toHaveBeenCalledTimes(1);
  });

  it("triggers haptics.warning when a warning toast becomes visible", () => {
    render(<Toast message="Warning" type="warning" visible={true} onHide={jest.fn()} />);

    expect(haptics.warning).toHaveBeenCalledTimes(1);
  });

  it("triggers haptics.light when an info toast becomes visible", () => {
    render(<Toast message="Info message" type="info" visible={true} onHide={jest.fn()} />);

    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("returns null when not visible", () => {
    const { queryByLabelText } = render(
      <Toast message="Hidden" type="info" visible={false} onHide={jest.fn()} />
    );

    expect(queryByLabelText(/notification: Hidden/)).toBeNull();
  });
});
