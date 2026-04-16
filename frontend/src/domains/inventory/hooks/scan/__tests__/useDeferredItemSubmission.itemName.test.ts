import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useDeferredItemSubmission } from "../useDeferredItemSubmission";

const mockCreateCountLine = jest.fn();
const mockToastShow = jest.fn();

jest.mock("@/services/api/api", () => ({
  createCountLine: (...args: unknown[]) => mockCreateCountLine(...args),
}));

jest.mock("@/services/utils/toastService", () => ({
  toastService: {
    show: (...args: unknown[]) => mockToastShow(...args),
  },
}));

describe("useDeferredItemSubmission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateCountLine.mockResolvedValue({});
  });

  it("includes item_name in the submitted payload", async () => {
    const onSuccess = jest.fn();

    const { result } = renderHook(() =>
      useDeferredItemSubmission({
        barcode: "8901234567890",
        sessionId: "session-1",
        currentFloor: "F1",
        currentRack: "R1",
        item: {
          id: "item-1",
          item_code: "ITEM001",
          barcode: "8901234567890",
          item_name: "Batch Item Name",
          name: "Batch Item Name",
          mrp: 42,
        },
        quantity: "3",
        condition: "Good",
        remark: "note",
        isDamageEnabled: false,
        damageQty: "0",
        damageType: "returnable",
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
        itemMfgDateFormat: "none",
        hasExpiryDate: false,
        itemExpiryDate: "",
        itemExpiryDateFormat: "none",
        onSuccess,
        countdownSeconds: 0,
      }),
    );

    await act(async () => {
      result.current.handleSubmitPress();
    });

    await waitFor(() =>
      expect(mockCreateCountLine).toHaveBeenCalledWith(
        expect.objectContaining({
          item_code: "ITEM001",
          item_name: "Batch Item Name",
        }),
      ),
    );
  });
});
