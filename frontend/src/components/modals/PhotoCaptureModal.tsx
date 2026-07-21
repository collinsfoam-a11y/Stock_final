/**
 * PhotoCaptureModal Component
 * Modal for capturing photos using the device camera
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera, useCameraDevice, useCameraPermission } from "@/services/device/visionCamera";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  modernColors,
  modernTypography,
  modernSpacing,
  modernBorderRadius,
} from "../../styles/unifiedSystem";

import { scrim, semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
import { useUiTokens } from "../../hooks/useUiTokens";
interface PhotoCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (photoUri: string) => void;
  title?: string;
  testID?: string;
}

export const PhotoCaptureModal: React.FC<PhotoCaptureModalProps> = ({
  visible,
  onClose,
  onCapture,
  title = "Capture Photo",
  testID,
}) => {
  const tokens = useUiTokens();
  const { hasPermission, requestPermission } = useCameraPermission();
  // vision-camera's requestPermission resolves false immediately (no prompt)
  // once the user has permanently denied, so a failed request means further
  // requests are pointless -> route the UI to "Open Settings".
  const [deniedAfterRequest, setDeniedAfterRequest] = useState(false);
  const permissionState = {
    granted: hasPermission,
    canAskAgain: !deniedAfterRequest,
  };
  const device = useCameraDevice('back');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<any>(null);
  const hasAutoRequestedPermissionRef = useRef(false);

  useEffect(() => {
    if (hasPermission) {
      setDeniedAfterRequest(false);
    }
  }, [hasPermission]);

  const refreshPermissionState = useCallback(async () => {
    // useCameraPermission re-reads status itself; nothing to refresh manually.
  }, []);

  const requestCameraPermission = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      setDeniedAfterRequest(true);
    }
    return { granted, canAskAgain: granted };
  }, [requestPermission]);

  // Handle photo capture
  const handleCapture = async () => {
    // The web Camera stub has no takePhoto; only capture on a real device.
    if (!cameraRef.current || typeof cameraRef.current.takePhoto !== "function") return;

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePhoto({
        qualityPrioritization: 'speed',
        flash: 'off'
      });

      if (photo) {
        setCapturedPhoto(photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to capture photo. Please try again.");
      console.error("Photo capture error:", error);
    } finally {
      setIsCapturing(false);
    }
  };

  // Handle photo confirmation
  const handleConfirm = () => {
    if (capturedPhoto) {
      onCapture(capturedPhoto);
      handleClose();
    }
  };

  // Handle retake
  const handleRetake = () => {
    setCapturedPhoto(null);
  };

  // Handle close
  const handleClose = () => {
    setCapturedPhoto(null);
    onClose();
  };

  const handleOpenSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        "Settings Unavailable",
        "Unable to open app settings. Please enable camera permission manually in system settings."
      );
    }
  };

  useEffect(() => {
    if (!visible) {
      hasAutoRequestedPermissionRef.current = false;
      return;
    }

    if (permissionState?.granted || hasAutoRequestedPermissionRef.current) {
      return;
    }

    if (permissionState?.canAskAgain !== false) {
      hasAutoRequestedPermissionRef.current = true;
      void requestCameraPermission();
    }
  }, [permissionState, requestCameraPermission, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshPermissionState();
      }
    });

    return () => {
      if (typeof subscription?.remove === "function") {
        subscription.remove();
      }
    };
  }, [refreshPermissionState, visible]);

  // Render permission request
  if (!permissionState?.granted) {
    const canAskPermission = permissionState?.canAskAgain !== false;

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleClose}
        testID={testID}
      >
        <SafeAreaView style={[styles.container, { backgroundColor: tokens.colors.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: tokens.colors.textPrimary }]}>{title}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={tokens.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.permissionContainer}>
            <Ionicons name="camera-outline" size={64} color={tokens.colors.textMuted} />
            <Text style={[styles.permissionText, { color: tokens.colors.textSecondary }]}>
              Camera permission is required to capture photos
            </Text>
            {canAskPermission ? (
              <TouchableOpacity
                style={[styles.permissionButton, { backgroundColor: tokens.colors.accent }]}
                onPress={() => {
                  void requestCameraPermission();
                }}
                accessibilityRole="button"
                accessibilityLabel="Grant camera permission"
              >
                <Text style={styles.permissionButtonText}>Grant Permission</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={[styles.permissionHelpText, { color: tokens.colors.textSecondary }]}>
                  Camera permission was denied. Open app settings and enable camera access to
                  continue.
                </Text>
                <TouchableOpacity
                  style={[styles.permissionButton, { backgroundColor: tokens.colors.accent }]}
                  onPress={handleOpenSettings}
                  accessibilityRole="button"
                  accessibilityLabel="Open system settings"
                >
                  <Text style={styles.permissionButtonText}>Open Settings</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      testID={testID}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: tokens.colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.colors.textPrimary }]}>{title}</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={tokens.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Camera or Preview */}
        <View style={styles.cameraContainer}>
          {capturedPhoto ? (
            <Image source={{ uri: capturedPhoto }} style={styles.preview} resizeMode="cover" />
          ) : (
            <>
              {device && (
                <Camera
                  ref={cameraRef}
                  style={styles.camera}
                  device={device}
                  isActive={visible && !capturedPhoto}
                  photo={true}
                />
              )}
              {isCapturing && (
                <View style={styles.capturingOverlay}>
                  <ActivityIndicator size="large" color={uiSemanticColors.text.inverse} />
                </View>
              )}
            </>
          )}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {capturedPhoto ? (
            <>
              <TouchableOpacity
                style={[styles.controlButton, styles.retakeButton]}
                onPress={handleRetake}
                accessibilityRole="button"
                accessibilityLabel="Retake photo"
              >
                <Ionicons name="refresh" size={24} color={uiSemanticColors.text.inverse} />
                <Text style={styles.controlButtonText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.controlButton, styles.confirmButton]}
                onPress={handleConfirm}
                accessibilityRole="button"
                accessibilityLabel="Use photo"
              >
                <Ionicons name="checkmark" size={24} color={uiSemanticColors.text.inverse} />
                <Text style={styles.controlButtonText}>Use Photo</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.captureButton}
              onPress={handleCapture}
              disabled={isCapturing}
              testID={`${testID}-capture`}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              accessibilityState={{ disabled: isCapturing, busy: isCapturing }}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: modernColors.background.default,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: modernSpacing.md,
    paddingVertical: modernSpacing.sm,
  },
  title: {
    ...modernTypography.h4,
    color: modernColors.text.primary,
  },
  closeButton: {
    padding: modernSpacing.xs,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: modernSpacing.xl,
  },
  permissionText: {
    ...modernTypography.body.medium,
    color: modernColors.text.secondary,
    textAlign: "center",
    marginTop: modernSpacing.md,
    marginBottom: modernSpacing.xl,
  },
  permissionButton: {
    backgroundColor: modernColors.primary[500],
    paddingHorizontal: modernSpacing.xl,
    paddingVertical: modernSpacing.md,
    borderRadius: modernBorderRadius.md,
  },
  permissionButtonText: {
    ...modernTypography.button.medium,
    color: uiSemanticColors.text.inverse,
  },
  permissionHelpText: {
    ...modernTypography.body.small,
    color: modernColors.text.secondary,
    textAlign: "center",
    marginBottom: modernSpacing.md,
  },
  cameraContainer: {
    flex: 1,
    overflow: "hidden",
    borderRadius: modernBorderRadius.lg,
    marginHorizontal: modernSpacing.md,
  },
  camera: {
    flex: 1,
  },
  preview: {
    flex: 1,
  },
  capturingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: scrim.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: modernSpacing.xl,
    gap: modernSpacing.md,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: modernColors.background.paper,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: modernColors.primary[500],
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: modernColors.primary[500],
  },
  controlButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: modernSpacing.lg,
    paddingVertical: modernSpacing.md,
    borderRadius: modernBorderRadius.md,
    gap: modernSpacing.xs,
  },
  retakeButton: {
    backgroundColor: modernColors.neutral[600],
  },
  confirmButton: {
    backgroundColor: modernColors.success.main,
  },
  controlButtonText: {
    ...modernTypography.button.medium,
    color: uiSemanticColors.text.inverse,
  },
});

export type { PhotoCaptureModalProps };
