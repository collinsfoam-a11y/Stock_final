import { toVarianceViewModel } from "../varianceAdapter";
import type { VarianceDTO } from "../varianceAdapter";

describe("toVarianceViewModel — authority boundary", () => {
  it("reads canonical backend deltas verbatim and never recomputes them", () => {
    const dto: VarianceDTO = {
      item_code: "ITEM-1",
      item_name: "Widget",
      erp_qty: 24, // baseline
      movement_adjusted_expected: 23,
      sql_qty_at_submission: 22, // current ERP (live)
      counted_qty: 21, // physical
      audit_delta: -3, // 21 - 24
      operational_delta: -2, // 21 - 23
      quantity_delta: -1, // 21 - 22
      shortage_qty: 1,
      excess_qty: 0,
    };

    const vm = toVarianceViewModel(dto);

    expect(vm.auditDelta).toBe(-3); // verbatim, not recomputed as 21-24
    expect(vm.operationalDelta).toBe(-2); // verbatim, not recomputed as 21-23
    expect(vm.quantityDelta).toBe(-1);
    expect(vm.shortageQty).toBe(1); // backend value preferred
    expect(vm.excessQty).toBe(0);
    expect(vm.baseline.value).toBe(24);
    expect(vm.movementAdjustedExpected.value).toBe(23);
    expect(vm.currentErp.value).toBe(22);
    expect(vm.currentErp.isCachedErp).toBe(false);
    expect(vm.physical.value).toBe(21);
  });

  it("classifies ERP_MOVEMENT when operational delta is clean but audit delta is not", () => {
    const vm = toVarianceViewModel({
      item_code: "I",
      item_name: "N",
      erp_qty: 10,
      movement_adjusted_expected: 8,
      counted_qty: 8,
      audit_delta: -2,
      operational_delta: 0,
    });
    expect(vm.classification).toBe("ERP_MOVEMENT");
    expect(vm.severity).toBe("none");
  });

  it("classifies REAL_VARIANCE when operational delta is non-zero", () => {
    const vm = toVarianceViewModel({
      item_code: "I",
      erp_qty: 10,
      movement_adjusted_expected: 10,
      counted_qty: 6,
      audit_delta: -4,
      operational_delta: -4,
    });
    expect(vm.classification).toBe("REAL_VARIANCE");
    expect(vm.severity).toBe("critical");
  });

  it("never coerces absent quantities to zero (absence vs zero)", () => {
    const vm = toVarianceViewModel({
      item_code: "I",
      item_name: "N",
      counted_qty: 5,
      // baseline, ERP, deltas all absent
    });
    expect(vm.baseline.value).toBeNull();
    expect(vm.baseline.absence).toBe("unavailable");
    expect(vm.currentErp.value).toBeNull();
    expect(vm.auditDelta).toBeNull();
    expect(vm.operationalDelta).toBeNull();
    expect(vm.physical.value).toBe(5); // zero is valid, but here it's 5
  });

  it("treats zero as a valid physical count (CI-01), distinct from absence", () => {
    const vm = toVarianceViewModel({
      item_code: "I",
      counted_qty: 0,
      erp_qty: 4,
      audit_delta: -4,
    });
    expect(vm.physical.value).toBe(0);
    expect(vm.physical.absence).toBeUndefined();
  });

  it("derives shortage/excess as a display decomposition only when backend omits them", () => {
    const vm = toVarianceViewModel({
      item_code: "I",
      counted_qty: 3,
      erp_qty: 5,
      quantity_delta: -2, // authoritative delta present, shortage/excess absent
    });
    expect(vm.shortageQty).toBe(2); // max(-(-2),0)
    expect(vm.excessQty).toBe(0);
  });

  it("marks cached ERP distinctly from live SQL (VI-01)", () => {
    const vm = toVarianceViewModel({
      item_code: "I",
      counted_qty: 3,
      cached_erp_qty: 5,
    });
    expect(vm.currentErp.value).toBe(5);
    expect(vm.currentErp.isCachedErp).toBe(true);
    expect(vm.currentErp.absence).toBe("pending_sql_validation");
  });

  it("falls back to legacy single variance field for display continuity", () => {
    const vm = toVarianceViewModel({
      item_code: "I",
      item_name: "Legacy",
      system_qty: 10,
      verified_qty: 8,
      variance: -2,
    });
    expect(vm.quantityDelta).toBe(-2);
    expect(vm.baseline.value).toBe(10);
    expect(vm.physical.value).toBe(8);
  });
});
