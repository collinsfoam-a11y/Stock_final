// app/staff/serial-scanner.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from "@/services/device/expoCamera";
import { useRouter } from "expo-router";

import {
  semanticColors,
  colors,
  hitSlop,
  radius,
  spacing,
  touchTargets,
} from "@/theme/legacyCompat";
import { colorWithAlpha } from "@/theme/themeTokens";
import { useScanGate } from "@/scanner/useScanGate";
import { ScanMode, normalizeScanValue, scoreCandidate, decide } from "@/scanner/serialScanRules";
import ModernHeader from "@/components/ui/ModernHeader";
import ModernButton from "@/components/ui/ModernButton";
import ModernInput from "@/components/ui/ModernInput";
import { ScannerFeedbackState } from "@/components/feedback/ScannerFeedbackState";
import type { ScannerFeedbackStateValue } from "@/components/feedback/ScannerFeedbackState";
import { safeBackNavigation } from "@/utils/navigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import {
  OPERATIONAL_TELEMETRY_EVENT_REGISTRY,
  operationalTelemetry,
} from "@/services/observability/operationalTelemetry";

type SerialScannerFeedback = {
  state: Extract<
    ScannerFeedbackStateValue,
    "success" | "warning" | "duplicate" | "invalid" | "found"
  >;
  title: string;
  message?: string;
  barcode?: string;
  timestamp: number;
};

export default function SerialScannerScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<ScanMode>("SERIAL");
  const [manualValue, setManualValue] = useState("");
  const [serials, setSerials] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<SerialScannerFeedback | null>(null);
  const serialsRef = useRef(serials);

  // Fix 2: Destructure for stable dependencies
  const { canProcess, release } = useScanGate();

  useEffect(() => {
    serialsRef.current = serials;
  }, [serials]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 2400);
    return () => clearTimeout(timer);
  }, [feedback]);

  const showFeedback = useCallback((nextFeedback: Omit<SerialScannerFeedback, "timestamp">) => {
    setFeedback({ ...nextFeedback, timestamp: Date.now() });
  }, []);

  const addSerialValue = useCallback(
    (value: string) => {
      if (serialsRef.current.includes(value)) {
        showFeedback({
          state: "duplicate",
          title: "Serial already scanned",
          message: "This serial is already in the current scan set.",
          barcode: value,
        });
        return false;
      }

      setSerials((prev) => [...prev, value]);
      showFeedback({
        state: "success",
        title: "Serial added",
        message: "Ready for the next serial.",
        barcode: value,
      });
      return true;
    },
    [showFeedback]
  );

  const processCandidate = useCallback(
    (rawInput: string, symbology: string) => {
      const raw = rawInput ?? "";
      const value = normalizeScanValue(raw, symbology);
      const mark = operationalTelemetry.markStart({
        name: OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SERIAL_SCAN_COMPLETED,
        category: "scanner",
        surface: "serial_scanner_screen",
        tags: {
          mode,
          symbology,
          barcode: value || raw,
        },
      });

      if (!value) {
        operationalTelemetry.markEnd(mark, "invalid", { reason: "empty_value" });
        showFeedback({
          state: "invalid",
          title: "Scan value required",
          message: "Enter a serial or item barcode before submitting.",
        });
        return false;
      }

      if (!canProcess(value)) {
        operationalTelemetry.markEnd(mark, "skipped", { reason: "scan_gate" });
        return false;
      }

      try {
        const score = scoreCandidate(mode, value, symbology);
        if (score < 0) {
          operationalTelemetry.markEnd(mark, "invalid", { reason: "wrong_code_type" });
          showFeedback({
            state: "warning",
            title: "Wrong code type",
            message:
              mode === "SERIAL"
                ? "Scan the SERIAL barcode, usually the alphanumeric label."
                : "Scan the ITEM EAN/UPC barcode, usually the numeric product label.",
            barcode: value,
          });
          return false;
        }

        const decision = decide(mode, { raw, value, symbology });

        if (!decision.ok) {
          operationalTelemetry.markEnd(mark, "invalid", { reason: decision.reason });
          showFeedback({
            state: "warning",
            title: "Code not accepted",
            message: decision.reason,
            barcode: value,
          });
          return false;
        }

        if (decision.kind === "SERIAL") {
          const accepted = addSerialValue(decision.value);
          operationalTelemetry.markEnd(mark, accepted ? "success" : "duplicate", {
            barcode: decision.value,
          });
          return accepted;
        }

        operationalTelemetry.markEnd(mark, "success", {
          barcode: decision.value,
          kind: decision.kind,
        });
        showFeedback({
          state: "found",
          title: "Item barcode detected",
          message: "Use this item code for item-mode verification.",
          barcode: decision.value,
        });
        return true;
      } finally {
        release();
      }
    },
    [mode, canProcess, release, addSerialValue, showFeedback]
  );

  const onBarcodeScanned = useCallback(
    (res: BarcodeScanningResult) => {
      processCandidate(res.data ?? "", (res.type ?? "").toString());
    },
    [processCandidate]
  );

  const handleManualSubmit = useCallback(() => {
    const accepted = processCandidate(manualValue, "manual");
    if (accepted) {
      setManualValue("");
    }
  }, [manualValue, processCandidate]);

  const manualEntryLabel = useMemo(
    () =>
      mode === "ITEM"
        ? "Manual item barcode"
        : mode === "AUTO"
          ? "Manual serial or item barcode"
          : "Manual serial number",
    [mode]
  );

  // Fix 5: Dynamic barcode types
  const barcodeTypes = useMemo(() => {
    if (mode === "SERIAL") return ["code128", "code39", "code93", "qr", "datamatrix"];
    if (mode === "ITEM") return ["ean13", "ean8", "upc_a", "upc_e"];
    return ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "qr", "datamatrix"];
  }, [mode]);

  const handleOpenSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        "Settings Unavailable",
        "Please enable camera permission manually from app settings."
      );
    }
  }, []);

  return (
    <View style={styles.container}>
      <ModernHeader
        title="Scan Serials"
        showBackButton
        onBackPress={() => safeBackNavigation(router, { userRole: "staff" })}
      />

      <View style={styles.topBar}>
        <View style={styles.modeRow}>
          <ModeChip
            active={mode === "SERIAL"}
            activeColor={uiTokens.colors.accent}
            label="SERIAL"
            onPress={() => setMode("SERIAL")}
          />
          <ModeChip
            active={mode === "ITEM"}
            activeColor={uiTokens.colors.accent}
            label="ITEM"
            onPress={() => setMode("ITEM")}
          />
          <ModeChip
            active={mode === "AUTO"}
            activeColor={uiTokens.colors.accent}
            label="AUTO"
            onPress={() => setMode("AUTO")}
          />
        </View>

        <Text style={styles.hint}>
          {mode === "SERIAL"
            ? "Serial mode: alphanumeric only. EAN/UPC ignored."
            : mode === "ITEM"
              ? "Item mode: digits only (EAN/UPC)."
              : "Auto: detects best match."}
        </Text>
      </View>

      {!permission?.granted ? (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            Camera permission is needed for scan mode. Manual entry is still available below.
          </Text>
          {permission?.canAskAgain !== false ? (
            <ModernButton
              title="Grant Permission"
              variant="primary"
              style={{
                ...styles.permissionButton,
                backgroundColor: uiTokens.colors.accent,
                borderColor: uiTokens.colors.accent,
              }}
              onPress={requestPermission}
              accessibilityHint="Allows camera scanning for serial and item barcodes"
            />
          ) : (
            <ModernButton
              title="Open Settings"
              variant="primary"
              style={{
                ...styles.permissionButton,
                backgroundColor: uiTokens.colors.accent,
                borderColor: uiTokens.colors.accent,
              }}
              onPress={handleOpenSettings}
              accessibilityHint="Opens device settings so camera permission can be enabled"
            />
          )}
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={onBarcodeScanned}
            barcodeScannerSettings={{
              // @ts-ignore: simplified types for expo-camera
              barcodeTypes: barcodeTypes,
            }}
          />
          <View style={styles.frame} />
        </View>
      )}

      {feedback ? (
        <ScannerFeedbackState
          compact
          state={feedback.state}
          title={feedback.title}
          message={feedback.message}
          barcode={feedback.barcode}
          timestamp={feedback.timestamp}
          style={styles.feedbackState}
        />
      ) : null}

      <View style={styles.bottomPanel}>
        <View style={styles.manualEntry}>
          <Text style={styles.manualTitle}>Manual entry</Text>
          <View style={styles.manualRow}>
            <View style={styles.manualInputWrap}>
              <ModernInput
                value={manualValue}
                onChangeText={setManualValue}
                placeholder={manualEntryLabel}
                autoCapitalize={mode === "ITEM" ? "none" : "characters"}
                autoCorrect={false}
                keyboardType={mode === "ITEM" ? "number-pad" : "default"}
                onSubmitEditing={handleManualSubmit}
                returnKeyType="done"
                testID="serial-scanner-manual-input"
                containerStyle={styles.manualInputContainer}
                rightIcon={manualValue ? "close-circle" : undefined}
                onRightIconPress={() => setManualValue("")}
                rightIconAccessibilityLabel="Clear manual scan value"
              />
            </View>
            <ModernButton
              title="Add"
              variant="secondary"
              style={styles.manualAddButton}
              onPress={handleManualSubmit}
              disabled={!manualValue.trim()}
              accessibilityLabel={`Add ${manualEntryLabel.toLowerCase()}`}
            />
          </View>
        </View>

        <View style={styles.statsRow}>
          <Text style={styles.count}>Scanned: {serials.length}</Text>
          <ModernButton
            title="Done"
            variant="primary"
            style={{
              ...styles.doneButton,
              backgroundColor: uiTokens.colors.accent,
              borderColor: uiTokens.colors.accent,
            }}
            onPress={() => {
              safeBackNavigation(router, { userRole: "staff" });
              // In a real app, you might do: router.push({ pathname: '..', params: { newSerials: serials }})
              // or use a global store action.
            }}
          />
        </View>

        <Text style={styles.list} numberOfLines={3}>
          {serials.length > 0 ? serials.slice(-6).join(", ") : "No serials scanned yet."}
        </Text>
      </View>
    </View>
  );
}

function ModeChip(props: {
  label: ScanMode;
  active: boolean;
  activeColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.label} scan mode`}
      accessibilityHint="Changes which barcode format the scanner expects"
      accessibilityState={{ selected: props.active }}
      hitSlop={hitSlop.small}
      onPress={props.onPress}
      style={[
        styles.chip,
        props.active && {
          backgroundColor: props.activeColor,
          borderColor: props.activeColor,
        },
      ]}
    >
      <Text style={[styles.chipText, props.active && styles.chipTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[950] },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.neutral[950],
  },
  modeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  hint: {
    color: colorWithAlpha(semanticColors.text.inverse, 0.7),
    marginTop: spacing.sm,
    fontSize: 12,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  permissionText: {
    color: semanticColors.text.inverse,
    fontSize: 14,
    textAlign: "center",
  },
  permissionButton: {
    minHeight: touchTargets.minimum,
    width: "100%",
  },

  cameraWrap: { flex: 1, position: "relative" },
  feedbackState: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  frame: {
    position: "absolute",
    left: 40,
    right: 40,
    top: "30%",
    height: 200,
    borderWidth: 2,
    borderColor: colorWithAlpha(semanticColors.text.inverse, 0.6),
    borderRadius: radius.md,
  },

  bottomPanel: {
    padding: spacing.lg,
    backgroundColor: colorWithAlpha(colors.neutral[950], 0.9),
    paddingBottom: spacing["3xl"],
  },
  manualEntry: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  manualTitle: {
    color: colorWithAlpha(semanticColors.text.inverse, 0.82),
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  manualRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  manualInputWrap: {
    flex: 1,
  },
  manualInputContainer: {
    marginBottom: spacing.none,
  },
  manualAddButton: {
    minWidth: touchTargets.large,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  doneButton: {
    height: touchTargets.minimum,
    minWidth: touchTargets.large,
  },
  count: { color: semanticColors.text.inverse, fontSize: 18, fontWeight: "700" },
  list: { color: colorWithAlpha(semanticColors.text.inverse, 0.6), fontSize: 12 },

  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colorWithAlpha(semanticColors.text.inverse, 0.2),
  },
  chipText: { color: semanticColors.text.inverse, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: semanticColors.text.inverse },
});
