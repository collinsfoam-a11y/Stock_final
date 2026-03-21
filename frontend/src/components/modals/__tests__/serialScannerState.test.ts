import {
  clearRecentScanTimes,
  DEFAULT_SERIAL_RESCAN_WINDOW_MS,
  DetectedCode,
  MAX_DETECTED_CODES,
  createDetectedCodeList,
  isScanWithinRescanWindow,
  isScanLocked,
  nextAfterResume,
  nextAfterSerialAdded,
} from "../serialScannerState";

describe("serialScannerState", () => {
  it("locks scanning after a serial is added", () => {
    expect(nextAfterSerialAdded({ scanPaused: false }).scanPaused).toBe(true);
    expect(isScanLocked({ scanPaused: true })).toBe(true);
  });

  it("resumes scan only when user chooses scan next", () => {
    expect(nextAfterResume({ scanPaused: true }).scanPaused).toBe(false);
  });

  it("deduplicates detected codes, keeps latest first, and caps list length", () => {
    const initial = [
      { code: "A1", status: "ready" as const, message: "Tap to add" },
      { code: "B2", status: "ready" as const, message: "Tap to add" },
    ];

    const withDuplicate = createDetectedCodeList(initial, {
      code: "A1",
      status: "ready" as const,
      message: "Tap to add",
    });

    expect(withDuplicate[0]?.code).toBe("A1");
    expect(withDuplicate).toHaveLength(2);

    const longList = Array.from({ length: MAX_DETECTED_CODES + 5 }).reduce<
      DetectedCode[]
    >(
      (acc, _, index) =>
        createDetectedCodeList(acc, {
          code: `S${index}`,
          status: "ready" as const,
          message: "Tap to add",
        }),
      [],
    );

    expect(longList).toHaveLength(MAX_DETECTED_CODES);
    expect(longList[0]?.code).toBe(`S${MAX_DETECTED_CODES + 4}`);
  });

  it("supports reset flow by clearing recent scan memory", () => {
    const recent = new Map<string, number>([
      ["A1", 1000],
      ["B2", 1200],
    ]);

    clearRecentScanTimes(recent);

    expect(recent.size).toBe(0);
  });

  it("throttles same serial within the rescan window only", () => {
    expect(
      isScanWithinRescanWindow({
        lastSeenAt: 1000,
        now: 1500,
      }),
    ).toBe(true);

    expect(
      isScanWithinRescanWindow({
        lastSeenAt: 1000,
        now: 1000 + DEFAULT_SERIAL_RESCAN_WINDOW_MS + 1,
      }),
    ).toBe(false);

    expect(
      isScanWithinRescanWindow({
        lastSeenAt: 0,
        now: 2000,
      }),
    ).toBe(false);
  });

  it("keeps valid serial candidates above non-serial candidates", () => {
    const updated = createDetectedCodeList(
      [
        { code: "SN-1001", status: "ready", message: "Tap to add" },
        { code: "DUP001", status: "duplicate", message: "Duplicate" },
      ],
      { code: "EAN13CODE", status: "invalid", message: "Not serial" },
    );

    expect(updated[0]?.status).toBe("ready");
    expect(updated[0]?.code).toBe("SN-1001");
  });
});
