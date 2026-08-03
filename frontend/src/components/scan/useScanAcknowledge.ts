/**
 * useScanAcknowledge — instant scan-feedback state machine (P2 / OXS §6.1).
 *
 * Governance §6.1: "Visual acknowledgment must appear within 100ms of scan
 * recognition when possible. Haptic/audio acknowledgment must not block UI
 * update."
 *
 * This hook exposes a fire-and-forget `acknowledge(state, message?)` that flips
 * a state value the UI can render IMMEDIATELY (synchronously on the next paint)
 * — before any network lookup resolves. It auto-clears after `durationMs` so the
 * caller never has to manage dismissal timers.
 *
 * It does NOT perform haptics/audio itself (those live in `useScanBuffer` and
 * are non-blocking). Its sole job is the visual layer.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type ScanAcknowledgeState = "idle" | "success" | "duplicate" | "error";

export const SCAN_ACK_DEFAULT_MESSAGES: Record<Exclude<ScanAcknowledgeState, "idle">, string> = {
  success: "Saved",
  duplicate: "Already counted",
  error: "Not found",
};

export interface UseScanAcknowledgeResult {
  state: ScanAcknowledgeState;
  message: string;
  /** Flip the acknowledge state. Auto-clears after the configured duration. */
  acknowledge: (next: ScanAcknowledgeState, message?: string) => void;
  /** Manually clear back to idle. */
  clear: () => void;
}

/**
 * @param durationMs how long the non-idle state persists before auto-clearing.
 *   Defaults to 900ms — long enough to read, short enough to not block the next scan.
 */
export function useScanAcknowledge(durationMs = 900): UseScanAcknowledgeResult {
  const [state, setState] = useState<ScanAcknowledgeState>("idle");
  const [message, setMessage] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState("idle");
    setMessage("");
  }, []);

  const acknowledge = useCallback(
    (next: ScanAcknowledgeState, msg?: string) => {
      if (next === "idle") {
        clear();
        return;
      }
      setState(next);
      setMessage(msg?.trim() || SCAN_ACK_DEFAULT_MESSAGES[next]);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setState("idle");
        setMessage("");
      }, durationMs);
    },
    [clear, durationMs]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { state, message, acknowledge, clear };
}
