export interface UXMetricEvent {
  data?: Record<string, unknown>;
  event: string;
  ts: number;
}

const events: UXMetricEvent[] = [];

export const uxMetrics = {
  log(event: string, data: Record<string, unknown> = {}) {
    events.push({
      event,
      ts: Date.now(),
      data,
    });
  },

  report() {
    return [...events];
  },

  reset() {
    events.length = 0;
  },
};
