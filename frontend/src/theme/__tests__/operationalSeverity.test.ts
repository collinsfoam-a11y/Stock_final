import {
  OPERATIONAL_SEVERITY_REGISTRY,
  normalizeOperationalPriority,
  resolveOperationalSeverityLevel,
  resolveOperationalTone,
} from "../operationalSeverity";

describe("operational severity registry", () => {
  it("defines every enterprise operational severity level", () => {
    expect(Object.keys(OPERATIONAL_SEVERITY_REGISTRY).sort()).toEqual(
      [
        "blocked",
        "critical",
        "high",
        "info",
        "low",
        "medium",
        "offline",
        "pending",
        "resolved",
        "success",
        "warning",
      ].sort()
    );
  });

  it("normalizes common queue and audit statuses", () => {
    expect(resolveOperationalSeverityLevel("failed_manual_review")).toBe("critical");
    expect(resolveOperationalSeverityLevel("pending conflict")).toBe("blocked");
    expect(resolveOperationalSeverityLevel("synced")).toBe("success");
    expect(resolveOperationalTone("in progress")).toBe("info");
  });

  it("keeps critical items before informational items in queue order", () => {
    expect(normalizeOperationalPriority("critical")).toBeLessThan(
      normalizeOperationalPriority("info")
    );
  });
});
