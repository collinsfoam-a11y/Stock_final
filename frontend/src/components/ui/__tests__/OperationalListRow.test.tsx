import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { OperationalListRow } from "../OperationalListRow";

describe("OperationalListRow", () => {
  it("renders dense operational row details and triggers the row action", () => {
    const onPress = jest.fn();
    const { getByLabelText, getByText } = render(
      <OperationalListRow
        title="Warehouse A"
        subtitle="Staff: Priya"
        metadata={["24 items", "Session ABC123"]}
        status="RECONCILE"
        severity="high"
        leftIcon="business-outline"
        metrics={[
          { label: "Complete", value: "82%", tone: "success", icon: "checkmark-done-outline" },
        ]}
        badges={[{ label: "Var 4.00", tone: "error", icon: "analytics-outline" }]}
        timestamps={[{ label: "Created", value: "May 18", icon: "calendar-outline" }]}
        accessibility={{
          label: "Open session for Warehouse A. Staff Priya. Status reconcile.",
        }}
        onPress={onPress}
      />
    );

    expect(getByText("Warehouse A")).toBeTruthy();
    expect(getByText("Staff: Priya")).toBeTruthy();
    expect(getByText("24 items")).toBeTruthy();
    expect(getByText("Complete")).toBeTruthy();
    expect(getByText("82%")).toBeTruthy();
    expect(getByText("RECONCILE")).toBeTruthy();
    expect(getByText("Var 4.00")).toBeTruthy();

    fireEvent.press(getByLabelText("Open session for Warehouse A. Staff Priya. Status reconcile."));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders a non-interactive skeleton row while loading", () => {
    const { getByLabelText, queryByText } = render(
      <OperationalListRow title="Loading row" loading />
    );

    expect(getByLabelText("Loading row")).toBeTruthy();
    expect(queryByText("Loading row")).toBeNull();
  });
});
