import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Input } from "../Input";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("Input", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with label", () => {
    const { getByText, getByPlaceholderText } = render(
      <Input label="Username" placeholder="Enter username" value="" onChangeText={jest.fn()} />
    );

    expect(getByText("Username")).toBeTruthy();
    expect(getByPlaceholderText("Enter username")).toBeTruthy();
  });

  it("calls onChangeText when text changes", () => {
    const onChangeTextMock = jest.fn();
    const { getByPlaceholderText } = render(
      <Input label="Email" placeholder="Enter email" value="" onChangeText={onChangeTextMock} />
    );

    fireEvent.changeText(getByPlaceholderText("Enter email"), "test@example.com");
    expect(onChangeTextMock).toHaveBeenCalledWith("test@example.com");
  });

  it("renders error message and passes accessibility hint & aria-invalid", () => {
    const { getByText, getByPlaceholderText } = render(
      <Input
        label="Password"
        placeholder="Enter password"
        value=""
        onChangeText={jest.fn()}
        error="Password is required"
      />
    );

    expect(getByText("Password is required")).toBeTruthy();
    const input = getByPlaceholderText("Enter password");
    expect(input.props.accessibilityHint).toBe("Error: Password is required");
    expect(input.props["aria-invalid"]).toBe(true);
  });

  it("triggers haptics and calls onRightIconPress when right icon is pressed", () => {
    const onRightIconPressMock = jest.fn();
    const { getByLabelText } = render(
      <Input
        label="Search"
        placeholder="Search here"
        value=""
        onChangeText={jest.fn()}
        rightIcon="search"
        onRightIconPress={onRightIconPressMock}
      />
    );

    const rightIconBtn = getByLabelText("Search right action");
    fireEvent.press(rightIconBtn);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onRightIconPressMock).toHaveBeenCalledTimes(1);
  });
});
