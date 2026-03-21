export type DetectedCodeStatus = "ready" | "invalid" | "duplicate";

export type DetectedCode = {
  code: string;
  status: DetectedCodeStatus;
  message: string;
};

export const MAX_DETECTED_CODES = 20;
export const DEFAULT_SERIAL_RESCAN_WINDOW_MS = 900;

const DETECTED_STATUS_PRIORITY: Record<DetectedCodeStatus, number> = {
  ready: 0,
  duplicate: 1,
  invalid: 2,
};

export const createDetectedCodeList = (
  previous: DetectedCode[],
  next: DetectedCode,
  max: number = MAX_DETECTED_CODES,
): DetectedCode[] => {
  const deduped = previous.filter((candidate) => candidate.code !== next.code);
  return [next, ...deduped]
    .slice(0, max)
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const priorityDelta =
        DETECTED_STATUS_PRIORITY[a.candidate.status] -
        DETECTED_STATUS_PRIORITY[b.candidate.status];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return a.index - b.index;
    })
    .map(({ candidate }) => candidate);
};

export const nextAfterSerialAdded = (_state: { scanPaused: boolean }) => ({
  scanPaused: true,
});

export const nextAfterResume = (_state: { scanPaused: boolean }) => ({
  scanPaused: false,
});

export const isScanLocked = (state: { scanPaused: boolean }) =>
  state.scanPaused;

export const clearRecentScanTimes = (recentScanTimes: Map<string, number>) => {
  recentScanTimes.clear();
};

export const isScanWithinRescanWindow = ({
  lastSeenAt,
  now,
  windowMs = DEFAULT_SERIAL_RESCAN_WINDOW_MS,
}: {
  lastSeenAt: number;
  now: number;
  windowMs?: number;
}) => {
  if (lastSeenAt <= 0) {
    return false;
  }

  return now - lastSeenAt < windowMs;
};
