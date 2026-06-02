import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Chip } from "../Chip";

describe("Chip", () => {
  it("renders label", () => {
    const { getByText } = render(<Chip label="Test" />);
    expect(getByText("Test")).toBeTruthy();
  });

  it("calls onPress when chip body is pressed", () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Chip label="Pressable" onPress={onPress} />);
    fireEvent.press(getByRole("button", { name: "Pressable" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("chip body is NOT a button when only onRemove is provided", () => {
    const onRemove = jest.fn();
    const { getAllByRole } = render(<Chip label="RemoveOnly" onRemove={onRemove} />);
    const buttons = getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.accessibilityLabel).toBe("Remove RemoveOnly");
  });

  it("both onPress and onRemove work independently when combined", () => {
    const onPress = jest.fn();
    const onRemove = jest.fn();
    const { getByRole, getByLabelText } = render(
      <Chip label="Interactive" onPress={onPress} onRemove={onRemove} />
    );

    fireEvent.press(getByRole("button", { name: "Interactive" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText("Remove Interactive"));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("calls onRemove when remove button is pressed", () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(<Chip label="Tag" onRemove={onRemove} />);
    fireEvent.press(getByLabelText("Remove Tag"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("chip body is not interactive when disabled even with onPress", () => {
    const onPress = jest.fn();
    const { queryByRole } = render(<Chip label="Disabled" onPress={onPress} disabled />);
    expect(queryByRole("button", { name: "Disabled" })).toBeNull();
  });

  it("remove button is hidden when disabled", () => {
    const onRemove = jest.fn();
    const { queryByLabelText } = render(
      <Chip label="Disabled" onRemove={onRemove} disabled />
    );
    expect(queryByLabelText("Remove Disabled")).toBeNull();
  });
});
