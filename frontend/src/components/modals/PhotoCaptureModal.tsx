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

import { scrim, semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";
import type { ThemeTokens } from "@/theme/themeTokens";

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
  const styles = React.useMemo(() => createStyles(tokens), [tokens]);
  const cameraPermission = useCameraPermission() as {
    canAskAgain?: boolean;
    hasPermission: boolean;
    requestPermission: () => Promise<boolean>;
    unavailableReason?: string | null;
  };
  const { hasPermission, requestPermission } = cameraPermission;
  const [deniedAfterRequest, setDeniedAfterRequest] = useState(false);
  const permissionState = {
    granted: hasPermission,
    canAskAgain: cameraPermission.canAskAgain ?? !deniedAfterRequest,
    unavailableReason: cameraPermission.unavailableReason,
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
  }, []);

  const requestCameraPermission = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      setDeniedAfterRequest(true);
    }
    return { granted, canAskAgain: granted };
  }, [requestPermission]);

  const handleCapture = async () => {
    if (!cameraRef.current || typeof cameraRef.current.takePhoto !== "function") return;

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePhoto({
        qualityPrioritization: 'speed',
        flash: 'off'
      });

      if (photo?.path) {
        const photoPath =
          photo.path.startsWith("file://") || photo.path.startsWith("data:")
            ? photo.path
            : `file://${photo.path}`;
        setCapturedPhoto(photoPath);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to capture photo. Please try again.");
      console.error("Photo capture error:", error);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleConfirm = () => {
    if (capturedPhoto) {
      onCapture(capturedPhoto);
      handleClose();
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
  };

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

  if (!permissionState?.granted) {
    const cameraUnavailableReason = permissionState?.unavailableReason || "";
    const canAskPermission = permissionState?.canAskAgain !== false && !cameraUnavailableReason;

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
              {cameraUnavailableReason || "Camera permission is required to capture photos"}
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
            ) : cameraUnavailableReason ? (
              <Text style={[styles.permissionHelpText, { color: tokens.colors.textSecondary }]}>
                Use Expo Go/native or open the app through HTTPS to capture evidence photos.
              </Text>
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

const createStyles = (tokens: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: gap.md,
      paddingVertical: gap.sm,
    },
    title: {
      fontSize: font.size.xl,
      fontWeight: font.weight.semibold,
      color: tokens.colors.textPrimary,
    },
    closeButton: {
      padding: gap.xs,
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    permissionContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: gap.xl,
    },
    permissionText: {
      fontSize: font.size.base,
      color: tokens.colors.textSecondary,
      textAlign: "center",
      marginTop: gap.md,
      marginBottom: gap.xl,
    },
    permissionButton: {
      backgroundColor: tokens.colors.accent,
      paddingHorizontal: gap.xl,
      paddingVertical: gap.sm,
      borderRadius: radius.md,
    },
    permissionButtonText: {
      fontSize: font.size.base,
      fontWeight: font.weight.semibold,
      color: uiSemanticColors.text.inverse,
    },
    permissionHelpText: {
      fontSize: font.size.sm,
      color: tokens.colors.textSecondary,
      textAlign: "center",
      marginBottom: gap.sm,
    },
    cameraContainer: {
      flex: 1,
      overflow: "hidden",
      borderRadius: radius.lg,
      marginHorizontal: gap.md,
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
      paddingVertical: gap.xl,
      gap: gap.md,
    },
    captureButton: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colorWithAlpha(tokens.colors.accent, 0.15),
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 4,
      borderColor: tokens.colors.accent,
    },
    captureButtonInner: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: tokens.colors.accent,
    },
    controlButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: gap.lg,
      paddingVertical: gap.sm,
      borderRadius: radius.md,
      gap: gap.xs,
    },
    retakeButton: {
      backgroundColor: uiSemanticColors.background.secondary,
    },
    confirmButton: {
      backgroundColor: tokens.colors.success,
    },
    controlButtonText: {
      fontSize: font.size.base,
      fontWeight: font.weight.semibold,
      color: uiSemanticColors.text.inverse,
    },
  });

export type { PhotoCaptureModalProps };