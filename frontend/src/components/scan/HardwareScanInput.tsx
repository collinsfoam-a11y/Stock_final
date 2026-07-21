import React, { useCallback, useEffect, useRef } from "react";
import { Platform, StyleSheet, TextInput } from "react-native";

/**
 * Invisible input that captures keystroke-wedge scanner output on NATIVE.
 *
 * Zebra DataWedge, Honeywell scan wedge, and Bluetooth HID scanners all
 * default to emulating a keyboard: rapid character events terminated by an
 * Enter/submit. React Native has no global key listener without a native
 * module, but a focused TextInput receives those keystrokes -- so this
 * component keeps an off-screen input focused while the scan surface is
 * active and treats fast input bursts ending in submit as scans.
 *
 * Human typing is filtered the same way the web HID listener
 * (useHardwareScanner) does: characters must arrive faster than
 * `keyDelayThreshold` ms apart and the final code must reach `minLength`.
 *
 * Scanner priority (see docs/architecture/ADR-002-scanner-priority.md):
 *   dedicated / Bluetooth wedge (this input, zero taps) -> camera -> manual.
 * The camera path stays mounted; a wedge scan simply arrives first.
 */
export interface HardwareScanInputProps {
  onScan: (code: string) => void;
  /** Only keep focus while true (screen focused, no modal on top). */
  isActive: boolean;
  minLength?: number;
  keyDelayThreshold?: number;
  testID?: string;
}

export function HardwareScanInput({
  onScan,
  isActive,
  minLength = 4,
  keyDelayThreshold = 80,
  testID = "hardware-scan-input",
}: HardwareScanInputProps) {
  const inputRef = useRef<TextInput | null>(null);
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (isActive) {
      inputRef.current?.focus();
    }
  }, [isActive]);

  const handleChangeText = useCallback(
    (text: string) => {
      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // A slow keystroke means a human is typing, not a scanner burst;
      // restart the buffer from the newest character.
      if (timeSinceLastKey > keyDelayThreshold && text.length > bufferRef.current.length + 1) {
        bufferRef.current = text;
        return;
      }
      bufferRef.current = text;
    },
    [keyDelayThreshold],
  );

  const flushScan = useCallback(() => {
    const code = bufferRef.current.trim();
    bufferRef.current = "";
    inputRef.current?.clear();
    if (code.length >= minLength) {
      onScanRef.current(code);
    }
  }, [minLength]);

  if (Platform.OS === "web" || !isActive) {
    // Web already has the window-level HID listener (useHardwareScanner).
    return null;
  }

  return (
    <TextInput
      ref={inputRef}
      testID={testID}
      style={styles.hidden}
      autoFocus
      autoCorrect={false}
      autoCapitalize="none"
      caretHidden
      showSoftInputOnFocus={false}
      blurOnSubmit={false}
      onChangeText={handleChangeText}
      onSubmitEditing={flushScan}
      onBlur={() => {
        if (isActive) inputRef.current?.focus();
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    top: -100,
    left: -100,
  },
});

export default HardwareScanInput;
