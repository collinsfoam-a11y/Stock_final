import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { SerialEntryCard } from "@/components/scan/SerialEntryCard";
import { SerialEntriesSection } from "@/components/scan/SerialEntriesSection";
import { haptics } from "@/services/haptics";

// Mock ThemeContext to avoid deep store dependency
jest.mock("@/context/ThemeContext", () => ({
  useThemeContextSafe: () => null,
}));

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("SerialEntryCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with proper accessibility props and triggers haptics on remove", () => {
    const onRemove = jest.fn();
    const onChangeText = jest.fn();

    const { getByRole, getByPlaceholderText } = render(
      <SerialEntryCard
        entry={{ id: "s1", serial_number: "SN-100" }}
        index={0}
        onChangeText={onChangeText}
        onRemove={onRemove}
      />
    );

    const removeButton = getByRole("button", { name: "Remove serial number for Unit #1" });
    expect(removeButton).toBeTruthy();

    fireEvent.press(removeButton);
    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);

    const input = getByPlaceholderText("Serial number");
    expect(input.props.accessibilityLabel).toBe("Serial number for Unit #1");
    expect(input.props["aria-invalid"]).toBe(false);

    fireEvent.changeText(input, "SN-101");
    expect(onChangeText).toHaveBeenCalledWith("SN-101");
  });

  it("displays validation error with alert accessibility role", () => {
    const { getByRole, getByPlaceholderText } = render(
      <SerialEntryCard
        entry={{ id: "s1", serial_number: "INVALID" }}
        index={1}
        validationError="Duplicate serial number"
        onChangeText={jest.fn()}
        onRemove={jest.fn()}
      />
    );

    const input = getByPlaceholderText("Serial number");
    expect(input.props["aria-invalid"]).toBe(true);

    const alertText = getByRole("alert");
    expect(alertText).toBeTruthy();
    expect(alertText.props.children).toBe("Duplicate serial number");
  });
});

describe("SerialEntriesSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders section buttons with accessible labels and triggers haptics", () => {
    const onOpenScanner = jest.fn();
    const onAddSerial = jest.fn();

    const { getByRole } = render(
      <SerialEntriesSection
        serialEntries={[{ id: "s1", serial_number: "SN-001" }]}
        serialValidationErrors={[]}
        serialValidationMessages={[null]}
        onOpenScanner={onOpenScanner}
        onAddSerial={onAddSerial}
        onSerialChange={jest.fn()}
        onRemoveSerial={jest.fn()}
      />
    );

    const scanButton = getByRole("button", { name: "Scan Serial Numbers" });
    fireEvent.press(scanButton);
    expect(haptics.light).toHaveBeenCalled();
    expect(onOpenScanner).toHaveBeenCalledTimes(1);

    const addButton = getByRole("button", { name: "Add Serial Manually" });
    fireEvent.press(addButton);
    expect(haptics.light).toHaveBeenCalled();
    expect(onAddSerial).toHaveBeenCalledTimes(1);
  });

  it("renders validation errors block with alert accessibility role", () => {
    const { getByRole } = render(
      <SerialEntriesSection
        serialEntries={[{ id: "s1", serial_number: "SN-001" }]}
        serialValidationErrors={["Serial numbers must be unique"]}
        serialValidationMessages={["Duplicate serial"]}
        onOpenScanner={jest.fn()}
        onAddSerial={jest.fn()}
        onSerialChange={jest.fn()}
        onRemoveSerial={jest.fn()}
      />
    );

    const alertBox = getByRole("alert");
    expect(alertBox).toBeTruthy();
  });
});
