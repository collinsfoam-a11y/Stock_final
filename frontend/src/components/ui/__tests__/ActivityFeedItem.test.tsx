import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ActivityFeedItem } from "../ActivityFeedItem";

describe("ActivityFeedItem", () => {
  it("renders non-pressable item with correct content and accessibility label", () => {
    const { getByText, getByLabelText } = render(
      <ActivityFeedItem
        type="scan"
        title="Item Scanned"
        description="SKU 12345 verified in Rack A1"
        timestamp={new Date()}
        status="success"
      />
    );

    expect(getByText("Item Scanned")).toBeTruthy();
    expect(getByText("SKU 12345 verified in Rack A1")).toBeTruthy();
    expect(getByLabelText(/Item Scanned\. SKU 12345 verified in Rack A1\. Status success/)).toBeTruthy();
  });

  it("renders pressable item with default accessibility hint and handles press", () => {
    const onPressMock = jest.fn();
    const { getByRole, getByHintText } = render(
      <ActivityFeedItem
        type="session"
        title="Audit Started"
        description="Warehouse Zone 2"
        timestamp={new Date()}
        onPress={onPressMock}
      />
    );

    const button = getByRole("button");
    expect(getByHintText("Navigates to activity details")).toBeTruthy();

    fireEvent.press(button);
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it("uses custom accessibility hint when provided", () => {
    const { getByHintText } = render(
      <ActivityFeedItem
        type="variance"
        title="Discrepancy Logged"
        description="3 items missing"
        timestamp={new Date()}
        onPress={() => {}}
        accessibilityHint="View variance details"
      />
    );

    expect(getByHintText("View variance details")).toBeTruthy();
  });
});
