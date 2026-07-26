import { mmkvStorage } from "@/services/mmkvStorage";

export type ControlPlaneMetricName =
  | "projection_read_hit_count"
  | "projection_fallback_count"
  | "projection_strict_error_count"
  | "sync_retry_count"
  | "sync_success_count"
  | "sync_failure_count";

const metricKey = (name: ControlPlaneMetricName) => `cp_metric:${name}`;

export const incrementControlPlaneMetric = (
  name: ControlPlaneMetricName,
  incrementBy: number = 1
): number => {
  const currentValue = Number.parseInt(mmkvStorage.getItem(metricKey(name)) || "0", 10);
  const nextValue = currentValue + incrementBy;
  mmkvStorage.setItem(metricKey(name), String(nextValue));
  return nextValue;
};

export const getControlPlaneMetric = (name: ControlPlaneMetricName): number =>
  Number.parseInt(mmkvStorage.getItem(metricKey(name)) || "0", 10);
