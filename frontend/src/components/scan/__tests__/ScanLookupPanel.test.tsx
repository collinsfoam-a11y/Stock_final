import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ScanLookupPanel } from "@/components/scan/ScanLookupPanel";
import { haptics } from "@/services/haptics";

jest.mock("@/context/ThemeContext", () => ({
  useThemeContextSafe: () => null,
}));

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("ScanLookupPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const defaultProps = {
    initialLoading: false,
    loading: false,
    recentItems: [
      { id: "1", item_code: "ITEM-001", item_name: "Test Item 1", barcode: "123456" },
      { id: "2", item_code: "ITEM-002", item_name: "Test Item 2", barcode: "789012" },
    ],
    searchQuery: "",
    searchResults: [],
    onChangeSearchQuery: jest.fn(),
    onClearSearchQuery: jest.fn(),
    onOpenScanner: jest.fn(),
    onPressItem: jest.fn(),
    onSubmitSearch: jest.fn(),
  };

  it("renders recent items and triggers light haptics on card press", () => {
    const onPressItem = jest.fn();
    const { getByText } = render(
      <ScanLookupPanel {...defaultProps} onPressItem={onPressItem} />
    );

    expect(getByText("Test Item 1")).toBeTruthy();
    expect(getByText("ITEM-001")).toBeTruthy();

    fireEvent.press(getByText("Test Item 1"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onPressItem).toHaveBeenCalledWith(defaultProps.recentItems[0]);
  });

  it("triggers light haptics and calls onOpenScanner when search button is pressed with empty query", () => {
    const onOpenScanner = jest.fn();
    const { getByTestId } = render(
      <ScanLookupPanel {...defaultProps} onOpenScanner={onOpenScanner} />
    );

    const button = getByTestId("scan-search-submit");
    fireEvent.press(button);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onOpenScanner).toHaveBeenCalledTimes(1);
  });

  it("triggers light haptics and calls onSubmitSearch when search button is pressed with query", () => {
    const onSubmitSearch = jest.fn();
    const { getByTestId } = render(
      <ScanLookupPanel
        {...defaultProps}
        searchQuery="foam"
        onSubmitSearch={onSubmitSearch}
      />
    );

    const button = getByTestId("scan-search-submit");
    fireEvent.press(button);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onSubmitSearch).toHaveBeenCalledTimes(1);
  });

  it("renders notice banner with accessibility and triggers light haptics on actions", () => {
    const onRetryNotice = jest.fn();
    const onDismissNotice = jest.fn();

    const notice = {
      type: "error" as const,
      title: "Scan Error",
      message: "Could not find item",
      actionLabel: "Try Again",
    };

    const { getByText, getByLabelText } = render(
      <ScanLookupPanel
        {...defaultProps}
        notice={notice}
        onRetryNotice={onRetryNotice}
        onDismissNotice={onDismissNotice}
      />
    );

    expect(getByText("Scan Error")).toBeTruthy();
    expect(getByText("Could not find item")).toBeTruthy();

    const retryBtn = getByText("Try Again");
    fireEvent.press(retryBtn);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onRetryNotice).toHaveBeenCalledTimes(1);

    const dismissBtn = getByLabelText("Dismiss scan message");
    fireEvent.press(dismissBtn);

    expect(haptics.light).toHaveBeenCalledTimes(2);
    expect(onDismissNotice).toHaveBeenCalledTimes(1);
  });

  it("renders empty state when no recent items exist", () => {
    const { getByText } = render(
      <ScanLookupPanel {...defaultProps} recentItems={[]} />
    );

    expect(getByText("No Recent Scans")).toBeTruthy();
    expect(
      getByText("Items you scan will appear here for quick access")
    ).toBeTruthy();
  });
});
