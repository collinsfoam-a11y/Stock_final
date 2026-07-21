# ADR-002: Scanner Input Priority and Zero-Tap Capture

Status: Accepted (v2.2)
Date: 2026-07-20

## Context

v2.2 Priority 3 requires dedicated warehouse scanner support with zero taps
on rugged devices, with the priority chain:

```
Dedicated scanner -> Bluetooth scanner -> Camera -> Manual entry
```

Zebra (DataWedge), Honeywell (scan wedge), and generic Bluetooth scanners
all support **keyboard-wedge / HID mode**: scans arrive as rapid keystrokes
terminated by Enter. Intent-based APIs (DataWedge intents, Honeywell
`com.honeywell.aidc`) deliver richer metadata but require native modules and
per-vendor code paths that cannot be validated without physical devices.

## Decision

Support all vendor scanners through their common denominator, keyboard-wedge
mode, with two capture paths:

- **Web** (`useHardwareScanner`): window-level keydown listener detecting
  rapid keystroke bursts terminated by Enter (already shipped).
- **Native** (`HardwareScanInput`, flag `enableNativeHardwareScanner`): an
  invisible always-focused `TextInput` (soft keyboard suppressed) mounted on
  the scan screen. Wedge keystrokes land in it with zero taps; human typing
  is filtered by inter-key timing (>80 ms restarts the buffer) and a minimum
  code length.

Priority is emergent rather than orchestrated: the wedge input and the
camera path are both live, and whichever produces a code first wins; both
feed the same `handleBarcodeScan` pipeline (throttle manager dedupes).
Manual entry remains the explicit fallback UI.

Vendor intent APIs (DataWedge/Honeywell) are deliberately deferred: they
need native modules (`react-native-datawedge-intent` or custom
BroadcastReceivers) and on-device validation. The wedge path covers those
devices today because both vendors ship keyboard output as a built-in
profile option; the intent integration can slot behind the same
`HardwareScanInput` contract later without touching the scan pipeline.

## Consequences

- Zero-tap scanning works on Zebra/Honeywell/Bluetooth devices configured
  for keyboard output -- an ops-side profile setting, documented in the
  operator runbook, instead of app-side vendor SDKs.
- The hidden input holds focus on the scan screen; it is unmounted whenever
  a modal is on top or the screen loses focus so form fields are unaffected
  (`isActive` gating).
- The flag ships **off** until validated on physical scanners.
