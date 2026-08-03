import { renderHook, waitFor } from "@testing-library/react-native";

import { useItemDetailData } from "../useItemDetailData";
import type { ItemDetailItem } from "@/features/inventory/hooks/scan/useItemDetailData";

const mockGetItemByIdentifier = jest.fn();
const mockCheckItemCounted = jest.fn();
const mockCheckItemScanStatus = jest.fn();
const mockSearchItems = jest.fn();
const mockGetSessionSqlVariance = jest.fn();

jest.mock("@/services/api/api", () => ({
  checkItemCounted: (...args: unknown[]) => mockCheckItemCounted(...args),
  checkItemScanStatus: (...args: unknown[]) => mockCheckItemScanStatus(...args),
  getItemByIdentifier: (...args: unknown[]) => mockGetItemByIdentifier(...args),
  getSessionSqlVariance: (...args: unknown[]) => mockGetSessionSqlVariance(...args),
  searchItems: (...args: unknown[]) => mockSearchItems(...args),
}));

jest.mock("@/store/authStore", () => ({
  useAuthStore: (selector: (state: { user?: { username?: string } }) => unknown) =>
    selector({ user: { username: "counter-1" } }),
}));

const mockSettingsState = {
  settings: {
    offlineMode: false,
    showItemStock: true,
    columnVisibility: {},
  },
};

jest.mock("@/store/settingsStore", () => ({
  useSettingsStore: (selector: (state: { settings: Record<string, unknown> }) => unknown) =>
    selector(mockSettingsState),
}));

jest.mock("@/db/localDb", () => ({
  localDb: {
    getItemByBarcode: jest.fn(),
    searchItems: jest.fn(),
  },
}));

jest.mock("@/services/httpClient", () => ({
  default: { get: jest.fn() },
}));

jest.mock("@/services/enhancedFeatures", () => ({
  RecentItemsService: { addRecent: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@/services/toastService", () => ({
  toastService: { show: jest.fn() },
}));

jest.mock("@/utils/itemBatchUtils", () => ({
  getStockQty: (item: { stock_qty?: number; current_stock?: number }) =>
    item.current_stock ?? item.stock_qty ?? 0,
  sortItemsByStockDesc: (items: unknown[]) => items,
}));

jest.mock("../errorMessages", () => ({
  getReadableInventoryErrorMessage: (_e: unknown, _ctx: string) => "Error",
}));

jest.mock("@/viewModels/varianceAdapter", () => ({
  toVarianceViewModel: (dto: Record<string, unknown>) => ({
    _raw: dto,
    itemCode: dto.item_code,
  }),
}));

const createItem = (overrides: Partial<Record<string, unknown>> = {}): ItemDetailItem =>
  ({
    item_code: "ITEM-001",
    item_name: "Widget",
    barcode: "BAR-001",
    stock_qty: 120,
    mrp: 10,
    uom_name: "Each",
    ...overrides,
  } as unknown as ItemDetailItem);

describe("useItemDetailData — variance integration (P0B)", () => {
  const mockOnBackPress = jest.fn();
  const mockOnMrpChange = jest.fn();
  const mockOnQuantityChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetItemByIdentifier.mockResolvedValue(createItem());
    mockCheckItemCounted.mockResolvedValue({ already_counted: false, count_lines: [] });
    mockCheckItemScanStatus.mockResolvedValue({ scanned: false, locations: [] });
    mockSearchItems.mockResolvedValue({ items: [] });
  });

  const render = (overrides: Record<string, unknown> = {}) =>
    renderHook(() =>
      useItemDetailData({
        barcode: "BAR-001",
        sessionId: "session-1",
        currentFloor: "F1",
        currentRack: "R2",
        onBackPress: mockOnBackPress,
        onMrpChange: mockOnMrpChange,
        onQuantityChange: mockOnQuantityChange,
        ...overrides,
      })
    );

  it("fetches canonical session variance and returns a varianceVm", async () => {
    mockGetSessionSqlVariance.mockResolvedValue({
      success: true,
      data: {
        session_id: "session-1",
        movement_adjusted_expected: 118,
        audit_delta: -5,
        operational_delta: -3,
        variance_by_item: [
          {
            item_code: "ITEM-001",
            sql_qty_at_submission: 120,
            physical_qty: 115,
            audit_delta: -5,
            operational_delta: -3,
          },
        ],
        computed_at: "2026-08-03T00:00:00Z",
      },
    });

    const { result } = render();

    await waitFor(() => {
      expect(result.current.varianceVm).not.toBeNull();
    });

    expect(mockGetSessionSqlVariance).toHaveBeenCalledWith("session-1");
    // The adapter receives the per-item variance merged with session-level + item context.
    expect(result.current.varianceVm).toBeDefined();
  });

  it("returns null varianceVm when session variance endpoint returns null (offline)", async () => {
    mockGetSessionSqlVariance.mockResolvedValue(null);

    const { result } = render();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.varianceVm).toBeNull();
  });

  it("does not fetch variance in offline mode", async () => {
    mockSettingsState.settings.offlineMode = true;

    const { result } = render();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetSessionSqlVariance).not.toHaveBeenCalled();
    expect(result.current.varianceVm).toBeNull();

    mockSettingsState.settings.offlineMode = false;
  });

  it("returns null varianceVm when item_code not found in variance_by_item", async () => {
    mockGetSessionSqlVariance.mockResolvedValue({
      success: true,
      data: {
        variance_by_item: [
          { item_code: "OTHER-ITEM", physical_qty: 5, sql_qty_at_submission: 10 },
        ],
      },
    });

    const { result } = render();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.varianceVm).toBeNull();
  });
});
