# Operational Telemetry Pilot Guide

## Purpose

The production pilot telemetry layer measures warehouse workflow health without changing the operator experience. It is designed for scan speed, offline resilience, supervisor throughput, runtime stability, and future audit exports.

## Architecture

- `frontend/src/services/observability/operationalTelemetry.ts` is the only implementation owner for operational event buffering.
- `frontend/src/services/observability/operationalAnalyticsRegistry.ts` derives pilot analytics from buffered telemetry events.
- Events are stored in a capped local ring buffer and persisted through the existing Expo-compatible storage path.
- Telemetry calls are synchronous, lightweight, and scheduled for persistence; UI interactions do not wait for network or export work.
- Raw identifiers such as barcodes, serials, item codes, session IDs, users, tokens, and payload-like values are redacted or hashed at the service boundary.

## Instrumented Surfaces

- Scanner workflows: camera capture, buffered scans, lookup completion, feedback visibility, serial scan completion, duplicate and invalid outcomes.
- Queue workflows: offline enqueue, queue flush, sync runs, skipped sync runs, queue keyboard traversal.
- Supervisor productivity: command execution, keyboard shortcut usage, split-view layout changes.
- Runtime observation: sampled FPS, render duration estimate, memory signals where available.

## Pilot Metrics

- Scanner: success rate, duplicate rate, invalid rate, lookup latency, serial scan throughput, offline scan count, retry frequency.
- Queue: queue throughput, sync reliability, skipped sync runs, average flush duration, oldest offline queue age.
- Workflow: command usage, keyboard adoption, queue traversal count, split-view layout changes, recount frequency.
- Runtime: average FPS, dropped-frame signals, render duration, memory spike signals.

## Pilot Targets

- Scan feedback should be visible within 100 ms of a confident capture.
- Average lookup latency should stay below 1200 ms during the pilot.
- Sync reliability should remain at or above 90% for queued operational work.
- Runtime telemetry should avoid repeated low-FPS signals during dense queue traversal.
- Duplicate and invalid scan rates should be reviewed by supervisors when they indicate label ambiguity or operator uncertainty.

## Alert Foundation

The analytics registry can produce future alert candidates for:

- elevated scan lookup latency
- elevated duplicate scan rate
- sync reliability below pilot target
- repeated runtime frame-drop signals

Alerts are advisory only in this phase. They are intentionally quiet and aggregate-oriented to avoid alert fatigue.

## Governance

Runtime governance now checks for:

- multiple telemetry implementation owners
- awaited or blocking operational telemetry calls
- direct telemetry network calls
- screen-local telemetry buffers

New instrumentation should use `operationalTelemetry` or `operationalAnalyticsRegistry` rather than implementing feature-local analytics stores.

## Known Advisory Risks

- Existing UI governance still tracks P2 token, accessibility, and motion coverage debt.
- The Jest suite passes but still emits an existing open-handle teardown warning.
- Telemetry export to backend or ERP is intentionally not enabled in this phase; local buffering is the production pilot foundation.
