import { toFinalizationGateViewModel } from "../finalizationAdapter";
import type { FinalizationAssessmentDTO } from "../finalizationAdapter";

describe("toFinalizationGateViewModel — authority boundary", () => {
  it("reads allowed verbatim from the backend and never computes it", () => {
    const dto: FinalizationAssessmentDTO = {
      allowed: false,
      blockers: [],
      assessment_id: "asmt-123",
      assessed_at: "2026-08-03T00:00:00Z",
    };

    const vm = toFinalizationGateViewModel(dto);

    expect(vm.allowed).toBe(false);
    expect(vm.assessmentToken).toBe("asmt-123");
    expect(vm.assessedAt).toBe("2026-08-03T00:00:00Z");
  });

  it("defaults allowed to false when absent (safe-by-default)", () => {
    const vm = toFinalizationGateViewModel({});
    expect(vm.allowed).toBe(false);
  });

  it("reads allowed from can_finalize and ready fallback fields", () => {
    expect(toFinalizationGateViewModel({ can_finalize: true }).allowed).toBe(true);
    expect(toFinalizationGateViewModel({ ready: true }).allowed).toBe(true);
  });

  it("maps structured blocker records with snake_case fields", () => {
    const dto: FinalizationAssessmentDTO = {
      allowed: false,
      blockers: [
        {
          code: "UNKNOWN_ITEMS_PENDING",
          canonical_code: "FI-01",
          description: "3 unresolved unknown item(s)",
          entity_id: "item-abc",
          severity: "blocking",
        },
      ],
      assessment_id: "asmt-456",
    };

    const vm = toFinalizationGateViewModel(dto);

    expect(vm.allowed).toBe(false);
    expect(vm.blockers).toHaveLength(1);
    expect(vm.blockers[0]?.code).toBe("UNKNOWN_ITEMS_PENDING");
    expect(vm.blockers[0]?.canonicalCode).toBe("FI-01");
    expect(vm.blockers[0]?.description).toBe("3 unresolved unknown item(s)");
    expect(vm.blockers[0]?.entityId).toBe("item-abc");
    expect(vm.blockers[0]?.severity).toBe("blocking");
  });

  it("maps blocking_reasons array of strings as generic blockers", () => {
    const vm = toFinalizationGateViewModel({
      allowed: false,
      blocking_reasons: ["Something is wrong"],
    });

    expect(vm.blockers).toHaveLength(1);
    expect(vm.blockers[0]?.code).toBe("UNKNOWN");
    expect(vm.blockers[0]?.description).toBe("Something is wrong");
  });

  it("merges blockers and blocking_reasons arrays", () => {
    const vm = toFinalizationGateViewModel({
      allowed: false,
      blockers: [{ code: "A", description: "A" }],
      blocking_reasons: [{ code: "B", description: "B" }],
    });

    expect(vm.blockers).toHaveLength(2);
    expect(vm.blockers[0]?.code).toBe("A");
    expect(vm.blockers[1]?.code).toBe("B");
  });

  it("handles empty blockers gracefully", () => {
    const vm = toFinalizationGateViewModel({
      allowed: true,
      blockers: [],
    });

    expect(vm.allowed).toBe(true);
    expect(vm.blockers).toHaveLength(0);
  });
});
