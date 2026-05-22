import {
  OPERATIONAL_TELEMETRY_EVENT_REGISTRY,
  operationalTelemetry,
  type OperationalTelemetryEvent,
} from "./operationalTelemetry";

export interface OperationalScannerAnalytics {
  totalScans: number;
  successRate: number;
  duplicateRate: number;
  invalidRate: number;
  offlineScanCount: number;
  retryFrequency: number;
  averageLookupLatencyMs: number | null;
  serialScanThroughputPerMinute: number;
}

export interface OperationalQueueAnalytics {
  enqueuedCount: number;
  queueThroughput: number;
  averageFlushDurationMs: number | null;
  syncReliabilityRate: number;
  skippedSyncRuns: number;
  averageOfflineQueueAgeMs: number | null;
}

export interface OperationalWorkflowAnalytics {
  commandUsageCount: number;
  keyboardShortcutUsageCount: number;
  keyboardAdoptionRate: number;
  queueTraversalCount: number;
  splitViewLayoutChanges: number;
  recountFrequency: number;
}

export interface OperationalRuntimeAnalytics {
  samples: number;
  averageFps: number | null;
  droppedFrameSignals: number;
  averageRenderDurationMs: number | null;
  memorySpikeSignals: number;
}

export interface OperationalPilotReadinessSnapshot {
  generatedAt: string;
  windowMs: number;
  eventCount: number;
  scanner: OperationalScannerAnalytics;
  queue: OperationalQueueAnalytics;
  workflow: OperationalWorkflowAnalytics;
  runtime: OperationalRuntimeAnalytics;
  alerts: OperationalAlertCandidate[];
}

export interface OperationalAlertCandidate {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  metric: string;
  value: number;
}

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

const safeRate = (part: number, total: number) => (total > 0 ? part / total : 0);

const average = (values: number[]): number | null => {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return null;
  return Math.round((finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length) * 100) / 100;
};

const metricValues = (events: OperationalTelemetryEvent[], metricName: string) =>
  events
    .map((event) => event.metrics?.[metricName])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

const eventDurationValues = (events: OperationalTelemetryEvent[]) =>
  events
    .map((event) => event.durationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

const countBy = (events: OperationalTelemetryEvent[], predicate: (event: OperationalTelemetryEvent) => boolean) =>
  events.reduce((count, event) => (predicate(event) ? count + 1 : count), 0);

export class OperationalAnalyticsRegistry {
  getPilotSnapshot(windowMs = DEFAULT_WINDOW_MS): OperationalPilotReadinessSnapshot {
    const events = this.getWindowedEvents(windowMs);
    const scanner = this.buildScannerAnalytics(events, windowMs);
    const queue = this.buildQueueAnalytics(events);
    const workflow = this.buildWorkflowAnalytics(events);
    const runtime = this.buildRuntimeAnalytics(events);

    const snapshot: OperationalPilotReadinessSnapshot = {
      generatedAt: new Date().toISOString(),
      windowMs,
      eventCount: events.length,
      scanner,
      queue,
      workflow,
      runtime,
      alerts: [],
    };

    snapshot.alerts = this.getAlertCandidates(snapshot);
    return snapshot;
  }

  getAlertCandidates(snapshot: Omit<OperationalPilotReadinessSnapshot, "alerts">): OperationalAlertCandidate[] {
    const alerts: OperationalAlertCandidate[] = [];

    if (snapshot.scanner.averageLookupLatencyMs !== null && snapshot.scanner.averageLookupLatencyMs > 1200) {
      alerts.push({
        id: "scan-latency",
        severity: snapshot.scanner.averageLookupLatencyMs > 2000 ? "critical" : "warning",
        title: "Scan lookup latency elevated",
        message: "Average lookup time is above the pilot target for rapid scan confidence.",
        metric: "scanner.averageLookupLatencyMs",
        value: snapshot.scanner.averageLookupLatencyMs,
      });
    }

    if (snapshot.scanner.duplicateRate > 0.18) {
      alerts.push({
        id: "duplicate-rate",
        severity: "warning",
        title: "Duplicate scan rate elevated",
        message: "Operators may be rescanning the same labels or fighting uncertain feedback.",
        metric: "scanner.duplicateRate",
        value: snapshot.scanner.duplicateRate,
      });
    }

    if (snapshot.queue.syncReliabilityRate < 0.9 && snapshot.queue.enqueuedCount > 0) {
      alerts.push({
        id: "sync-reliability",
        severity: "warning",
        title: "Sync reliability below pilot target",
        message: "Offline replay or network recovery may need supervisor attention.",
        metric: "queue.syncReliabilityRate",
        value: snapshot.queue.syncReliabilityRate,
      });
    }

    if (snapshot.runtime.droppedFrameSignals > 3) {
      alerts.push({
        id: "runtime-frame-drops",
        severity: "warning",
        title: "Runtime responsiveness degraded",
        message: "The device reported repeated low-FPS samples during operational work.",
        metric: "runtime.droppedFrameSignals",
        value: snapshot.runtime.droppedFrameSignals,
      });
    }

    return alerts;
  }

  exportAuditPayload(windowMs = DEFAULT_WINDOW_MS) {
    const snapshot = this.getPilotSnapshot(windowMs);
    return {
      schema: "stock_verify_operational_analytics_v1",
      generatedAt: snapshot.generatedAt,
      snapshot,
    };
  }

  private getWindowedEvents(windowMs: number): OperationalTelemetryEvent[] {
    const cutoff = Date.now() - windowMs;
    return operationalTelemetry
      .getBufferedEvents()
      .filter((event) => Date.parse(event.timestamp) >= cutoff);
  }

  private buildScannerAnalytics(
    events: OperationalTelemetryEvent[],
    windowMs: number
  ): OperationalScannerAnalytics {
    const scannerEvents = events.filter((event) => event.category === "scanner");
    const lookupEvents = scannerEvents.filter(
      (event) => event.name === OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_LOOKUP_COMPLETED
    );
    const serialEvents = scannerEvents.filter(
      (event) => event.name === OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SERIAL_SCAN_COMPLETED
    );
    const scanCompletionEvents = new Set<OperationalTelemetryEvent["name"]>([
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_CAPTURED,
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_LOOKUP_COMPLETED,
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SERIAL_SCAN_COMPLETED,
    ]);
    const totalScans = scannerEvents.filter((event) => scanCompletionEvents.has(event.name)).length;
    const successes = countBy(scannerEvents, (event) => event.outcome === "success");
    const duplicates = countBy(scannerEvents, (event) => event.outcome === "duplicate");
    const invalid = countBy(scannerEvents, (event) => event.outcome === "invalid");
    const offlineScanCount = countBy(scannerEvents, (event) => event.outcome === "offline");
    const retryFrequency = countBy(scannerEvents, (event) => event.tags?.retry === true);
    const minutes = Math.max(windowMs / 60000, 1);

    return {
      totalScans,
      successRate: safeRate(successes, totalScans),
      duplicateRate: safeRate(duplicates, totalScans),
      invalidRate: safeRate(invalid, totalScans),
      offlineScanCount,
      retryFrequency,
      averageLookupLatencyMs: average(eventDurationValues(lookupEvents)),
      serialScanThroughputPerMinute: Math.round((serialEvents.length / minutes) * 100) / 100,
    };
  }

  private buildQueueAnalytics(events: OperationalTelemetryEvent[]): OperationalQueueAnalytics {
    const queueEvents = events.filter((event) => event.category === "queue");
    const syncCompleted = queueEvents.filter(
      (event) => event.name === OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SYNC_RUN_COMPLETED
    );
    const syncSuccesses = countBy(syncCompleted, (event) => event.outcome === "success");
    const enqueuedCount = countBy(
      queueEvents,
      (event) => event.name === OPERATIONAL_TELEMETRY_EVENT_REGISTRY.QUEUE_ENQUEUED
    );

    return {
      enqueuedCount,
      queueThroughput: metricValues(queueEvents, "processed").reduce((sum, value) => sum + value, 0),
      averageFlushDurationMs: average(
        eventDurationValues(
          queueEvents.filter(
            (event) => event.name === OPERATIONAL_TELEMETRY_EVENT_REGISTRY.QUEUE_FLUSH_COMPLETED
          )
        )
      ),
      syncReliabilityRate: safeRate(syncSuccesses, syncCompleted.length),
      skippedSyncRuns: countBy(
        queueEvents,
        (event) => event.name === OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SYNC_RUN_SKIPPED
      ),
      averageOfflineQueueAgeMs: average(metricValues(queueEvents, "oldestAgeMs")),
    };
  }

  private buildWorkflowAnalytics(events: OperationalTelemetryEvent[]): OperationalWorkflowAnalytics {
    const workflowEvents = events.filter((event) => event.category === "workflow");
    const commandUsageCount = countBy(
      workflowEvents,
      (event) => event.name === OPERATIONAL_TELEMETRY_EVENT_REGISTRY.COMMAND_EXECUTED
    );
    const keyboardShortcutUsageCount = countBy(
      workflowEvents,
      (event) => event.name === OPERATIONAL_TELEMETRY_EVENT_REGISTRY.KEYBOARD_SHORTCUT_USED
    );

    return {
      commandUsageCount,
      keyboardShortcutUsageCount,
      keyboardAdoptionRate: safeRate(keyboardShortcutUsageCount, commandUsageCount),
      queueTraversalCount: countBy(
        events,
        (event) => event.name === OPERATIONAL_TELEMETRY_EVENT_REGISTRY.QUEUE_TRAVERSAL
      ),
      splitViewLayoutChanges: countBy(
        events,
        (event) => event.name === OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SPLIT_VIEW_LAYOUT
      ),
      recountFrequency: countBy(workflowEvents, (event) => event.tags?.command === "recount"),
    };
  }

  private buildRuntimeAnalytics(events: OperationalTelemetryEvent[]): OperationalRuntimeAnalytics {
    const runtimeEvents = events.filter(
      (event) => event.name === OPERATIONAL_TELEMETRY_EVENT_REGISTRY.RUNTIME_SAMPLE
    );

    return {
      samples: runtimeEvents.length,
      averageFps: average(metricValues(runtimeEvents, "fps")),
      droppedFrameSignals: countBy(runtimeEvents, (event) => (event.metrics?.fps ?? 60) < 25),
      averageRenderDurationMs: average(metricValues(runtimeEvents, "renderTime")),
      memorySpikeSignals: countBy(runtimeEvents, (event) => (event.metrics?.memoryUsageMb ?? 0) > 220),
    };
  }
}

export const operationalAnalyticsRegistry = new OperationalAnalyticsRegistry();
