import { toExceptionViewModel } from "../exceptionAdapter";

describe("toExceptionViewModel — stable codes only", () => {
  it("maps known backend codes to typed journeys", () => {
    const vm = toExceptionViewModel({ code: "DUPLICATE_IDENTITY_SUBMITTED" });

    expect(vm.code).toBe("DUPLICATE_IDENTITY_SUBMITTED");
    expect(vm.severity).toBe("blocking");
    expect(vm.action?.journey).toBe("OPEN_EXISTING_COUNT");
  });

  it("falls back to GENERIC for unrecognized codes (never message parsing)", () => {
    const vm = toExceptionViewModel({ code: "TOTALLY_UNKNOWN_THING" });

    expect(vm.code).toBe("GENERIC");
    expect(vm.severity).toBe("warning");
    expect(vm.action?.journey).toBe("DISMISS");
  });

  it("falls back to GENERIC when no code is provided", () => {
    const vm = toExceptionViewModel({ message: "some error" });

    expect(vm.code).toBe("GENERIC");
  });

  it("preserves description from the raw DTO", () => {
    const vm = toExceptionViewModel({
      code: "SERIAL_CONFLICT",
      message: "Serial already exists",
    });

    expect(vm.description).toBe("Serial already exists");
    expect(vm.action?.journey).toBe("SHOW_SERIAL");
  });

  it("overrides severity to blocking when backend says so", () => {
    const vm = toExceptionViewModel({
      code: "UNKNOWN_BARCODE",
      severity: "blocking",
    });

    expect(vm.severity).toBe("blocking");
  });

  it("passes through entityId for deep-linking", () => {
    const vm = toExceptionViewModel({
      code: "SHOW_SERIAL",
      entityId: "item-abc",
    });

    expect(vm.entityId).toBe("item-abc");
  });

  it("normalizes errorCode field the same as code field", () => {
    const vm = toExceptionViewModel({ errorCode: "LOCATION_MISMATCH" });

    expect(vm.code).toBe("LOCATION_MISMATCH");
    expect(vm.action?.journey).toBe("RELOCATION");
  });
});
