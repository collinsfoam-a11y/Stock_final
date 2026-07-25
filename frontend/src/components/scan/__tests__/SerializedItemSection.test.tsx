import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { SerializedItemSection } from "@/components/scan/SerializedItemSection";
import type { SerialEntryData } from "@/types/scan";

const baseProps = {
  enabled: true,
  serialValidationErrors: [] as string[],
  serialValidationMessages: {} as Record<string, string | null>,
  onAddSerial: jest.fn(),
  onOpenScanner: jest.fn(),
  onRemoveSerial: jest.fn(),
  onSerialChange: jest.fn(),
  onSerializedChange: jest.fn(),
};

const entry = (id: string, serial = ""): SerialEntryData => ({
  id,
  serial_number: serial,
  is_valid: serial.trim().length > 0,
});

describe("SerializedItemSection manual serial entry", () => {
  beforeEach(() => jest.clearAllMocks());

  it("hides the manual-entry UI when serialization is off (repro of reported gate)", () => {
    const { queryByText } = render(
      <SerializedItemSection
        {...baseProps}
        isSerializedItem={false}
        serialEntries={[]}
      />,
    );
    // The reported failure: no way to add a serial while the switch is off.
    expect(queryByText("Add Serial Manually")).toBeNull();
  });

  it("shows and wires manual entry when serialization is on", () => {
    const onAddSerial = jest.fn();
    const { getByText } = render(
      <SerializedItemSection
        {...baseProps}
        onAddSerial={onAddSerial}
        isSerializedItem
        serialEntries={[]}
      />,
    );
    const addButton = getByText("Add Serial Manually");
    expect(addButton).toBeTruthy();
    fireEvent.press(addButton);
    expect(onAddSerial).toHaveBeenCalledTimes(1);
  });

  it("routes typed serial text to onSerialChange for the correct row", () => {
    const onSerialChange = jest.fn();
    const { getAllByPlaceholderText } = render(
      <SerializedItemSection
        {...baseProps}
        onSerialChange={onSerialChange}
        isSerializedItem
        serialEntries={[entry("s1"), entry("s2")]}
        serialValidationMessages={{ s1: null, s2: null }}
      />,
    );
    const inputs = getAllByPlaceholderText("Serial number");
    expect(inputs).toHaveLength(2);
    fireEvent.changeText(inputs[1], "ABC123");
    expect(onSerialChange).toHaveBeenCalledWith(1, "ABC123");
  });
});
