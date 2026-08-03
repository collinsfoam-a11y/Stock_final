/**
 * useSafeAsync Hook
 * Combines safe state management with safe async operations
 * Prevents state updates on unmounted components and handles async errors gracefully
 */

import { useRef, useCallback, useEffect } from "react";
import { safeAsync } from "@/utils/safeRender";

/**
 * Hook that provides safe async operations with unmount protection
 */
export function useSafeAsync() {
  const mountedRef = useRef(true);

  useEffect(() => {
    const cleanup = () => {
      mountedRef.current = false;
    };

    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
      window.addEventListener("beforeunload", cleanup);
      return () => {
        window.removeEventListener("beforeunload", cleanup);
        cleanup();
      };
    }

    return () => {
      cleanup();
    };
  }, []);

  const safeSetState = useCallback(
    <T>(setter: (value: T) => void, value: T) => {
      if (mountedRef.current) {
        setter(value);
      }
    },
    [],
  );

  const safeAsyncOperation = useCallback(
    async <T>(
      operation: () => Promise<T>,
      fallback?: T,
      onError?: (error: Error) => void,
    ): Promise<T | undefined> => {
      if (!mountedRef.current) {
        return fallback;
      }
      return safeAsync(operation, fallback, onError);
    },
    [],
  );

  return {
    safeSetState,
    safeAsync: safeAsyncOperation,
    mountedRef,
  };
}
