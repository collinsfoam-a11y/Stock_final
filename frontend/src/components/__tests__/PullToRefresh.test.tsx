import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { PullToRefresh } from "../PullToRefresh";
import { haptics } from "@/services/haptics";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("PullToRefresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders children correctly", () => {
    const { getByText } = render(
      <PullToRefresh refreshing={false} onRefresh={jest.fn()}>
        <Text>Content inside scrollview</Text>
      </PullToRefresh>
    );

    expect(getByText("Content inside scrollview")).toBeTruthy();
  });

  it("triggers haptics.light and calls onRefresh when refreshing is triggered", () => {
    const onRefreshMock = jest.fn();
    const { UNSAFE_getByType } = render(
      <PullToRefresh refreshing={false} onRefresh={onRefreshMock}>
        <Text>Child</Text>
      </PullToRefresh>
    );

    const { RefreshControl } = require("react-native");
    const refreshControlInstance = UNSAFE_getByType(RefreshControl);

    fireEvent(refreshControlInstance, "refresh");

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onRefreshMock).toHaveBeenCalledTimes(1);
  });

  it("applies accessibility label to RefreshControl", () => {
    const { UNSAFE_getByType } = render(
      <PullToRefresh
        refreshing={false}
        onRefresh={jest.fn()}
        accessibilityLabel="Swipe down to update data"
      >
        <Text>Child</Text>
      </PullToRefresh>
    );

    const { RefreshControl } = require("react-native");
    const refreshControlInstance = UNSAFE_getByType(RefreshControl);

    expect(refreshControlInstance.props.accessibilityLabel).toBe(
      "Swipe down to update data"
    );
  });
});
