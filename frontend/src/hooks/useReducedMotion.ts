import React from "react";
import { AccessibilityInfo, Platform } from "react-native";

const WEB_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";
type ReducedMotionListener = (enabled: boolean) => void;

let cachedReducedMotion = false;
let initialized = false;
const listeners = new Set<ReducedMotionListener>();

function emit(enabled: boolean) {
  cachedReducedMotion = enabled;
  for (const listener of listeners) {
    listener(enabled);
  }
}

function ensureReducedMotionSubscription() {
  if (initialized) return;
  initialized = true;

  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    const mediaQuery = window.matchMedia(WEB_MEDIA_QUERY);
    const handleChange = (event: { matches: boolean }) => {
      emit(event.matches);
    };

    emit(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return;
    }

    mediaQuery.addListener(handleChange);
    return;
  }

  AccessibilityInfo.isReduceMotionEnabled()
    .then((enabled) => emit(enabled))
    .catch(() => emit(false));

  AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
    emit(enabled);
  });
}

export function useReducedMotion() {
  const [reducedMotionEnabled, setReducedMotionEnabled] = React.useState(cachedReducedMotion);

  React.useEffect(() => {
    const listener = (enabled: boolean) => setReducedMotionEnabled(enabled);
    listeners.add(listener);
    ensureReducedMotionSubscription();
    setReducedMotionEnabled(cachedReducedMotion);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return reducedMotionEnabled;
}


