import { useEffect, useRef } from "react";
import { Platform } from "react-native";

interface UseHardwareScannerProps {
  onScan: (data: string) => void;
  // Maximum time between keystrokes to be considered a scanner (ms)
  keyDelayThreshold?: number;
  // Minimum length of a barcode
  minLength?: number;
  // Whether the listener is active
  isActive?: boolean;
}

/**
 * Hook to listen for hardware barcode scanners (HID keyboards) on web.
 * It detects rapid keystrokes followed by an Enter key.
 *
 * The listener is registered once per activation; `onScan` is read through a
 * ref so an inline callback at the call site doesn't re-register the listener
 * on every render.
 */
export function useHardwareScanner({
  onScan,
  keyDelayThreshold = 50,
  minLength = 4,
  isActive = true,
}: UseHardwareScannerProps) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!isActive || Platform.OS !== "web") {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if a focused input is handling it
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;

      // If too much time has passed since the last key, it's probably human typing.
      // Reset the buffer.
      if (timeSinceLastKey > keyDelayThreshold) {
        bufferRef.current = "";
      }

      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        if (bufferRef.current.length >= minLength) {
          onScanRef.current(bufferRef.current);
          e.preventDefault();
        }
        bufferRef.current = "";
        return;
      }

      // Only capture single characters (ignore Shift, Ctrl, etc.)
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActive, keyDelayThreshold, minLength]);

  // For native, scanning goes through the built-in camera (vision-camera).
  // A global HID key listener on native would require a native module
  // (e.g. react-native-keyevent); web is the only platform that needs this.
}
