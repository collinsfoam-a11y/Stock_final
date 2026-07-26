import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";

const mockGetItemByBarcode = jest.fn();
const mockSearchItems = jest.fn();
const mockLocalGetItemByBarcode = jest.fn();
const mockLocalSearchItems = jest.fn();

let mockOfflineMode = false;

jest.mock("@/services/api", () => ({
  getItemByBarcode: (...args: unknown[]) => mockGetItemByBarcode(...args),
  searchItems: (...args: unknown[]) => mockSearchItems(...args),
}));

jest.mock("@/db/localDb", () => ({
  localDb: {
    getItemByBarcode: (...args: unknown[]) => mockLocalGetItemByBarcode(...args),
    searchItems: (...args: unknown[]) => mockLocalSearchItems(...args),
  },
}));

jest.mock("@/store/settingsStore", () => ({
  useSettingsStore: (selector: (state: { settings: { offlineMode: boolean } }) => unknown) =>
    selector({
      settings: {
        offlineMode: mockOfflineMode,
      },
    }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { Wrapper, queryClient };
};

describe("offline inventory hooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOfflineMode = false;
  });

  it("uses local item lookup when offline mode is enabled", async () => {
    mockOfflineMode = true;
    mockLocalGetItemByBarcode.mockResolvedValue({
      barcode: "ABC123",
      item_code: "ABC123",
      item_name: "Cached Item",
    });

    const { Wrapper, queryClient } = createWrapper();
    const { result, unmount } = renderHook(
      () =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("../useItemByBarcodeQuery").useItemByBarcodeQuery({
          barcode: "ABC123",
        }),
      {
        wrapper: Wrapper,
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockLocalGetItemByBarcode).toHaveBeenCalledWith("ABC123");
    expect(mockGetItemByBarcode).not.toHaveBeenCalled();
    unmount();
    queryClient.clear();
  });

  it("uses the API search when offline mode is disabled", async () => {
    mockSearchItems.mockResolvedValue({
      items: [{ barcode: "ABC123", item_name: "Remote Item" }],
    });

    const { Wrapper, queryClient } = createWrapper();
    const { result, unmount } = renderHook(
      () =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("../useSearchItemsQuery").useSearchItemsQuery({
          query: "ABC",
        }),
      {
        wrapper: Wrapper,
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSearchItems).toHaveBeenCalledWith("ABC");
    expect(mockLocalSearchItems).not.toHaveBeenCalled();
    unmount();
    queryClient.clear();
  });
});
