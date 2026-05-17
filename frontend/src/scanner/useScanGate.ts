// src/scanner/useScanGate.ts
import { useCallback, useRef } from "react";

export function useScanGate() {
  const lockRef = useRef(false);
  const lastRef = useRef<{ value: string; ts: number }>({ value: "", ts: 0 });

  const canProcess = useCallback((value: string, debounceMs = 900) => {
    const now = Date.now();
    const last = lastRef.current;

    if (lockRef.current) return false;

    if (last.value === value && now - last.ts < debounceMs) return false;

    lastRef.current = { value, ts: now };
    lockRef.current = true;
    return true;
  }, []);

  const release = useCallback((afterMs = 250) => {
    setTimeout(() => {
      lockRef.current = false;
    }, afterMs);
  }, []);

  return { canProcess, release };
}
