import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { ScannerFeedbackState } from "../ScannerFeedbackState";

describe("ScannerFeedbackState", () => {
  it("renders scanner state metadata and action semantics", () => {
    const retry = jest.fn();
    const dismiss = jest.fn();

    const { getByLabelText, getByText } = render(
      <ScannerFeedbackState
        state="not_found"
        title="Item not found"
        message="No item matched this barcode. Check the label and retry."
        item="Warehouse Flour"
        barcode="8901234567890"
        timestamp="08:40"
        retry={{ label: "Retry lookup", onPress: retry }}
        dismiss={{ onPress: dismiss }}
      />
    );

    expect(getByText("Item not found")).toBeTruthy();
    expect(getByText("No match")).toBeTruthy();
    expect(getByText("Warehouse Flour")).toBeTruthy();
    expect(getByText("8901234567890")).toBeTruthy();
    expect(getByText("08:40")).toBeTruthy();

    fireEvent.press(getByLabelText("Retry lookup"));
    fireEvent.press(getByLabelText("Dismiss scan message"));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("renders nothing for an empty state", () => {
    const { toJSON } = render(<ScannerFeedbackState state="" />);

    expect(toJSON()).toBeNull();
  });
});
