import {
  COUNT_LINE_STATES,
  SESSION_STATES,
  normalizeCountLineState,
  normalizeSessionState,
} from "../states";

describe("state contracts", () => {
  it("exposes canonical session states", () => {
    expect(SESSION_STATES).toEqual(["CREATED", "ACTIVE", "REVIEW", "FINALIZED"]);
  });

  it("normalizes legacy session aliases", () => {
    expect(normalizeSessionState("open")).toBe("CREATED");
    expect(normalizeSessionState("reconcile")).toBe("REVIEW");
    expect(normalizeSessionState("closed")).toBe("FINALIZED");
  });

  it("exposes canonical count-line states", () => {
    expect(COUNT_LINE_STATES).toEqual([
      "DRAFT",
      "SUBMITTED",
      "PENDING_APPROVAL",
      "APPROVED",
      "REJECTED",
      "LOCKED",
    ]);
  });

  it("normalizes count-line aliases", () => {
    expect(normalizeCountLineState("pending")).toBe("PENDING_APPROVAL");
    expect(normalizeCountLineState("finalized")).toBe("LOCKED");
  });
});
