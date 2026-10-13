import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { PinKeypad } from "../PinKeypad";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
    error: jest.fn(),
  },
}));

describe("PinKeypad Component", () => {
  const mockOnPinChange = jest.fn();
  const mockOnComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders keypad buttons with standardized accessibility props", () => {
    render(<PinKeypad pin="" onPinChange={mockOnPinChange} />);

    const num1 = screen.getByLabelText("Number 1");
    expect(num1).toBeTruthy();
    expect(num1.props.accessibilityRole).toBe("button");

    const clearBtn = screen.getByLabelText("Clear");
    expect(clearBtn).toBeTruthy();
    expect(clearBtn.props.accessibilityRole).toBe("button");

    const deleteBtn = screen.getByLabelText("Delete");
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn.props.accessibilityRole).toBe("button");
  });

  it("triggers haptics.light and calls onPinChange on digit press", () => {
    render(<PinKeypad pin="" onPinChange={mockOnPinChange} />);

    fireEvent.press(screen.getByLabelText("Number 5"));

    expect(haptics.light).toHaveBeenCalled();
    expect(mockOnPinChange).toHaveBeenCalledWith("5");
  });

  it("triggers haptics.light and calls onComplete when pin reaches maxLength", () => {
    render(
      <PinKeypad
        pin="123"
        maxLength={4}
        onPinChange={mockOnPinChange}
        onComplete={mockOnComplete}
      />
    );

    fireEvent.press(screen.getByLabelText("Number 4"));

    expect(haptics.light).toHaveBeenCalled();
    expect(mockOnPinChange).toHaveBeenCalledWith("1234");
    expect(mockOnComplete).toHaveBeenCalledWith("1234");
  });

  it("triggers haptics.error on error state change", () => {
    const { rerender } = render(
      <PinKeypad pin="1234" error={false} onPinChange={mockOnPinChange} />
    );

    expect(haptics.error).not.toHaveBeenCalled();

    rerender(<PinKeypad pin="1234" error={true} onPinChange={mockOnPinChange} />);

    expect(haptics.error).toHaveBeenCalled();
  });

  it("hides decorative backspace icon from screen readers", () => {
    render(<PinKeypad pin="12" onPinChange={mockOnPinChange} />);

    const deleteBtn = screen.getByLabelText("Delete");
    // Find icon within delete button children
    const icon = deleteBtn.children.find(
      (child: any) => child.props && child.props["aria-hidden"] === true
    );
    expect(icon).toBeTruthy();
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
  });
});
