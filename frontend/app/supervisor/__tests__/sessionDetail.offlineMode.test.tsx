import React from "react";
import { render, waitFor } from "@testing-library/react-native";

import SessionDetail from "../session/[id]";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockShow = jest.fn();
const mockGetSession = jest.fn();
const mockGetCountLines = jest.fn();

let mockOfflineMode = false;
let mockParams: Record<string, string> = { id: "session-1" };

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@shopify/flash-list", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");

  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
    }: {
      data?: any[];
      renderItem: ({ item, index }: { item: any; index: number }) => React.ReactNode;
      ListHeaderComponent?: React.ComponentType | React.ReactNode;
      ListEmptyComponent?: React.ComponentType | React.ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        typeof ListHeaderComponent === "function"
          ? React.createElement(ListHeaderComponent)
          : ListHeaderComponent || null,
        Array.isArray(data) && data.length > 0
          ? data.map((item, index) =>
              React.createElement(
                React.Fragment,
                { key: item?.id || index },
                renderItem({ item, index }),
              ),
            )
          : typeof ListEmptyComponent === "function"
            ? React.createElement(ListEmptyComponent)
            : ListEmptyComponent || null,
      ),
  };
});

jest.mock("../../../src/components/ui/AuroraBackground", () => ({
  AuroraBackground: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../../../src/components/ui/GlassCard", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");

  return {
    GlassCard: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

jest.mock("../../../src/components/ui/AnimatedPressable", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TouchableOpacity } = require("react-native");

  return {
    AnimatedPressable: ({
      children,
      onPress,
      ...props
    }: {
      children: React.ReactNode;
      onPress?: () => void;
    }) => React.createElement(TouchableOpacity, { onPress, ...props }, children),
  };
});

jest.mock("../../../src/components/supervisor/RecountAssignmentModal", () => () => null);

jest.mock("../../../src/components/feedback/ToastProvider", () => ({
  useToast: () => ({
    show: mockShow,
  }),
}));

jest.mock("../../../src/store/settingsStore", () => ({
  useSettingsStore: (
    selector: (state: { settings: { offlineMode: boolean } }) => unknown,
  ) =>
    selector({
      settings: {
        offlineMode: mockOfflineMode,
      },
    }),
}));

jest.mock("../../../src/services/api/api", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  getCountLines: (...args: unknown[]) => mockGetCountLines(...args),
  approveCountLine: jest.fn(),
  rejectCountLine: jest.fn(),
  getAssignableStaffUsers: jest.fn(),
  updateSessionStatus: jest.fn(),
  verifyStock: jest.fn(),
  unverifyStock: jest.fn(),
}));

describe("SessionDetail offline mode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOfflineMode = true;
    mockParams = { id: "session-1" };

    mockGetSession.mockResolvedValue({
      id: "session-1",
      warehouse: "Main Warehouse",
      staff_name: "Nina",
      status: "OPEN",
      total_items: 1,
      total_variance: 0,
    });
    mockGetCountLines.mockImplementation(
      async (_sessionId: string, _page: number, _pageSize: number, verified: boolean) => ({
        items: verified
          ? []
          : [
              {
                id: "line-1",
                item_name: "Widget A",
                item_code: "WGT-A",
                erp_qty: 10,
                counted_qty: 9,
                variance: -1,
                status: "pending",
                verified: false,
              },
            ],
      }),
    );
  });

  it("shows cached session data in read-only mode while offline", async () => {
    const { getByText, queryByText } = render(<SessionDetail />);

    await waitFor(() => {
      expect(getByText("Viewing cached session data")).toBeTruthy();
    });

    expect(getByText("Widget A")).toBeTruthy();
    expect(queryByText("Move to Reconcile")).toBeNull();
    expect(queryByText("Close Session")).toBeNull();
    expect(queryByText("Approve")).toBeNull();
    expect(queryByText("Reject")).toBeNull();
    expect(queryByText("Verify Stock")).toBeNull();
  });

  it("explains when the requested session is missing from the local cache", async () => {
    mockGetSession.mockResolvedValue(null);
    mockGetCountLines.mockResolvedValue({ items: [] });

    const { getByText } = render(<SessionDetail />);

    await waitFor(() => {
      expect(getByText("This session is no longer available.")).toBeTruthy();
    });

    expect(
      getByText("It is not available in the local session cache."),
    ).toBeTruthy();
    expect(mockShow).toHaveBeenCalledWith(
      "This session is no longer available",
      "warning",
    );
  });

  it("does not offer supervisor verification for zero-variance items", async () => {
    mockOfflineMode = false;
    mockGetSession.mockResolvedValue({
      id: "session-1",
      warehouse: "Main Warehouse",
      staff_name: "Nina",
      status: "OPEN",
      total_items: 1,
      total_variance: 0,
    });
    mockGetCountLines.mockImplementation(
      async (_sessionId: string, _page: number, _pageSize: number, verified: boolean) => ({
        items: verified
          ? []
          : [
              {
                id: "line-1",
                item_name: "Widget A",
                item_code: "WGT-A",
                erp_qty: 10,
                counted_qty: 10,
                variance: 0,
                status: "pending",
                verified: false,
              },
            ],
      }),
    );

    const { getByText, queryByText } = render(<SessionDetail />);

    await waitFor(() => {
      expect(getByText("Widget A")).toBeTruthy();
    });

    expect(queryByText("Verify Stock")).toBeNull();
    expect(queryByText("Approve")).toBeNull();
    expect(queryByText("Reject")).toBeNull();
  });
});
