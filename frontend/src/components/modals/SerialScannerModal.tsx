/**
 * SerialScannerModal - Dedicated scanner for serial numbers
 * Validates scanned codes as serial numbers (not barcodes)
 * Collects detected candidates and lets user tap the correct serial to add
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  validateScannedSerial,
  normalizeSerialValue,
} from "../../utils/scanUtils";
import {
  clearRecentScanTimes,
  DEFAULT_SERIAL_RESCAN_WINDOW_MS,
  createDetectedCodeList,
  DetectedCode,
  DetectedCodeStatus,
  isScanWithinRescanWindow,
  isScanLocked,
  nextAfterResume,
  nextAfterSerialAdded,
} from "./serialScannerState";
import {
  colors,
  spacing,
  fontSize,
  fontWeight,
  radius as borderRadius,
} from "../../theme/unified";

interface SerialScannerModalProps {
  visible: boolean;
  existingSerials: string[];
  itemName?: string;
  defaultMrp?: number;
  onSerialScanned: (data: {
    serial_number: string;
    mrp?: number;
    manufacturing_date?: string;
  }) => boolean | Promise<boolean>;
  onClose: () => void;
}

export const SerialScannerModal: React.FC<SerialScannerModalProps> = ({
  visible,
  existingSerials,
  itemName,
  defaultMrp,
  onSerialScanned,
  onClose,
}) => {
  const CANDIDATE_BURST_PAUSE_MS = 650;
  const insets = useSafeAreaInsets();
  const getInvalidCandidateMessage = useCallback(
    (code: string, fallback?: string) => {
      const numericOnly = /^\d+$/.test(code);
      const eanOrUpcLike = numericOnly && code.length >= 8 && code.length <= 14;
      const likelyManufacturerCode = numericOnly && code.length > 14;

      if (fallback?.includes("product barcode") || eanOrUpcLike) {
        return "EAN/UPC barcode detected. Select the serial code from the list.";
      }

      if (likelyManufacturerCode) {
        return "Manufacturer code detected. Select the correct serial code.";
      }

      return fallback || "Invalid serial number";
    },
    [],
  );

  const recentScanTimesRef = useRef<Map<string, number>>(new Map());
  const burstPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptedSerialsRef = useRef<Set<string>>(new Set());
  const hasAutoRequestedPermissionRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();

  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);
  const [detectedCodes, setDetectedCodes] = useState<DetectedCode[]>([]);
  const [scanPaused, setScanPaused] = useState(false);

  // Manual Input State
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualText, setManualText] = useState("");

  const handleBulkProcess = useCallback(async () => {
    if (!manualText.trim()) return;

    const tokens = manualText
      .split(/[\n, \t]+/)
      .filter((t) => t.trim().length > 0);
    const localExisting = [...existingSerials];
    let addedCount = 0;

    for (const token of tokens) {
      const validation = validateScannedSerial(token, localExisting);
      if (validation.valid) {
        const normalized = normalizeSerialValue(token);
        const wasAdded = await Promise.resolve(
          onSerialScanned({
            serial_number: normalized,
            mrp: defaultMrp,
          }),
        );
        if (wasAdded) {
          localExisting.push(normalized);
          acceptedSerialsRef.current.add(normalized);
          addedCount++;
        }
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setScanFeedback({
      type: "success",
      message: `Processed ${addedCount} valid serials`,
    });
    setManualText("");
    setShowManualInput(false);
  }, [manualText, existingSerials, defaultMrp, onSerialScanned]);

  const upsertDetectedCode = useCallback((entry: DetectedCode) => {
    setDetectedCodes((prev) => createDetectedCodeList(prev, entry));
  }, []);

  const clearBurstPauseTimer = useCallback(() => {
    if (burstPauseTimerRef.current) {
      clearTimeout(burstPauseTimerRef.current);
      burstPauseTimerRef.current = null;
    }
  }, []);

  const scheduleBurstPause = useCallback(() => {
    clearBurstPauseTimer();
    burstPauseTimerRef.current = setTimeout(() => {
      setScanPaused(true);
      setScanFeedback({
        type: "warning",
        message: "Select the correct serial, then tap Scan Next Serial.",
      });
    }, CANDIDATE_BURST_PAUSE_MS);
  }, [CANDIDATE_BURST_PAUSE_MS, clearBurstPauseTimer]);

  const handleDetectedCodePress = useCallback(
    async (candidate: DetectedCode) => {
      if (candidate.status !== "ready") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setScanFeedback({
          type: "warning",
          message: candidate.message,
        });
        return;
      }

      const wasAdded = await Promise.resolve(
        onSerialScanned({
          serial_number: candidate.code,
          mrp: defaultMrp,
          manufacturing_date: undefined,
        }),
      );

      if (!wasAdded) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setScanFeedback({
          type: "warning",
          message: `Could not add ${candidate.code}`,
        });
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      acceptedSerialsRef.current.add(candidate.code);
      setScanFeedback({
        type: "success",
        message: `Serial added: ${candidate.code}. Tap Scan Next to continue.`,
      });
      setDetectedCodes([]);
      clearBurstPauseTimer();
      setScanPaused(nextAfterSerialAdded({ scanPaused }).scanPaused);
    },
    [clearBurstPauseTimer, defaultMrp, onSerialScanned, scanPaused],
  );

  const handleResumeScan = useCallback(() => {
    clearBurstPauseTimer();
    setScanPaused(nextAfterResume({ scanPaused }).scanPaused);
    setDetectedCodes([]);
    setScanFeedback({
      type: "success",
      message: "Ready to scan the next serial.",
    });
  }, [clearBurstPauseTimer, scanPaused]);

  const handleResetDetected = useCallback(() => {
    clearBurstPauseTimer();
    setDetectedCodes([]);
    setLastScanned(null);
    clearRecentScanTimes(recentScanTimesRef.current);
    setScanFeedback({
      type: "success",
      message: "Detected list reset. Continue scanning.",
    });
  }, [clearBurstPauseTimer]);

  const handleOpenSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        "Settings Unavailable",
        "Unable to open app settings. Please enable camera permission manually.",
      );
    }
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setLastScanned(null);
      setScanFeedback(null);
      setDetectedCodes([]);
      setScanPaused(false);
      clearBurstPauseTimer();
      clearRecentScanTimes(recentScanTimesRef.current);
      acceptedSerialsRef.current = new Set(
        existingSerials.map(normalizeSerialValue).filter(Boolean),
      );
    }
  }, [clearBurstPauseTimer, existingSerials, visible]);

  useEffect(() => {
    acceptedSerialsRef.current = new Set(
      existingSerials.map(normalizeSerialValue).filter(Boolean),
    );
  }, [existingSerials]);

  // Clear feedback after delay
  useEffect(() => {
    if (scanFeedback) {
      const timer = setTimeout(() => setScanFeedback(null), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [scanFeedback]);

  useEffect(() => {
    if (!visible) {
      hasAutoRequestedPermissionRef.current = false;
      return;
    }

    if (permission?.granted || hasAutoRequestedPermissionRef.current) {
      return;
    }

    if (permission?.canAskAgain !== false) {
      hasAutoRequestedPermissionRef.current = true;
      void requestPermission();
    }
  }, [permission, requestPermission, visible]);

  useEffect(() => () => clearBurstPauseTimer(), [clearBurstPauseTimer]);

  const handleBarcodeScanned = useCallback(
    (data: { data: string }) => {
      if (isScanLocked({ scanPaused })) {
        return;
      }

      const scannedValue = normalizeSerialValue(data.data);
      if (!scannedValue) {
        return;
      }

      const now = Date.now();
      const lastSeenAt = recentScanTimesRef.current.get(scannedValue) ?? 0;
      if (
        isScanWithinRescanWindow({
          lastSeenAt,
          now,
          windowMs: DEFAULT_SERIAL_RESCAN_WINDOW_MS,
        })
      ) {
        return;
      }
      recentScanTimesRef.current.set(scannedValue, now);

      // Validate as serial number (not barcode)
      const knownSerials = [
        ...existingSerials,
        ...Array.from(acceptedSerialsRef.current),
      ];
      const validation = validateScannedSerial(scannedValue, knownSerials);
      const status: DetectedCodeStatus = validation.valid
        ? "ready"
        : validation.error?.includes("already been added")
          ? "duplicate"
          : "invalid";
      const message = validation.valid
        ? "Tap to add"
        : getInvalidCandidateMessage(scannedValue, validation.error);
      upsertDetectedCode({
        code: scannedValue,
        status,
        message,
      });
      setLastScanned(scannedValue);

      if (!validation.valid) {
        Haptics.notificationAsync(
          validation.error?.includes("barcode")
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Error,
        );
        setScanFeedback({
          type: validation.error?.includes("barcode") ? "warning" : "error",
          message,
        });
        scheduleBurstPause();
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setScanFeedback({
        type: "warning",
        message: "Code detected. Tap it below to add.",
      });
      scheduleBurstPause();
    },
    [
      existingSerials,
      getInvalidCandidateMessage,
      scanPaused,
      scheduleBurstPause,
      upsertDetectedCode,
    ],
  );

  const getFeedbackStyle = () => {
    if (!scanFeedback) return styles.feedbackHidden;
    switch (scanFeedback.type) {
      case "success":
        return styles.feedbackSuccess;
      case "error":
        return styles.feedbackError;
      case "warning":
        return styles.feedbackWarning;
      default:
        return styles.feedbackHidden;
    }
  };

  const isCameraGranted = permission?.granted === true;
  const canAskPermission = permission?.canAskAgain !== false;

  if (!isCameraGranted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.container}>
          <View style={styles.permissionContainer}>
            <Ionicons name="camera-outline" size={64} color={colors.neutral[300]} />
            <Text style={styles.permissionTitle}>Camera access is required</Text>
            <Text style={styles.permissionText}>
              Enable camera permission to scan serial numbers quickly.
            </Text>

            {!permission ? (
              <ActivityIndicator
                size="large"
                color={colors.primary[500]}
                style={{ marginTop: spacing.md }}
              />
            ) : canAskPermission ? (
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={requestPermission}
              >
                <Text style={styles.permissionButtonText}>Grant Permission</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={handleOpenSettings}
              >
                <Text style={styles.permissionButtonText}>Open Settings</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.permissionButton, styles.permissionSecondaryButton]}
              onPress={() => setShowManualInput(true)}
            >
              <Text
                style={[
                  styles.permissionButtonText,
                  styles.permissionSecondaryButtonText,
                ]}
              >
                Use Manual Entry
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.permissionButton, styles.permissionSecondaryButton]}
              onPress={onClose}
            >
              <Text
                style={[
                  styles.permissionButtonText,
                  styles.permissionSecondaryButtonText,
                ]}
              >
                Close
              </Text>
            </TouchableOpacity>
          </View>

          {/* Manual Input Overlay */}
          <Modal
            visible={showManualInput}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setShowManualInput(false)}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.manualContainer}
            >
              <View style={styles.manualHeader}>
                <Text style={styles.manualTitle}>Manual / Bulk Input</Text>
                <TouchableOpacity onPress={() => setShowManualInput(false)}>
                  <Ionicons name="close" size={28} color={colors.neutral[900]} />
                </TouchableOpacity>
              </View>

              <Text style={styles.manualHelperText}>
                Enter serial numbers separated by commas, spaces, or new lines.
              </Text>

              <TextInput
                style={styles.manualInput}
                multiline
                placeholder="Paste serial numbers here..."
                value={manualText}
                onChangeText={setManualText}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={[styles.doneButton, { margin: spacing.lg }]}
                onPress={handleBulkProcess}
              >
                <Text style={styles.doneButtonText}>Process Serials</Text>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          active={visible && !showManualInput}
          barcodeScannerSettings={{
            barcodeTypes: [
              "qr",
              "code128",
              "code39",
              "code93",
              "datamatrix",
              "ean13",
              "ean8",
              "upc_a",
              "upc_e",
            ],
          }}
          onBarcodeScanned={
            scanPaused || showManualInput ? undefined : handleBarcodeScanned
          }
        />

        {/* Overlay */}
        <View style={styles.overlay}>
          {/* Top Bar */}
          <View
            style={[
              styles.topBar,
              {
                paddingTop: Math.max(insets.top + spacing.xs, spacing.md),
              },
            ]}
          >
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={28} color={colors.white} />
            </TouchableOpacity>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>Scan Serial Number</Text>
              {itemName && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {itemName}
                </Text>
              )}
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {existingSerials.length + (lastScanned ? 0 : 0)}
              </Text>
            </View>
          </View>

          {/* Scan Area */}
          <View style={styles.scanAreaContainer}>
            <View style={styles.scanArea}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </View>

          {/* Feedback Area */}
          <View style={styles.feedbackContainer}>
            {scanFeedback && (
              <View style={[styles.feedbackBadge, getFeedbackStyle()]}>
                <Ionicons
                  name={
                    scanFeedback.type === "success"
                      ? "checkmark-circle"
                      : scanFeedback.type === "warning"
                        ? "warning"
                        : "close-circle"
                  }
                  size={20}
                  color={colors.white}
                />
                <Text style={styles.feedbackText}>{scanFeedback.message}</Text>
              </View>
            )}
          </View>

          {/* Bottom Info */}
          <View
            style={[
              styles.bottomInfo,
              {
                paddingBottom: Math.max(insets.bottom + spacing.md, spacing.xl),
              },
            ]}
          >
            <View style={styles.infoCard}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={colors.primary[400]}
              />
              <Text style={styles.infoText}>
                Review mode is ON. Detected codes are listed for manual selection.
                {"\n"}
                Nearby serial/EAN/manufacturer barcodes are supported in one scan burst.
              </Text>
            </View>

            {scanPaused && (
              <TouchableOpacity
                style={[
                  styles.doneButton,
                  { marginBottom: spacing.md, backgroundColor: colors.success[600] },
                ]}
                onPress={handleResumeScan}
              >
                <Ionicons name="scan-outline" size={22} color={colors.white} />
                <Text style={styles.doneButtonText}>Scan Next Serial</Text>
              </TouchableOpacity>
            )}

            {detectedCodes.length > 0 && (
              <View style={styles.detectedList}>
                <View style={styles.detectedHeader}>
                  <Text style={styles.detectedLabel}>
                    Detected Codes ({detectedCodes.length})
                  </Text>
                  <TouchableOpacity onPress={handleResetDetected}>
                    <Text style={styles.detectedResetText}>Reset</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.detectedScroll}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {detectedCodes.map((candidate) => (
                    <TouchableOpacity
                      key={candidate.code}
                      style={[
                        styles.detectedRow,
                        candidate.status !== "ready" && styles.detectedRowDisabled,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => handleDetectedCodePress(candidate)}
                      disabled={candidate.status !== "ready"}
                    >
                      <View style={styles.detectedRowContent}>
                        <Text style={styles.detectedCode}>{candidate.code}</Text>
                        <Text style={styles.detectedMessage}>{candidate.message}</Text>
                      </View>
                      <View
                        style={[
                          styles.detectedBadge,
                          candidate.status === "ready"
                            ? styles.detectedBadgeReady
                            : candidate.status === "duplicate"
                              ? styles.detectedBadgeDuplicate
                              : styles.detectedBadgeInvalid,
                        ]}
                      >
                        <Text style={styles.detectedBadgeText}>
                          {candidate.status === "ready"
                            ? "Add"
                            : candidate.status === "duplicate"
                              ? "Dup"
                              : "Skip"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {existingSerials.length > 0 && (
              <View style={styles.serialsList}>
                <Text style={styles.serialsLabel}>
                  Scanned ({existingSerials.length}):
                </Text>
                <Text style={styles.serialsText} numberOfLines={2}>
                  {existingSerials.slice(-3).join(", ")}
                  {existingSerials.length > 3 ? "..." : ""}
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.doneButton} onPress={onClose}>
              <Ionicons name="checkmark" size={24} color={colors.white} />
              <Text style={styles.doneButtonText}>
                Done ({existingSerials.length} serials)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.doneButton,
                { marginTop: spacing.sm, backgroundColor: colors.neutral[700] },
              ]}
              onPress={() => setShowManualInput(true)}
            >
              <Ionicons name="create-outline" size={24} color={colors.white} />
              <Text style={styles.doneButtonText}>Manual / Bulk Paste</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Manual Input Overlay */}
        <Modal
          visible={showManualInput}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowManualInput(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.manualContainer}
          >
            <View style={styles.manualHeader}>
              <Text style={styles.manualTitle}>Manual / Bulk Input</Text>
              <TouchableOpacity onPress={() => setShowManualInput(false)}>
                <Ionicons name="close" size={28} color={colors.neutral[900]} />
              </TouchableOpacity>
            </View>

            <Text style={styles.manualHelperText}>
              Enter serial numbers separated by commas, spaces, or new lines.
            </Text>

            <TextInput
              style={styles.manualInput}
              multiline
              placeholder="Paste serial numbers here..."
              value={manualText}
              onChangeText={setManualText}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.doneButton, { margin: spacing.lg }]}
              onPress={handleBulkProcess}
            >
              <Text style={styles.doneButtonText}>Process Serials</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[900],
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  permissionTitle: {
    marginTop: spacing.md,
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    textAlign: "center",
  },
  permissionText: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    color: colors.neutral[300],
    fontSize: fontSize.sm,
    textAlign: "center",
    lineHeight: 20,
  },
  permissionButton: {
    width: "100%",
    minHeight: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[600],
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  permissionButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
  },
  permissionSecondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.neutral[500],
  },
  permissionSecondaryButtonText: {
    color: colors.neutral[200],
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleContainer: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.neutral[300],
    marginTop: 2,
  },
  countBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[600],
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  scanAreaContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scanArea: {
    width: 280,
    height: 180,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: colors.primary[400],
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: borderRadius.md,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: borderRadius.md,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: borderRadius.md,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: borderRadius.md,
  },
  feedbackContainer: {
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  feedbackBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  feedbackHidden: {
    opacity: 0,
  },
  feedbackSuccess: {
    backgroundColor: colors.success[600],
  },
  feedbackError: {
    backgroundColor: colors.error[600],
  },
  feedbackWarning: {
    backgroundColor: colors.warning[600],
  },
  feedbackText: {
    marginLeft: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.white,
  },
  bottomInfo: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modeToggleButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modeToggleButtonActive: {
    backgroundColor: colors.success[600],
  },
  modeToggleButtonInactive: {
    backgroundColor: colors.neutral[700],
  },
  modeToggleButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semiBold,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  infoText: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.neutral[300],
    lineHeight: 20,
  },
  detectedList: {
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  detectedScroll: {
    maxHeight: 210,
  },
  detectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  detectedLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.neutral[300],
    textTransform: "uppercase",
  },
  detectedResetText: {
    color: colors.primary[300],
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semiBold,
    textTransform: "uppercase",
  },
  detectedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  detectedRowDisabled: {
    opacity: 0.65,
  },
  detectedRowContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  detectedCode: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semiBold,
  },
  detectedMessage: {
    marginTop: 2,
    color: colors.neutral[300],
    fontSize: fontSize.xs,
  },
  detectedBadge: {
    minWidth: 50,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignItems: "center",
  },
  detectedBadgeReady: {
    backgroundColor: colors.success[600],
  },
  detectedBadgeDuplicate: {
    backgroundColor: colors.warning[600],
  },
  detectedBadgeInvalid: {
    backgroundColor: colors.error[600],
  },
  detectedBadgeText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  serialsList: {
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  serialsLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.neutral[400],
    marginBottom: 4,
  },
  serialsText: {
    fontSize: fontSize.sm,
    color: colors.white,
  },
  doneButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  doneButtonText: {
    marginLeft: spacing.sm,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: colors.white,
  },
  manualContainer: {
    flex: 1,
    backgroundColor: colors.white,
    paddingTop: Platform.OS === "ios" ? 20 : 0,
  },
  manualHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  manualTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.neutral[900],
  },
  manualHelperText: {
    padding: spacing.lg,
    color: colors.neutral[500],
    fontSize: fontSize.sm,
  },
  manualInput: {
    flex: 1,
    margin: spacing.lg,
    marginTop: 0,
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    textAlignVertical: "top",
  },
});

export default SerialScannerModal;
