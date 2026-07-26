import React, { forwardRef } from "react";
import { View, type ViewProps, Text, StyleSheet } from "react-native";

export function useCameraPermission() {
  return {
    hasPermission: true,
    requestPermission: async () => true,
  };
}

export function useCameraDevice(deviceType: "back" | "front") {
  // Web mock always returns a dummy device
  return {
    id: "web-mock-camera",
    name: "Web Mock Camera",
    position: deviceType,
  };
}

export function useCodeScanner(options: any) {
  // Web mock
  return {
    codeTypes: options?.codeTypes || [],
    onCodeScanned: options?.onCodeScanned,
  };
}

type CameraProps = ViewProps & {
  device?: any;
  isActive?: boolean;
  codeScanner?: any;
};

export const Camera = forwardRef<any, CameraProps>(({ style, isActive, ...props }, ref) => {
  return (
    <View style={[style, styles.container]} ref={ref} {...props}>
      <Text style={styles.text}>
        {isActive ? "Camera active (Web Mock)" : "Camera inactive (Web Mock)"}
      </Text>
      <Text style={styles.subtext}>
        Vision Camera is not supported on web.
        Please use iOS/Android device.
      </Text>
    </View>
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
  }
});
