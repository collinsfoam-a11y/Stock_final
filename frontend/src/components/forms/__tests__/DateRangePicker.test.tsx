import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { DateRangePicker } from "../DateRangePicker";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("DateRangePicker", () => {
  const startDate = new Date(2025, 0, 15); // Jan 15, 2025
  const endDate = new Date(2025, 0, 20); // Jan 20, 2025
  const mockOnStartDateChange = jest.fn();
  const mockOnEndDateChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with label and formatted dates", () => {
    const { getByText } = render(
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={mockOnStartDateChange}
        onEndDateChange={mockOnEndDateChange}
        label="Select Report Window"
      />
    );

    expect(getByText("Select Report Window")).toBeTruthy();
    expect(getByText("Start Date")).toBeTruthy();
    expect(getByText("End Date")).toBeTruthy();
    expect(getByText("Jan 15, 2025")).toBeTruthy();
    expect(getByText("Jan 20, 2025")).toBeTruthy();
  });

  it("triggers haptic feedback when pressing start date button", () => {
    const { getByLabelText } = render(
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={mockOnStartDateChange}
        onEndDateChange={mockOnEndDateChange}
      />
    );

    const startButton = getByLabelText("Start date, currently Jan 15, 2025");
    fireEvent.press(startButton);

    expect(haptics.light).toHaveBeenCalled();
  });

  it("triggers haptic feedback when pressing end date button", () => {
    const { getByLabelText } = render(
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={mockOnStartDateChange}
        onEndDateChange={mockOnEndDateChange}
      />
    );

    const endButton = getByLabelText("End date, currently Jan 20, 2025");
    fireEvent.press(endButton);

    expect(haptics.light).toHaveBeenCalled();
  });

  it("applies accessible button properties and hints to touchable elements", () => {
    const { getByLabelText } = render(
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={mockOnStartDateChange}
        onEndDateChange={mockOnEndDateChange}
      />
    );

    const startButton = getByLabelText("Start date, currently Jan 15, 2025");
    const endButton = getByLabelText("End date, currently Jan 20, 2025");

    expect(startButton.props.accessibilityRole).toBe("button");
    expect(startButton.props.accessibilityHint).toBe(
      "Opens date picker to change start date"
    );

    expect(endButton.props.accessibilityRole).toBe("button");
    expect(endButton.props.accessibilityHint).toBe(
      "Opens date picker to change end date"
    );
  });
});
