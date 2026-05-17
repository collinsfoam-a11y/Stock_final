const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

export const CONTROL_PLANE_PROJECTION_VERSION = "v4-control-plane";

export const controlPlaneFlags = {
  enableEventDrivenCountLines: parseBoolean(
    process.env.EXPO_PUBLIC_CP_EVENT_DRIVEN_COUNT_LINES,
    true
  ),
  enableEventDrivenCountLineReviews: parseBoolean(
    process.env.EXPO_PUBLIC_CP_EVENT_DRIVEN_COUNT_LINE_REVIEWS,
    true
  ),
  enableEventDrivenSessions: parseBoolean(process.env.EXPO_PUBLIC_CP_EVENT_DRIVEN_SESSIONS, true),
  enableProjectionReads: parseBoolean(process.env.EXPO_PUBLIC_CP_PROJECTION_READS, true),
  strictProjectionReads: parseBoolean(process.env.EXPO_PUBLIC_CP_STRICT_PROJECTION_READS, false),
};
