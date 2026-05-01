export type UXEvent =
  | { t: "scan_success"; itemCode: string }
  | { t: "scan_error"; reason: string }
  | { t: "save_next"; itemCode: string }
  | { t: "resolve_diff"; action: "accept_counted" | "accept_system" | "edit_qty" }
  | { t: "nav_confusion"; screen: string; note?: string }
  | { t: "idle_pause"; screen: string; ms: number }
  | { t: "finish_rack"; action: "open" | "cancel" | "confirm" };

export type BufferedUXEvent = UXEvent & { ts: number };

type UXProbeHost = typeof globalThis & {
  __UX_PROBE_EVENTS__?: BufferedUXEvent[];
};

const UX_PROBE_LIMIT = 500;
const uxProbeHost = globalThis as UXProbeHost;

export function uxProbe(event: UXEvent) {
  if (!__DEV__) return;

  const bufferedEvent: BufferedUXEvent = {
    ts: Date.now(),
    ...event,
  };

  const nextEvents = [...(uxProbeHost.__UX_PROBE_EVENTS__ ?? []), bufferedEvent].slice(
    -UX_PROBE_LIMIT
  );

  uxProbeHost.__UX_PROBE_EVENTS__ = nextEvents;
  console.log("[UX_PROBE]", JSON.stringify(bufferedEvent));
}

export function readUxProbeBuffer(): BufferedUXEvent[] {
  return [...(uxProbeHost.__UX_PROBE_EVENTS__ ?? [])];
}

export function clearUxProbeBuffer() {
  if (!__DEV__) return;
  uxProbeHost.__UX_PROBE_EVENTS__ = [];
}
