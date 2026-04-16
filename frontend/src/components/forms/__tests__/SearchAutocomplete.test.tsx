import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { SearchAutocomplete } from "../SearchAutocomplete";

const mockLocalSearchItems = jest.fn();
const mockRemoteSearchItems = jest.fn();

let mockOfflineMode = false;
let mockDebounceDelay = 300;

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      surface: "#ffffff",
      primary: "#2563eb",
      border: "#d1d5db",
      text: "#111827",
      textSecondary: "#6b7280",
      placeholder: "#9ca3af",
      success: "#059669",
      info: "#0284c7",
      secondary: "#7c3aed",
      background: "#f9fafb",
    },
  }),
}));

jest.mock("../../../store/settingsStore", () => ({
  useSettingsStore: (
    selector: (state: {
      settings: { offlineMode: boolean; debounceDelay: number };
    }) => unknown,
  ) =>
    selector({
      settings: {
        offlineMode: mockOfflineMode,
        debounceDelay: mockDebounceDelay,
      },
    }),
}));

jest.mock("../../../hooks/useDebouncedCallback", () => ({
  useStableDebouncedCallback: (callback: (...args: unknown[]) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    return React.useCallback(
      (...args: unknown[]) => callback(...args),
      [callback],
    );
  },
}));

jest.mock("../../../db/localDb", () => ({
  localDb: {
    searchItems: (...args: unknown[]) => mockLocalSearchItems(...args),
  },
}));

jest.mock("../../../services/enhancedSearchService", () => ({
  searchItems: (...args: unknown[]) => mockRemoteSearchItems(...args),
}));

describe("SearchAutocomplete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOfflineMode = false;
    mockDebounceDelay = 300;
  });

  it("uses local search results when offline mode is enabled", async () => {
    mockOfflineMode = true;
    mockLocalSearchItems.mockResolvedValue([
      {
        id: "cached-1",
        item_code: "ITEM-1",
        item_name: "Cached Item",
        barcode: "123456",
        category: "Cooling",
      },
    ]);

    const onSelectItem = jest.fn();
    const { getByPlaceholderText, findByText } = render(
      <SearchAutocomplete
        onSelectItem={onSelectItem}
        placeholder="Search inventory"
      />,
    );

    fireEvent.changeText(getByPlaceholderText("Search inventory"), "ITEM");

    await waitFor(() => {
      expect(mockLocalSearchItems).toHaveBeenCalledWith("ITEM");
    });

    expect(mockRemoteSearchItems).not.toHaveBeenCalled();
    expect(await findByText("Cached Item")).toBeTruthy();
  });

  it("uses remote search when offline mode is disabled", async () => {
    mockRemoteSearchItems.mockResolvedValue({
      items: [
        {
          id: "remote-1",
          item_code: "ITEM-2",
          item_name: "Remote Item",
          stock_qty: 4,
        },
      ],
    });

    const { getByPlaceholderText, findByText } = render(
      <SearchAutocomplete
        onSelectItem={jest.fn()}
        placeholder="Search inventory"
      />,
    );

    fireEvent.changeText(getByPlaceholderText("Search inventory"), "ITEM");

    await waitFor(() => {
      expect(mockRemoteSearchItems).toHaveBeenCalledWith({ query: "ITEM" });
    });

    expect(mockLocalSearchItems).not.toHaveBeenCalled();
    expect(await findByText("Remote Item")).toBeTruthy();
  });
});
