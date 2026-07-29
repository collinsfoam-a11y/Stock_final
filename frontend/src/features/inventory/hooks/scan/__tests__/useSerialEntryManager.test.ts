import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useSerialEntryManager } from "../useSerialEntryManager";

const mockCheckSerialUniqueness = jest.fn();

jest.mock("@/services/api/api", () => ({
  checkSerialUniqueness: (...args: unknown[]) => mockCheckSerialUniqueness(...args),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => `uuid-${Math.random().toString(36).slice(2)}`,
}));

const ITEM = {
  id: "item-1",
  item_code: "ITEM-A",
  barcode: "8901234567890",
  item_name: "Test Item",
  name: "Test Item",
  mrp: 100,
} as never;

const setup = (overrides: Record<string, unknown> = {}) =>
  renderHook(() =>
    useSerialEntryManager({
      item: ITEM,
      mrp: "100",
      quantity: "1",
      sessionId: "session-1",
      onQuantityChange: jest.fn(),
      ...overrides,
    })
  );

describe("useSerialEntryManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockCheckSerialUniqueness.mockResolvedValue({ exists: false, scope: "item" });
  });

  it("passes item_code so the uniqueness precheck is item-scoped", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handleSerialScanned({ serial_number: "SN-001" });
    });
    expect(mockCheckSerialUniqueness).toHaveBeenCalledWith("session-1", "SN-001", "ITEM-A");
  });

  it("adds a serial entry when the serial is unique", async () => {
    const { result } = setup();
    await act(async () => {
      const ok = await result.current.handleSerialScanned({ serial_number: "SN-001" });
      expect(ok).toBe(true);
    });
    expect(result.current.serialNumbers).toEqual(["SN-001"]);
  });

  it("rejects a local duplicate without calling the backend", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handleSerialScanned({ serial_number: "SN-001" });
    });
    mockCheckSerialUniqueness.mockClear();

    await act(async () => {
      const ok = await result.current.handleSerialScanned({ serial_number: "sn-001" });
      expect(ok).toBe(false);
    });
    expect(mockCheckSerialUniqueness).not.toHaveBeenCalled();
    expect(result.current.serialNumbers).toEqual(["SN-001"]);
    expect(Alert.alert).toHaveBeenCalledWith("Duplicate Serial", expect.any(String));
  });

  it("rejects a serial already counted elsewhere in the session (backend says exists)", async () => {
    mockCheckSerialUniqueness.mockResolvedValue({
      exists: true,
      scope: "item",
      item_code: "ITEM-A",
      counted_by: "staff1",
    });
    const { result } = setup();
    await act(async () => {
      const ok = await result.current.handleSerialScanned({ serial_number: "SN-999" });
      expect(ok).toBe(false);
    });
    expect(result.current.serialNumbers).toEqual([]);
    expect(Alert.alert).toHaveBeenCalledWith(
      "Serial Already Counted",
      expect.any(String),
      expect.anything()
    );
  });

  it("does not add a serial when validation is unavailable (fails closed)", async () => {
    mockCheckSerialUniqueness.mockResolvedValue({ status: "UNAVAILABLE" });
    const { result } = setup();
    await act(async () => {
      const ok = await result.current.handleSerialScanned({ serial_number: "SN-777" });
      expect(ok).toBe(false);
    });
    expect(result.current.serialNumbers).toEqual([]);
  });

  it("manual entry cannot slip a duplicate past submit-time validation", () => {
    const { result } = setup({ quantity: "2" });
    act(() => {
      result.current.setIsSerializedItem(true);
      result.current.handleAddSerial();
      result.current.handleAddSerial();
    });
    act(() => {
      result.current.handleSerialChange(0, "serial_number", "SN-DUP");
      result.current.handleSerialChange(1, "serial_number", "sn-dup");
    });
    let valid = true;
    act(() => {
      valid = result.current.validateSerials();
    });
    expect(valid).toBe(false);
    expect(result.current.serialValidationErrors.join(" ")).toMatch(/[Dd]uplicate/);
  });
});
