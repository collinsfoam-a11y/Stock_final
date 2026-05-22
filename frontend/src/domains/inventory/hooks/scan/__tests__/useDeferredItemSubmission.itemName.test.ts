import { Alert } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useDeferredItemSubmission } from "../useDeferredItemSubmission";

const mockCreateCountLine = jest.fn();
const mockToastShow = jest.fn();

jest.mock("@/services/api/api", () => ({
  createCountLine: (...args: unknown[]) => mockCreateCountLine(...args),
}));

jest.mock("@/services/toastService", () => ({
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
        blindRecountRequired: false,
        recountTargetId: null,
        recountBlockedReason: null,
        onSuccess,
        countdownSeconds: 0,
      })
    );

    await act(async () => {
      result.current.handleSubmitPress();
    });

    await waitFor(() =>
      expect(mockCreateCountLine).toHaveBeenCalledWith(
        expect.objectContaining({
          item_code: "ITEM001",
          item_name: "Batch Item Name",
        })
      )
    );
  });

  it("blocks variance submissions without a variance remark when stock is known", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
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
          current_stock: 5,
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
        blindRecountRequired: false,
        recountTargetId: null,
        recountBlockedReason: null,
        onSuccess,
        countdownSeconds: 0,
      })
    );

    await act(async () => {
      result.current.handleSubmitPress();
    });

    expect(mockCreateCountLine).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      "Variance Reason Required",
      "Enter a variance remark before saving a count that differs from system stock."
    );
    alertSpy.mockRestore();
  });

  it("includes recount_of_id for blind recount submissions", async () => {
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
        blindRecountRequired: true,
        recountTargetId: "line-42",
        recountBlockedReason: null,
        onSuccess,
        countdownSeconds: 0,
      })
    );

    await act(async () => {
      result.current.handleSubmitPress();
    });

    await waitFor(() =>
      expect(mockCreateCountLine).toHaveBeenCalledWith(
        expect.objectContaining({
          recount_of_id: "line-42",
        })
      )
    );
  });

  it("blocks submission when a recount is assigned to another user", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
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
        blindRecountRequired: true,
        recountTargetId: "line-42",
        recountBlockedReason: "This recount is assigned to staff2.",
        onSuccess,
        countdownSeconds: 0,
      })
    );

    await act(async () => {
      result.current.handleSubmitPress();
    });

    expect(mockCreateCountLine).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Recount Locked", "This recount is assigned to staff2.");
    alertSpy.mockRestore();
  });
});
