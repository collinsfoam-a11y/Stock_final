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
 * Hook to listen for hardware barcode scanners (HID keyboards).
 * It detects rapid keystrokes followed by an Enter key.
 */
export function useHardwareScanner({
  onScan,
  keyDelayThreshold = 50,
  minLength = 4,
  isActive = true,
}: UseHardwareScannerProps) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);

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
          onScan(bufferRef.current);
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
  }, [isActive, keyDelayThreshold, minLength, onScan]);

  // For native, implementing a global key listener requires native modules
  // (like react-native-keyevent). For now, we rely on the camera scanner or
  // manual entry fields for native, while web gets the HID listener.
}
