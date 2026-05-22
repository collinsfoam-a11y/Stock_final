import {
  OPERATIONAL_TELEMETRY_EVENT_REGISTRY,
  operationalTelemetry,
} from "../operationalTelemetry";
import { operationalAnalyticsRegistry } from "../operationalAnalyticsRegistry";

describe("operationalTelemetry", () => {
  beforeEach(() => {
    operationalTelemetry.clearForTests();
  });

  afterEach(() => {
    operationalTelemetry.clearForTests();
  });

  it("buffers privacy-safe scanner events without raw identifiers", () => {
    operationalTelemetry.trackScanner(
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_LOOKUP_COMPLETED,
      "success",
      {
        barcode: "510186",
        sessionId: "session-123",
        source: "camera",
      },
      { lookupLatencyMs: 42 }
    );

    const [event] = operationalTelemetry.getBufferedEvents();

    expect(event?.name).toBe(OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_LOOKUP_COMPLETED);
    expect(event?.tags?.barcode).toBeUndefined();
    expect(event?.tags?.sessionId).toBeUndefined();
    expect(event?.tags?.barcodeHash).toBeTruthy();
    expect(event?.tags?.barcodeLength).toBe(6);
    expect(event?.tags?.source).toBe("camera");
    expect(event?.metrics?.lookupLatencyMs).toBe(42);
  });

  it("dedupes repeated operational signals inside the configured window", () => {
    operationalTelemetry.trackQueue(
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.QUEUE_TRAVERSAL,
      "success",
      { action: "ArrowDown", surface: "variance_queue" },
      { total: 10 }
    );
    operationalTelemetry.trackQueue(
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.QUEUE_TRAVERSAL,
      "success",
      { action: "ArrowDown", surface: "variance_queue" },
      { total: 10 }
    );

    expect(operationalTelemetry.getBufferedEvents()).toHaveLength(1);
    expect(operationalTelemetry.getRuntimeSnapshot().dedupedEvents).toBe(1);
  });

  it("records timing marks for scan and queue lifecycle measurement", () => {
    const mark = operationalTelemetry.markStart({
      name: OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_LOOKUP_COMPLETED,
      category: "scanner",
      surface: "staff_scan",
      tags: { source: "manual" },
    });

    operationalTelemetry.markEnd(mark, "not_found", { offlineMode: true });

    const [event] = operationalTelemetry.getBufferedEvents();
    expect(event?.durationMs).toEqual(expect.any(Number));
    expect(event?.outcome).toBe("not_found");
    expect(event?.surface).toBe("staff_scan");
    expect(event?.tags?.offlineMode).toBe(true);
  });

  it("derives pilot analytics from buffered telemetry", () => {
    operationalTelemetry.trackScanner(
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_LOOKUP_COMPLETED,
      "success",
      { source: "camera" },
      { lookupLatencyMs: 80 }
    );
    operationalTelemetry.trackScanner(
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SERIAL_SCAN_COMPLETED,
      "duplicate",
      { source: "camera" }
    );
    operationalTelemetry.trackQueue(
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SYNC_RUN_COMPLETED,
      "success",
      undefined,
      { processed: 4 }
    );

    const snapshot = operationalAnalyticsRegistry.getPilotSnapshot();

    expect(snapshot.eventCount).toBe(3);
    expect(snapshot.scanner.totalScans).toBe(2);
    expect(snapshot.scanner.duplicateRate).toBe(0.5);
    expect(snapshot.queue.syncReliabilityRate).toBe(1);
    expect(snapshot.queue.queueThroughput).toBe(4);
  });

  it("surfaces advisory pilot alert candidates from aggregate signals", () => {
    operationalTelemetry.track({
      name: OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_LOOKUP_COMPLETED,
      category: "scanner",
      surface: "staff_scan",
      outcome: "success",
      durationMs: 2400,
    });

    const snapshot = operationalAnalyticsRegistry.getPilotSnapshot();

    expect(snapshot.alerts.some((alert) => alert.id === "scan-latency")).toBe(true);
  });
});
