import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useItemDraftAutosave } from "../useItemDraftAutosave";

const mockSaveDraft = jest.fn();

jest.mock("@/services/api/api", () => ({
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
}));

describe("useItemDraftAutosave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockSaveDraft.mockResolvedValue({});
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("includes item_name in the autosave payload", async () => {
    renderHook(() =>
      useItemDraftAutosave({
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
        mrp: "42",
        quantity: "5",
        remark: "draft note",
        sessionId: "session-1",
        submitting: false,
      }),
    );

    await act(async () => {
      jest.advanceTimersByTime(2100);
    });

    await waitFor(() =>
      expect(mockSaveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          item_code: "ITEM001",
          item_name: "Batch Item Name",
        }),
      ),
    );
  });

  it("does not autosave repeatedly when props are stable", async () => {
    const { rerender } = renderHook(
      (props) =>
        useItemDraftAutosave({
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
          mrp: "42",
          quantity: "5",
          remark: "draft note",
          sessionId: "session-1",
          submitting: false,
          ...props,
        }),
      {
        initialProps: {},
      },
    );

    await act(async () => {
      jest.advanceTimersByTime(2100);
    });

    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1));

    // Simulate multiple re-renders with identical props
    rerender({});
    rerender({});
    rerender({});

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockSaveDraft).toHaveBeenCalledTimes(1);
  });

  it("does not autosave empty initial state", async () => {
    renderHook(() =>
      useItemDraftAutosave({
        currentFloor: null,
        currentRack: null,
        item: {
          id: "item-1",
          item_code: "ITEM001",
          barcode: "8901234567890",
          item_name: "Batch Item Name",
          name: "Batch Item Name",
          mrp: 42,
        },
        mrp: "",
        quantity: "0",
        remark: "",
        sessionId: "session-1",
        submitting: false,
      }),
    );

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockSaveDraft).not.toHaveBeenCalled();
  });
});
