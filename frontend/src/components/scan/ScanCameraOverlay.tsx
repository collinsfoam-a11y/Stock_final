import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Camera, useCameraDevice, useCodeScanner } from "@/services/device/visionCamera";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import ModernButton from "@/components/ui/ModernButton";
import { borderRadius, colors, spacing, typography } from "@/theme/legacyCompat";

interface ScanCameraOverlayProps {
  animatedCorners: any;
  animatedScanLine: any;
  onBarcodeScanned: (payload: { data: string }) => void;
  onClose: () => void;
  permission?: { granted?: boolean } | null;
  requestPermission: () => unknown | Promise<unknown>;
  scanned: boolean;
  timeoutSeconds?: number;
}

export function ScanCameraOverlay({
  animatedCorners,
  animatedScanLine,
  onBarcodeScanned,
  onClose,
  permission,
  requestPermission,
  scanned,
  timeoutSeconds = 30,
}: ScanCameraOverlayProps) {
  const device = useCameraDevice("back");
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    if (timeoutSeconds <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      onClose();
    }, timeoutSeconds * 1000);

    return () => clearTimeout(timer);
  }, [onClose, timeoutSeconds]);

  useEffect(() => {
    if (device?.neutralZoom) {
      setZoomLevel(device.neutralZoom);
    }
  }, [device?.neutralZoom]);

  const codeScanner = useCodeScanner({
    codeTypes: ["ean-13", "ean-8", "upc-a", "upc-e", "code-128", "code-39", "qr"],
    onCodeScanned: (codes: any) => {
      if (!scanned && codes.length > 0) {
        onBarcodeScanned({ data: codes[0].value || "" });
      }
    },
  });

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>We need your permission to show the camera</Text>
        <ModernButton onPress={requestPermission} title="Grant Permission" />
        <ModernButton
          onPress={onClose}
          title="Cancel"
          variant="outline"
          style={{ marginTop: spacing.md }}
        />
      </View>
    );
  }

  const toggleTorch = () => setIsTorchOn((prev) => !prev);
  
  const handleZoomIn = () => {
    if (device?.maxZoom) {
      setZoomLevel((prev) => Math.min(prev + 1, device.maxZoom));
    }
  };
  
  const handleZoomOut = () => {
    if (device?.minZoom) {
      setZoomLevel((prev) => Math.max(prev - 1, device.minZoom));
    }
  };

  if (!device) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera device not found</Text>
        <ModernButton onPress={onClose} title="Cancel" variant="outline" />
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!scanned}
        codeScanner={codeScanner}
        torch={device.hasTorch && isTorchOn ? "on" : "off"}
        zoom={zoomLevel}
      >
        <SafeAreaView style={styles.cameraOverlay}>
          <View style={styles.cameraHeader}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeCameraButton}
              accessibilityRole="button"
              accessibilityLabel="Close camera"
            >
              <Ionicons name="close" size={28} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>Scan Barcode</Text>
            <View style={{ flex: 1 }} />
            {device.hasTorch && (
              <TouchableOpacity
                onPress={toggleTorch}
                style={[styles.closeCameraButton, { backgroundColor: isTorchOn ? colors.primary[500] : "rgba(0,0,0,0.5)" }]}
              >
                <Ionicons name={isTorchOn ? "flashlight" : "flashlight-outline"} size={24} color={colors.white} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.scanFrameContainer}>
            <View style={styles.scanFrameWrapper}>
              <Animated.View
                style={[styles.cornerBracket, styles.cornerTopLeft, animatedCorners]}
              />
              <Animated.View
                style={[styles.cornerBracket, styles.cornerTopRight, animatedCorners]}
              />
              <Animated.View
                style={[styles.cornerBracket, styles.cornerBottomLeft, animatedCorners]}
              />
              <Animated.View
                style={[styles.cornerBracket, styles.cornerBottomRight, animatedCorners]}
              />

              <Animated.View style={[styles.scanLine, animatedScanLine]} />
            </View>
            <Text style={styles.scanInstruction}>Align barcode within frame</Text>
            <Text style={styles.scanTimeoutText}>
              Scanner closes after {timeoutSeconds}s of inactivity
            </Text>
            
            <View style={styles.zoomControls}>
              <TouchableOpacity style={styles.zoomButton} onPress={handleZoomOut}>
                <Ionicons name="remove-circle-outline" size={32} color={colors.white} />
              </TouchableOpacity>
              <Text style={styles.zoomText}>{zoomLevel.toFixed(1)}x</Text>
              <TouchableOpacity style={styles.zoomButton} onPress={handleZoomIn}>
                <Ionicons name="add-circle-outline" size={32} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Camera>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,
    backgroundColor: "black",
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: "space-between",
  },
  cameraHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
  },
  closeCameraButton: {
    padding: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: borderRadius.full,
  },
  cameraTitle: {
    color: colors.white,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.md,
  },
  scanFrameContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrameWrapper: {
    width: 280,
    height: 280,
    position: "relative",
  },
  cornerBracket: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: colors.white,
    borderWidth: 4,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: borderRadius.xl,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: borderRadius.xl,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: borderRadius.xl,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: borderRadius.xl,
  },
  scanLine: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 0,
    height: 2,
    backgroundColor: colors.primary[400],
  },
  scanInstruction: {
    color: colors.white,
    marginTop: spacing.xl,
    fontSize: typography.fontSize.base,
    fontWeight: "500",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    overflow: "hidden",
  },
  scanTimeoutText: {
    color: "rgba(255,255,255,0.8)",
    marginTop: spacing.md,
    fontSize: typography.fontSize.xs,
    fontWeight: "500",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: colors.gray[50],
  },
  permissionText: {
    fontSize: typography.fontSize.lg,
    textAlign: "center",
    marginBottom: spacing.xl,
    color: colors.gray[700],
    lineHeight: 28,
  },
  zoomControls: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xl,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  zoomButton: {
    padding: spacing.xs,
  },
  zoomText: {
    color: colors.white,
    fontSize: typography.fontSize.lg,
    fontWeight: "600",
    marginHorizontal: spacing.md,
  }
});
