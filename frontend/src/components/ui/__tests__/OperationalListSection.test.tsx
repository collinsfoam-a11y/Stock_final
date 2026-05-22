import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { OperationalListRow } from "../OperationalListRow";
import { OperationalListSection } from "../OperationalListSection";

describe("OperationalListSection", () => {
  it("renders section context and child operational rows", () => {
    const { getByText } = render(
      <OperationalListSection title="Pending queue" subtitle="3 actions waiting" severity="medium">
        <OperationalListRow title="Queued scan" status="Pending" />
      </OperationalListSection>
    );

    expect(getByText("Pending queue")).toBeTruthy();
    expect(getByText("3 actions waiting")).toBeTruthy();
    expect(getByText("Queued scan")).toBeTruthy();
  });

  it("collapses and expands grouped rows from the section header", () => {
    const { getByLabelText, getByText, queryByText } = render(
      <OperationalListSection
        title="Conflicts"
        subtitle="Needs supervisor review"
        severity="high"
        collapsible
      >
        <OperationalListRow title="Serial mismatch" status="Blocked" />
      </OperationalListSection>
    );

    fireEvent.press(getByLabelText("Collapse Conflicts. Needs supervisor review"));
    expect(queryByText("Serial mismatch")).toBeNull();

    fireEvent.press(getByLabelText("Expand Conflicts. Needs supervisor review"));
    expect(getByText("Serial mismatch")).toBeTruthy();
  });
});
