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
import {
  CameraView,
  type CameraViewRef,
  useCameraPermissions,
} from "@/services/device/expoCamera";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  colors,
  fontSize,
  spacing,
} from "../../theme/unified";

const SURFACE_BG = "#f4f7f6";
const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const ACCENT = "#0f766e";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

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
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [permissionState, setPermissionState] = useState(permission);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraViewRef>(null);
  const hasAutoRequestedPermissionRef = useRef(false);

  useEffect(() => {
    setPermissionState(permission);
  }, [permission]);

  const refreshPermissionState = useCallback(async () => {
    try {
      const latestPermission = await getPermission();
      setPermissionState(latestPermission);
    } catch {
      // Ignore refresh failures and keep the last known state.
    }
  }, [getPermission]);

  const requestCameraPermission = useCallback(async () => {
    const latestPermission = await requestPermission();
    setPermissionState(latestPermission);
    return latestPermission;
  }, [requestPermission]);

  // Handle photo capture
  const handleCapture = async () => {
    if (!cameraRef.current) return;

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photo) {
        setCapturedPhoto(photo.uri);
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
        "Unable to open app settings. Please enable camera permission manually in system settings.",
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
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Ionicons
                name="close"
                size={24}
                color={TEXT_STRONG}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.permissionContainer}>
            <Ionicons
              name="camera-outline"
              size={64}
              color={TEXT_MUTED}
            />
            <Text style={styles.permissionText}>
              Camera permission is required to capture photos
            </Text>
            {canAskPermission ? (
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={() => {
                  void requestCameraPermission();
                }}
              >
                <Text style={styles.permissionButtonText}>Grant Permission</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={styles.permissionHelpText}>
                  Camera permission was denied. Open app settings and enable
                  camera access to continue.
                </Text>
                <TouchableOpacity
                  style={styles.permissionButton}
                  onPress={handleOpenSettings}
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
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Ionicons
              name="close"
              size={24}
              color={TEXT_STRONG}
            />
          </TouchableOpacity>
        </View>

        {/* Camera or Preview */}
        <View style={styles.cameraContainer}>
          {capturedPhoto ? (
            <Image
              source={{ uri: capturedPhoto }}
              style={styles.preview}
              resizeMode="cover"
            />
          ) : (
            <CameraView ref={cameraRef} style={styles.camera} facing="back">
              {isCapturing && (
                <View style={styles.capturingOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              )}
            </CameraView>
          )}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {capturedPhoto ? (
            <>
              <TouchableOpacity
                style={[styles.controlButton, styles.retakeButton]}
                onPress={handleRetake}
              >
                <Ionicons name="refresh" size={24} color="#fff" />
                <Text style={styles.controlButtonText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.controlButton, styles.confirmButton]}
                onPress={handleConfirm}
              >
                <Ionicons name="checkmark" size={24} color="#fff" />
                <Text style={styles.controlButtonText}>Use Photo</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.captureButton}
              onPress={handleCapture}
              disabled={isCapturing}
              testID={`${testID}-capture`}
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
    backgroundColor: SURFACE_BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: TEXT_STRONG,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  permissionText: {
    fontSize: fontSize.md,
    color: TEXT_MUTED,
    textAlign: "center",
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  permissionButton: {
    minHeight: 48,
    backgroundColor: ACCENT,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionButtonText: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.white,
  },
  permissionHelpText: {
    fontSize: fontSize.sm,
    color: TEXT_MUTED,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  cameraContainer: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 24,
    marginHorizontal: spacing.lg,
    backgroundColor: SURFACE_CARD,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  camera: {
    flex: 1,
  },
  preview: {
    flex: 1,
  },
  capturingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: ACCENT,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: ACCENT,
  },
  controlButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 18,
    gap: spacing.xs,
  },
  retakeButton: {
    backgroundColor: TEXT_MUTED,
  },
  confirmButton: {
    backgroundColor: ACCENT,
  },
  controlButtonText: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.white,
  },
});

export type { PhotoCaptureModalProps };
