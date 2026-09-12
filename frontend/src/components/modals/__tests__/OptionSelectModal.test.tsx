import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { OptionSelectModal } from "../OptionSelectModal";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("OptionSelectModal", () => {
  const defaultProps = {
    visible: true,
    title: "Select Batch Date",
    options: ["2026-05-01", "2026-06-01", "2026-07-01"],
    onSelect: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders modal title and options correctly with header accessibility role", () => {
    const { getByText, getByRole } = render(<OptionSelectModal {...defaultProps} />);

    const header = getByRole("header");
    expect(header).toBeTruthy();
    expect(getByText("Select Batch Date")).toBeTruthy();
    expect(getByText("2026-05-01")).toBeTruthy();
    expect(getByText("2026-06-01")).toBeTruthy();
    expect(getByText("2026-07-01")).toBeTruthy();
  });

  it("calls onSelect and triggers light haptics when an option is pressed", () => {
    const { getByText } = render(<OptionSelectModal {...defaultProps} />);

    fireEvent.press(getByText("2026-06-01"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSelect).toHaveBeenCalledWith("2026-06-01");
  });

  it("correctly indicates selected option via accessibilityState", () => {
    const { getByTestId } = render(
      <OptionSelectModal {...defaultProps} selectedValue="2026-06-01" testID="option-modal" />
    );

    const option1 = getByTestId("option-modal-option-2026-05-01");
    const option2 = getByTestId("option-modal-option-2026-06-01");

    expect(option1.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false })
    );
    expect(option2.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
  });

  it("calls onClose and triggers light haptics when close button is pressed", () => {
    const { getByTestId } = render(
      <OptionSelectModal {...defaultProps} testID="option-modal" />
    );

    fireEvent.press(getByTestId("option-modal-close"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose and triggers light haptics when backdrop is pressed", () => {
    const { getByTestId } = render(
      <OptionSelectModal {...defaultProps} testID="option-modal" />
    );

    fireEvent.press(getByTestId("option-modal-backdrop"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
