import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import { useItemSubmission } from "../useItemSubmission";
import type { Item } from "@/types/scan";

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCheckItemCounted = jest.fn();
const mockCreateCountLine = jest.fn();
const mockAddQuantityToCountLine = jest.fn();
const mockNotificationAsync = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    canGoBack: mockCanGoBack,
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock("expo-haptics", () => ({
  notificationAsync: (...args: unknown[]) => mockNotificationAsync(...args),
  NotificationFeedbackType: {
    Success: "success",
  },
}));

jest.mock("../../../../../services/api", () => ({
  checkItemCounted: (...args: unknown[]) => mockCheckItemCounted(...args),
  createCountLine: (...args: unknown[]) => mockCreateCountLine(...args),
  addQuantityToCountLine: (...args: unknown[]) =>
    mockAddQuantityToCountLine(...args),
}));

const pressAlertButton = (
  buttons: readonly AlertButton[] | undefined,
  text: string,
) => {
  buttons?.find((button) => button.text === text)?.onPress?.();
};

const createItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  name: "Soap Bar",
  item_code: "ITEM001",
  item_name: "Soap Bar",
  stock_qty: 3,
  ...overrides,
});

const createForm = (overrides: Record<string, unknown> = {}) =>
  ({
    validateForm: jest.fn(() => true),
    isBatchMode: false,
    batches: [],
    quantity: "5",
    isDamageEnabled: false,
    damageQty: "0",
    condition: "No Issue",
    conditionDetails: "",
    remark: "",
    itemPhoto: null,
    mrpEditable: false,
    mrp: "",
    categoryEditable: false,
    category: "",
    subCategory: "",
    mfgDate: "",
    isSerialEnabled: false,
    serialNumbers: [],
    ...overrides,
  }) as any;

describe("useItemSubmission", () => {
  let alertSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockCheckItemCounted.mockResolvedValue({
      already_counted: false,
      count_lines: [],
    });
    mockCreateCountLine.mockResolvedValue({});
    mockAddQuantityToCountLine.mockResolvedValue({});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("stops submission when strict-mode variance is not confirmed", async () => {
    alertSpy.mockImplementation((title, _message, buttons) => {
      if (title === "Strict Mode Warning") {
        pressAlertButton(buttons, "Cancel");
      }
    });

    const { result } = renderHook(() =>
      useItemSubmission({
        form: createForm({ quantity: "5" }),
        item: createItem({ stock_qty: 3 }),
        sessionId: "session-1",
        sessionType: "STRICT",
      }),
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockCheckItemCounted).not.toHaveBeenCalled();
    expect(mockAddQuantityToCountLine).not.toHaveBeenCalled();
    expect(mockCreateCountLine).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("adds quantity to the existing count line when the user chooses add", async () => {
    mockCheckItemCounted.mockResolvedValue({
      already_counted: true,
      count_lines: [
        {
          line_id: "line-42",
          counted_qty: 2,
        },
      ],
    });

    alertSpy.mockImplementation((title, _message, buttons) => {
      if (title === "Item Already Counted") {
        pressAlertButton(buttons, "Add to Existing");
        return;
      }
      if (title === "Success") {
        pressAlertButton(buttons, "OK");
      }
    });

    const { result } = renderHook(() =>
      useItemSubmission({
        form: createForm({ quantity: "4" }),
        item: createItem(),
        sessionId: "session-1",
        sessionType: "STANDARD",
      }),
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(mockAddQuantityToCountLine).toHaveBeenCalledWith(
        "line-42",
        4,
        undefined,
      );
    });

    expect(mockCreateCountLine).not.toHaveBeenCalled();
    expect(mockNotificationAsync).toHaveBeenCalledWith("success");
    expect(mockBack).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("creates a new count line with normalized serials when the user chooses a new entry", async () => {
    mockCheckItemCounted.mockResolvedValue({
      already_counted: true,
      count_lines: [
        {
          id: "line-11",
          counted_qty: 1,
        },
      ],
    });

    alertSpy.mockImplementation((title, _message, buttons) => {
      if (title === "Item Already Counted") {
        pressAlertButton(buttons, "Create New Entry");
        return;
      }
      if (title === "Success") {
        pressAlertButton(buttons, "OK");
      }
    });

    const { result } = renderHook(() =>
      useItemSubmission({
        form: createForm({
          quantity: "2",
          isDamageEnabled: true,
          damageQty: "1",
          condition: "Other",
          conditionDetails: "Damaged label",
          remark: "Fresh count",
          itemPhoto: { uri: "file://item.jpg", base64: "photo-data" },
          mrpEditable: true,
          mrp: "42",
          categoryEditable: true,
          category: "Household",
          subCategory: "Soap",
          mfgDate: "2026-04-01",
          isSerialEnabled: true,
          serialNumbers: [" sn-001 ", "sn-002"],
        }),
        item: createItem({
          name: "Soap Bar",
          item_name: "Soap Bar",
          batch_id: "batch-1",
        }),
        sessionId: "session-1",
        sessionType: "STANDARD",
      }),
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(mockCreateCountLine).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: "session-1",
          item_code: "ITEM001",
          item_name: "Soap Bar",
          batch_id: "batch-1",
          counted_qty: 2,
          damaged_qty: 1,
          item_condition: "Other",
          condition_details: "Damaged label",
          remark: "Fresh count",
          photo_base64: "photo-data",
          mrp_counted: 42,
          category_correction: "Household",
          subcategory_correction: "Soap",
          manufacturing_date: "2026-04-01",
          serial_numbers: ["SN-001", "SN-002"],
        }),
      );
    });

    expect(mockAddQuantityToCountLine).not.toHaveBeenCalled();
    expect(mockNotificationAsync).toHaveBeenCalledWith("success");
    expect(mockBack).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("falls back to creating a new line when the existing-count check fails", async () => {
    mockCheckItemCounted.mockRejectedValue(new Error("check failed"));

    alertSpy.mockImplementation((title, _message, buttons) => {
      if (title === "Success") {
        pressAlertButton(buttons, "OK");
      }
    });

    const { result } = renderHook(() =>
      useItemSubmission({
        form: createForm({ quantity: "3" }),
        item: createItem(),
        sessionId: "session-1",
        sessionType: "STANDARD",
      }),
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(mockCreateCountLine).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: "session-1",
          item_code: "ITEM001",
          counted_qty: 3,
        }),
      );
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "Error checking item counted:",
      expect.any(Error),
    );
  });
});
