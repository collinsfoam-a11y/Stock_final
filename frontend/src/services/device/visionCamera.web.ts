import React, { forwardRef } from "react";
import { StyleSheet, Text, View, type ViewProps } from "react-native";

// Web has no vision-camera support. Report "no permission / cannot ask" so
// callers route to their manual-entry / hardware-scanner fallback UI instead
// of rendering a camera surface that can never scan or capture.
//
// NOTE: this file must stay `.web.ts` (not `.web.tsx`). Metro resolves
// platform variants per extension in sourceExts order, so `visionCamera.ts`
// would win over `visionCamera.web.tsx` and the native re-export would crash
// the whole web bundle ("VisionCamera currently does not work on web").
export function useCameraPermission() {
  return {
    hasPermission: false,
    requestPermission: async () => false,
  };
}

export function useCameraDevice(_deviceType: "back" | "front") {
  // No camera device on web -> callers render their "device not found" state.
  return undefined;
}

export function useCodeScanner(options: any) {
  return {
    codeTypes: options?.codeTypes || [],
    onCodeScanned: options?.onCodeScanned,
  };
}

export type BarcodeScanningResult = {
  data: string;
  type?: string;
};

type CameraProps = ViewProps & {
  device?: any;
  isActive?: boolean;
  codeScanner?: any;
  torch?: "on" | "off";
  zoom?: number;
};

export const Camera = forwardRef<any, CameraProps>(function CameraWebFallback(
  { style, children, ...props },
  ref,
) {
  return React.createElement(
    View,
    { style: [style, styles.container], ref, ...props },
    React.createElement(Text, { style: styles.text }, "Camera unavailable on web"),
    React.createElement(
      Text,
      { style: styles.subtext },
      "Use a handheld/HID barcode scanner or manual entry, or open the app on " +
        "an iOS/Android device to scan with the built-in camera.",
    ),
    children,
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtext: {
    color: "#aaa",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
