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

  it("renders when visible with accessible label and hides decorative icon", () => {
    const { getByLabelText, getByText } = render(
      <Toast
        visible={true}
        message="Item saved successfully"
        type="success"
        onHide={jest.fn()}
      />
    );

    expect(getByText("Item saved successfully")).toBeTruthy();
    const alert = getByLabelText("success notification: Item saved successfully");
    expect(alert).toBeTruthy();
    expect(haptics.success).toHaveBeenCalled();
  });

  it("triggers haptics.error on error toast", () => {
    render(
      <Toast
        visible={true}
        message="Failed to save item"
        type="error"
        onHide={jest.fn()}
      />
    );

    expect(haptics.error).toHaveBeenCalled();
  });

  it("triggers haptics.warning on warning toast", () => {
    render(
      <Toast
        visible={true}
        message="Session expires soon"
        type="warning"
        onHide={jest.fn()}
      />
    );

    expect(haptics.warning).toHaveBeenCalled();
  });

  it("triggers haptics.light on info toast", () => {
    render(
      <Toast
        visible={true}
        message="Syncing in background"
        type="info"
        onHide={jest.fn()}
      />
    );

    expect(haptics.light).toHaveBeenCalled();
  });

  it("renders nothing when visible is false", () => {
    const { queryByText } = render(
      <Toast
        visible={false}
        message="Hidden toast"
        type="info"
        onHide={jest.fn()}
      />
    );

    expect(queryByText("Hidden toast")).toBeNull();
  });
});
