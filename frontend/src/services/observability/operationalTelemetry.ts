import { Platform } from "react-native";

import { createLogger } from "@/services/logging";
import { mmkvStorage } from "@/services/mmkvStorage";

const log = createLogger("OperationalTelemetry");

const STORAGE_KEY = "operational_telemetry_buffer:v1";
const MAX_BUFFERED_EVENTS = 400;
const DEFAULT_DEDUPE_WINDOW_MS = 250;
const PERSIST_DELAY_MS = 1200;

export const OPERATIONAL_TELEMETRY_EVENT_REGISTRY = {
  SCAN_CAPTURED: "scanner.scan_captured",
  SCAN_BUFFERED: "scanner.scan_buffered",
  SCAN_LOOKUP_COMPLETED: "scanner.lookup_completed",
  SCAN_FEEDBACK_VISIBLE: "scanner.feedback_visible",
  SERIAL_SCAN_COMPLETED: "scanner.serial_completed",
  OFFLINE_SCAN_QUEUED: "scanner.offline_queued",
  QUEUE_ENQUEUED: "queue.enqueued",
  QUEUE_FLUSH_STARTED: "queue.flush_started",
  QUEUE_FLUSH_COMPLETED: "queue.flush_completed",
  QUEUE_TRAVERSAL: "queue.traversal",
  SYNC_RUN_STARTED: "queue.sync_run_started",
  SYNC_RUN_SKIPPED: "queue.sync_run_skipped",
  SYNC_RUN_COMPLETED: "queue.sync_run_completed",
  COMMAND_EXECUTED: "workflow.command_executed",
  KEYBOARD_SHORTCUT_USED: "workflow.keyboard_shortcut_used",
  WORKFLOW_ACTION: "workflow.action",
  SPLIT_VIEW_LAYOUT: "runtime.split_view_layout",
  RUNTIME_SAMPLE: "runtime.performance_sample",
  TIMING_MARK: "runtime.timing_mark",
} as const;

export type OperationalTelemetryEventName =
  (typeof OPERATIONAL_TELEMETRY_EVENT_REGISTRY)[keyof typeof OPERATIONAL_TELEMETRY_EVENT_REGISTRY];

export type OperationalTelemetryCategory =
  | "scanner"
  | "queue"
  | "workflow"
  | "runtime"
  | "command"
  | "split_view"
  | "pilot_alert";

export type OperationalTelemetryOutcome =
  | "success"
  | "failure"
  | "warning"
  | "duplicate"
  | "invalid"
  | "blocked"
  | "skipped"
  | "pending"
  | "offline"
  | "not_found";

export type OperationalTelemetryValue = string | number | boolean | null;

export interface OperationalTelemetryEvent {
  id: string;
  name: OperationalTelemetryEventName;
  category: OperationalTelemetryCategory;
  timestamp: string;
  platform: string;
  surface?: string;
  outcome?: OperationalTelemetryOutcome;
  durationMs?: number;
  count?: number;
  tags?: Record<string, OperationalTelemetryValue>;
  metrics?: Record<string, number>;
}

export interface OperationalTelemetryInput {
  name: OperationalTelemetryEventName;
  category: OperationalTelemetryCategory;
  surface?: string;
  outcome?: OperationalTelemetryOutcome;
  durationMs?: number;
  count?: number;
  tags?: Record<string, unknown>;
  metrics?: Record<string, number | null | undefined>;
}

export interface OperationalTelemetryTrackOptions {
  dedupeMs?: number;
  sampleRate?: number;
}

export interface OperationalTelemetryRuntimeSnapshot {
  bufferedEvents: number;
  droppedEvents: number;
  dedupedEvents: number;
  sampledOutEvents: number;
  lastPersistedAt: string | null;
}

type TimingMark = {
  id: string;
  name: OperationalTelemetryEventName;
  category: OperationalTelemetryCategory;
  startedAt: number;
  surface?: string;
  tags?: Record<string, unknown>;
};

const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const makeEventId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const roundMetric = (value: number) => Math.round(value * 100) / 100;

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const isSensitiveKey = (key: string) =>
  /(barcode|serial|item_?code|session_?id|user|staff|email|phone|token|password|secret|payload|data|name)$/i.test(
    key
  );

const normalizeTagValue = (key: string, value: unknown): Record<string, OperationalTelemetryValue> => {
  if (value === null || value === undefined) return {};

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return {};
    return { [key]: roundMetric(value) };
  }

  if (typeof value === "boolean") {
    return { [key]: value };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    if (isSensitiveKey(key)) {
      return {
        [`${key}Hash`]: hashString(trimmed),
        [`${key}Length`]: trimmed.length,
      };
    }
    return { [key]: trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed };
  }

  if (Array.isArray(value)) {
    return { [`${key}Count`]: value.length };
  }

  if (typeof value === "object") {
    return { [`${key}Present`]: true };
  }

  return {};
};

const sanitizeTags = (tags?: Record<string, unknown>): Record<string, OperationalTelemetryValue> | undefined => {
  if (!tags) return undefined;

  const sanitized: Record<string, OperationalTelemetryValue> = {};
  for (const [key, value] of Object.entries(tags)) {
    Object.assign(sanitized, normalizeTagValue(key, value));
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

const sanitizeMetrics = (
  metrics?: Record<string, number | null | undefined>
): Record<string, number> | undefined => {
  if (!metrics) return undefined;

  const sanitized: Record<string, number> = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[key] = roundMetric(value);
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

export class OperationalTelemetryService {
  private buffer: OperationalTelemetryEvent[] = [];
  private marks = new Map<string, TimingMark>();
  private dedupeIndex = new Map<string, number>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private droppedEvents = 0;
  private dedupedEvents = 0;
  private sampledOutEvents = 0;
  private lastPersistedAt: string | null = null;

  constructor() {
    this.buffer = this.loadPersistedBuffer();
  }

  track(input: OperationalTelemetryInput, options: OperationalTelemetryTrackOptions = {}): void {
    const sampleRate = options.sampleRate ?? 1;
    if (sampleRate < 1 && Math.random() > sampleRate) {
      this.sampledOutEvents += 1;
      return;
    }

    const timestamp = new Date().toISOString();
    const event: OperationalTelemetryEvent = {
      id: makeEventId(),
      name: input.name,
      category: input.category,
      timestamp,
      platform: Platform.OS,
      surface: input.surface,
      outcome: input.outcome,
      durationMs:
        typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
          ? roundMetric(input.durationMs)
          : undefined,
      count:
        typeof input.count === "number" && Number.isFinite(input.count)
          ? Math.max(0, Math.round(input.count))
          : undefined,
      tags: sanitizeTags(input.tags),
      metrics: sanitizeMetrics(input.metrics),
    };

    const dedupeMs = options.dedupeMs ?? DEFAULT_DEDUPE_WINDOW_MS;
    const signature = this.eventSignature(event);
    const signatureNow = Date.now();
    const lastSeenAt = this.dedupeIndex.get(signature) ?? 0;
    if (dedupeMs > 0 && signatureNow - lastSeenAt < dedupeMs) {
      this.dedupedEvents += 1;
      return;
    }
    this.dedupeIndex.set(signature, signatureNow);

    this.buffer.push(event);
    if (this.buffer.length > MAX_BUFFERED_EVENTS) {
      const overflow = this.buffer.length - MAX_BUFFERED_EVENTS;
      this.buffer = this.buffer.slice(overflow);
      this.droppedEvents += overflow;
    }

    this.schedulePersist();
  }

  markStart(input: Omit<OperationalTelemetryInput, "durationMs" | "outcome">): string {
    const id = makeEventId();
    this.marks.set(id, {
      id,
      name: input.name,
      category: input.category,
      surface: input.surface,
      startedAt: nowMs(),
      tags: input.tags,
    });
    return id;
  }

  markEnd(
    id: string | null | undefined,
    outcome: OperationalTelemetryOutcome,
    tags?: Record<string, unknown>,
    metrics?: Record<string, number | null | undefined>
  ): void {
    if (!id) return;
    const mark = this.marks.get(id);
    if (!mark) return;
    this.marks.delete(id);

    this.track({
      name: mark.name,
      category: mark.category,
      surface: mark.surface,
      outcome,
      durationMs: nowMs() - mark.startedAt,
      tags: {
        ...mark.tags,
        ...tags,
      },
      metrics,
    });
  }

  trackScanner(
    name: OperationalTelemetryEventName,
    outcome: OperationalTelemetryOutcome,
    tags?: Record<string, unknown>,
    metrics?: Record<string, number | null | undefined>
  ): void {
    this.track({
      name,
      category: "scanner",
      outcome,
      surface: "scanner",
      tags,
      metrics,
    });
  }

  trackQueue(
    name: OperationalTelemetryEventName,
    outcome: OperationalTelemetryOutcome,
    tags?: Record<string, unknown>,
    metrics?: Record<string, number | null | undefined>
  ): void {
    this.track({
      name,
      category: "queue",
      outcome,
      surface: "queue",
      tags,
      metrics,
    });
  }

  trackRuntime(
    name: OperationalTelemetryEventName,
    tags?: Record<string, unknown>,
    metrics?: Record<string, number | null | undefined>,
    options?: OperationalTelemetryTrackOptions
  ): void {
    this.track(
      {
        name,
        category: "runtime",
        surface: "runtime",
        tags,
        metrics,
      },
      options
    );
  }

  getBufferedEvents(): OperationalTelemetryEvent[] {
    return [...this.buffer];
  }

  drainBatch(limit = 50): OperationalTelemetryEvent[] {
    const batch = this.buffer.slice(0, Math.max(0, limit));
    this.buffer = this.buffer.slice(batch.length);
    this.persistNow();
    return batch;
  }

  getRuntimeSnapshot(): OperationalTelemetryRuntimeSnapshot {
    return {
      bufferedEvents: this.buffer.length,
      droppedEvents: this.droppedEvents,
      dedupedEvents: this.dedupedEvents,
      sampledOutEvents: this.sampledOutEvents,
      lastPersistedAt: this.lastPersistedAt,
    };
  }

  persistNow(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }

    try {
      mmkvStorage.setItem(STORAGE_KEY, JSON.stringify(this.buffer));
      this.lastPersistedAt = new Date().toISOString();
    } catch (error) {
      log.warn("Failed to persist operational telemetry", { error: String(error) });
    }
  }

  clearForTests(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.buffer = [];
    this.marks.clear();
    this.dedupeIndex.clear();
    this.droppedEvents = 0;
    this.dedupedEvents = 0;
    this.sampledOutEvents = 0;
    this.lastPersistedAt = null;
    mmkvStorage.removeItem(STORAGE_KEY);
  }

  private loadPersistedBuffer(): OperationalTelemetryEvent[] {
    const raw = mmkvStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((event): event is OperationalTelemetryEvent => Boolean(event?.name && event?.timestamp))
        .slice(-MAX_BUFFERED_EVENTS);
    } catch (error) {
      log.warn("Failed to load operational telemetry buffer", { error: String(error) });
      return [];
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, PERSIST_DELAY_MS);
    this.persistTimer.unref?.();
  }

  private eventSignature(event: OperationalTelemetryEvent): string {
    const tags = event.tags ? JSON.stringify(event.tags) : "";
    return [event.name, event.category, event.surface, event.outcome, tags].join("|");
  }
}

export const operationalTelemetry = new OperationalTelemetryService();
