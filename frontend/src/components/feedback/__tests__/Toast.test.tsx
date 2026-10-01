import React from "react";
import { render } from "@testing-library/react-native";
import { Toast } from "../Toast";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    light: jest.fn(),
  },
}));

describe("Toast", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders message and sets appropriate accessibility attributes", () => {
    const { getByText, getByLabelText } = render(
      <Toast
        message="Item added successfully"
        type="success"
        visible={true}
        onHide={jest.fn()}
      />
    );

    expect(getByText("Item added successfully")).toBeTruthy();

    const toastContainer = getByLabelText("success notification: Item added successfully");
    expect(toastContainer).toBeTruthy();
    expect(toastContainer.props.accessibilityRole).toBe("alert");
  });

  it("triggers success haptic feedback when visible with success type", () => {
    render(
      <Toast
        message="Operation successful"
        type="success"
        visible={true}
        onHide={jest.fn()}
      />
    );

    expect(haptics.success).toHaveBeenCalledTimes(1);
  });

  it("triggers error haptic feedback when visible with error type", () => {
    render(
      <Toast
        message="Failed to save data"
        type="error"
        visible={true}
        onHide={jest.fn()}
      />
    );

    expect(haptics.error).toHaveBeenCalledTimes(1);
  });

  it("triggers warning haptic feedback when visible with warning type", () => {
    render(
      <Toast
        message="Low battery level"
        type="warning"
        visible={true}
        onHide={jest.fn()}
      />
    );

    expect(haptics.warning).toHaveBeenCalledTimes(1);
  });

  it("triggers light haptic feedback when visible with default/info type", () => {
    render(
      <Toast
        message="New update available"
        type="info"
        visible={true}
        onHide={jest.fn()}
      />
    );

    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("does not render when visible is false", () => {
    const { queryByText } = render(
      <Toast
        message="Hidden toast"
        visible={false}
        onHide={jest.fn()}
      />
    );

    expect(queryByText("Hidden toast")).toBeNull();
  });
});
