import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

import { uxProbe } from "@/utils/uxProbe";

interface UseIdleProbeOptions {
  enabled?: boolean;
  pollMs?: number;
  thresholdMs?: number;
}

export function useIdleProbe(
  screen: string,
  { enabled = true, pollMs = 1000, thresholdMs = 2000 }: UseIdleProbeOptions = {}
) {
  const lastActionAtRef = useRef(Date.now());
  const lastIdleEmissionAtRef = useRef<number | null>(null);

  const markAction = useCallback(() => {
    const now = Date.now();
    lastActionAtRef.current = now;
    lastIdleEmissionAtRef.current = null;
  }, []);

  useEffect(() => {
    if (!__DEV__ || !enabled) return;

    markAction();

    const intervalId = setInterval(() => {
      const now = Date.now();
      const idleMs = now - lastActionAtRef.current;

      if (idleMs < thresholdMs) return;

      if (
        lastIdleEmissionAtRef.current !== null &&
        now - lastIdleEmissionAtRef.current < thresholdMs
      ) {
        return;
      }

      uxProbe({ t: "idle_pause", screen, ms: idleMs });
      lastIdleEmissionAtRef.current = now;
      lastActionAtRef.current = now;
    }, pollMs);

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const handleWindowAction = () => {
        markAction();
      };
      const eventNames: (keyof WindowEventMap)[] = ["click", "keydown", "touchstart"];

      eventNames.forEach((eventName) =>
        window.addEventListener(eventName, handleWindowAction, { passive: true })
      );

      return () => {
        clearInterval(intervalId);
        eventNames.forEach((eventName) =>
          window.removeEventListener(eventName, handleWindowAction)
        );
      };
    }

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, markAction, pollMs, screen, thresholdMs]);

  return { markAction };
}
