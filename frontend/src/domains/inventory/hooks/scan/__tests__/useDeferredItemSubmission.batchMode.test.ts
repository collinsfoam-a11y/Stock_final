import { Alert } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useDeferredItemSubmission } from "../useDeferredItemSubmission";

const mockCreateCountLine = jest.fn();
const mockCreateManualBatches = jest.fn();
const mockToastShow = jest.fn();

jest.mock("@/services/api/api", () => ({
  createCountLine: (...args: unknown[]) => mockCreateCountLine(...args),
  createManualBatches: (...args: unknown[]) => mockCreateManualBatches(...args),
}));

jest.mock("@/services/toastService", () => ({
  toastService: {
    show: (...args: unknown[]) => mockToastShow(...args),
  },
}));

describe("useDeferredItemSubmission batch mode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateCountLine.mockResolvedValue({});
    mockCreateManualBatches.mockResolvedValue([]);
  });

  const baseItem = {
    id: "item-1",
    item_code: "ITEM001",
    barcode: "8901234567890",
    item_name: "Batch Item Name",
    name: "Batch Item Name",
    mrp: 42,
    warehouse: "Main",
  };

  const baseParams = {
    barcode: "8901234567890",
    sessionId: "session-1",
    currentFloor: "F1",
    currentRack: "R1",
    item: baseItem,
    quantity: "0",
    condition: "Good" as const,
    remark: "",
    isDamageEnabled: false,
    damageQty: "0",
    damageType: "returnable" as const,
    damagePhoto: null,
    itemPhotos: [],
    isSerializedItem: false,
    serialEntries: [],
    serialNumbers: [],
    serialValidationErrors: [],
    validateSerials: () => true,
    varianceRemark: "",
    mrp: "42",
    hasMfgDate: false,
    itemMfgDate: "",
    itemMfgDateFormat: "none" as const,
    hasExpiryDate: false,
    itemExpiryDate: "",
    itemExpiryDateFormat: "none" as const,
    blindRecountRequired: false,
    recountTargetId: null,
    recountBlockedReason: null,
    onSuccess: jest.fn(),
    countdownSeconds: 0,
  };

  it("submits batches when batch mode is enabled", async () => {
    const batches = [
      {
        batch_number: "B1",
        quantity: 2,
        mrp: 100,
        manufacturing_date: "2026-01-01",
        expiry_date: "2027-01-01",
        item_condition: "No Issue",
        barcode: "500001",
      },
    ];

    const { result } = renderHook(() =>
      useDeferredItemSubmission({
        ...baseParams,
        isBatchMode: true,
        batches,
        quantity: "2",
      })
    );

    await act(async () => {
      result.current.handleSubmitPress();
    });

    await waitFor(() =>
      expect(mockCreateCountLine).toHaveBeenCalledWith(
        expect.objectContaining({
          counted_qty: 2,
          batches,
        })
      )
    );
  });

  it("creates manual batches in backend when barcodes are missing", async () => {
    const batches = [
      {
        batch_number: "MANUAL-1",
        quantity: 3,
        mrp: 120,
        manufacturing_date: undefined,
        expiry_date: undefined,
        item_condition: "No Issue",
        barcode: undefined,
      },
    ];

    mockCreateManualBatches.mockResolvedValueOnce([
      { barcode: "500001", batch_no: "MANUAL-1" },
    ]);

    const { result } = renderHook(() =>
      useDeferredItemSubmission({
        ...baseParams,
        isBatchMode: true,
        batches,
        quantity: "3",
      })
    );

    await act(async () => {
      result.current.handleSubmitPress();
    });

    await waitFor(() =>
      expect(mockCreateManualBatches).toHaveBeenCalledWith(
        "ITEM001",
        expect.arrayContaining([
          expect.objectContaining({
            quantity: 3,
            mrp: 120,
          }),
        ])
      )
    );

    await waitFor(() =>
      expect(mockCreateCountLine).toHaveBeenCalledWith(
        expect.objectContaining({
          counted_qty: 3,
          batches: expect.arrayContaining([
            expect.objectContaining({
              batch_number: "MANUAL-1",
              barcode: "500001",
            }),
          ]),
        })
      )
    );
  });

  it("falls back to generic quantity when batch mode is disabled", async () => {
    const { result } = renderHook(() =>
      useDeferredItemSubmission({
        ...baseParams,
        isBatchMode: false,
        quantity: "5",
      })
    );

    await act(async () => {
      result.current.handleSubmitPress();
    });

    await waitFor(() =>
      expect(mockCreateCountLine).toHaveBeenCalledWith(
        expect.objectContaining({
          counted_qty: 5,
        })
      )
    );
    expect(mockCreateCountLine.mock.calls[0][0].batches).toBeUndefined();
  });
});
