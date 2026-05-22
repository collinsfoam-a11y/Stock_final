import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import * as ReactNative from "react-native";

import { OperationalSplitView } from "../OperationalSplitView";

describe("OperationalSplitView", () => {
  it("renders sidebar and detail panes on tablet layouts", () => {
    const { getByLabelText, getByText } = render(
      <OperationalSplitView
        sidebar={<ReactNative.Text>Conflict queue</ReactNative.Text>}
        detail={<ReactNative.Text>Conflict detail</ReactNative.Text>}
        sidebarLabel="Conflict list"
        detailLabel="Conflict detail panel"
        tabletBreakpoint={0}
      />
    );

    expect(getByLabelText("Conflict list")).toBeTruthy();
    expect(getByLabelText("Conflict detail panel")).toBeTruthy();
    expect(getByText("Conflict queue")).toBeTruthy();
    expect(getByText("Conflict detail")).toBeTruthy();
  });

  it("collapses the sidebar without unmounting the detail pane", () => {
    const { getByLabelText, getByText, queryByText } = render(
      <OperationalSplitView
        sidebar={<ReactNative.Text>Conflict queue</ReactNative.Text>}
        detail={<ReactNative.Text>Conflict detail</ReactNative.Text>}
        sidebarLabel="Conflict list"
        detailLabel="Conflict detail panel"
        collapsible
        tabletBreakpoint={0}
      />
    );

    fireEvent.press(getByLabelText("Collapse Conflict list"));

    expect(queryByText("Conflict queue")).toBeNull();
    expect(getByText("Conflict detail")).toBeTruthy();

    fireEvent.press(getByLabelText("Expand Conflict list"));

    expect(getByText("Conflict queue")).toBeTruthy();
  });
});
