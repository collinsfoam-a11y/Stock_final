// app/staff/serial-scanner.tsx
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from "@/services/device/expoCamera";
import { useRouter } from "expo-router";

import { colorWithAlpha } from "@/theme/themeTokens";
import { useUiTokens } from "@/hooks/useUiTokens";
import { useScanGate } from "@/scanner/useScanGate";
import { ScanMode, normalizeScanValue, scoreCandidate, decide } from "@/scanner/serialScanRules";
import ModernHeader from "@/components/ui/ModernHeader";
import ModernButton from "@/components/ui/ModernButton";
import { safeBackNavigation } from "@/utils/navigation";
function toast(msg: string) {
  Alert.alert("Scan", msg);
}

export default function SerialScannerScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<ScanMode>("SERIAL");
  const [serials, setSerials] = useState<string[]>([]);

  // Fix 2: Destructure for stable dependencies
  const { canProcess, release } = useScanGate();

  // Fix 3: Simplified dedupe logic (Authored by addValue)
  const addValue = useCallback((value: string) => {
    setSerials((prev) => {
      // Logic: For display consistency, we might want to keep the format from decision
      // We already normalized.
      if (prev.includes(value)) return prev;
      return [...prev, value];
    });
  }, []);

  const onBarcodeScanned = useCallback(
    (res: BarcodeScanningResult) => {
      const raw = res.data ?? "";
      const symbology = (res.type ?? "").toString();
      // Fix 4: Normalized with symbology context
      const value = normalizeScanValue(raw, symbology);

      if (!value) return;

      if (!canProcess(value)) return;

      try {
        const score = scoreCandidate(mode, value, symbology);
        if (score < 0) {
          toast(
            mode === "SERIAL"
              ? "Wrong code detected. Scan the SERIAL barcode (alphanumeric)."
              : "Wrong code detected. Scan the ITEM EAN barcode (digits)."
          );
          return;
        }

        const decision = decide(mode, { raw, value, symbology });

        if (!decision.ok) {
          toast(decision.reason);
          return;
        }

        if (decision.kind === "SERIAL") {
          // Optimized check inside addValue via local state updater is sufficient,
          // but checking here prevents unnecessary toast if we want to alert "Duplicate"
          // We can't access latest 'serials' without dependency, so let's rely on setSerials
          // to handle the add, and we can't easily toast "Duplicate" without ref or dependency.
          // For simplicity in this drop-in: verify in setSerials (silent reject) or use ref if alert needed.
          // User asked to remove redundant Set. We'll simply try add.
          addValue(decision.value);
          return;
        }

        toast(`Item barcode: ${decision.value}`);
      } finally {
        release();
      }
    },
    [mode, canProcess, release, addValue]
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
    <View style={[styles.container, { backgroundColor: uiTokens.colors.background }]}>
      <ModernHeader
        title="Scan Serials"
        showBackButton
        onBackPress={() => safeBackNavigation(router, { userRole: "staff" })}
      />

      <View style={[styles.topBar, { backgroundColor: uiTokens.colors.surface, borderBottomColor: uiTokens.colors.border }]}>
        <View style={styles.modeRow}>
          <ModeChip label="SERIAL" active={mode === "SERIAL"} onPress={() => setMode("SERIAL")} accentColor={uiTokens.colors.accent} borderColor={uiTokens.colors.border} activeTextColor={uiTokens.colors.surfaceElevated} />
          <ModeChip label="ITEM"   active={mode === "ITEM"}   onPress={() => setMode("ITEM")}   accentColor={uiTokens.colors.accent} borderColor={uiTokens.colors.border} activeTextColor={uiTokens.colors.surfaceElevated} />
          <ModeChip label="AUTO"   active={mode === "AUTO"}   onPress={() => setMode("AUTO")}   accentColor={uiTokens.colors.accent} borderColor={uiTokens.colors.border} activeTextColor={uiTokens.colors.surfaceElevated} />
        </View>
        <Text style={[styles.hint, { color: uiTokens.colors.textSecondary }]}>
          {mode === "SERIAL"
            ? "Scanning serial codes (alphanumeric). EAN/UPC codes are ignored."
            : mode === "ITEM"
              ? "Scanning item barcodes (EAN/UPC digits only)."
              : "Auto mode: accepts both serial and item codes."}
        </Text>
      </View>

      {!permission?.granted ? (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            Camera permission is required for serial scanning.
          </Text>
          {permission?.canAskAgain !== false ? (
            <ModernButton
              title="Grant Permission"
              variant="primary"
              style={{ minHeight: 44, width: "100%" }}
              onPress={requestPermission}
            />
          ) : (
            <ModernButton
              title="Open Settings"
              variant="primary"
              style={{ minHeight: 44, width: "100%" }}
              onPress={handleOpenSettings}
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

      <View style={styles.bottomPanel}>
        <View style={styles.statsRow}>
          <View>
            <Text style={[styles.count, { color: uiTokens.colors.surfaceElevated }]}>{serials.length}</Text>
            <Text style={styles.countLabel}>codes scanned</Text>
          </View>
          <ModernButton
            title="Done"
            icon="checkmark-circle-outline"
            variant="primary"
            style={{ height: 44, minWidth: 110 }}
            onPress={() => safeBackNavigation(router, { userRole: "staff" })}
          />
        </View>
        {serials.length > 0 && (
          <Text style={styles.list} numberOfLines={2}>
            Recent: {serials.slice(-6).join("  •  ")}
          </Text>
        )}
      </View>
    </View>
  );
}

function ModeChip(props: {
  label: ScanMode;
  active: boolean;
  onPress: () => void;
  accentColor: string;
  borderColor: string;
  activeTextColor: string;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.chip,
        {
          borderColor: props.active ? props.accentColor : props.borderColor,
          backgroundColor: props.active ? props.accentColor : "transparent",
        },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected: props.active }}
    >
      <Text style={[styles.chipText, { color: props.active ? props.activeTextColor : colorWithAlpha(props.accentColor, 0.8) }]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modeRow: { flexDirection: "row", gap: 8 },
  hint: { marginTop: 8, fontSize: 12, lineHeight: 17 },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  permissionText: { color: "rgba(255,255,255,0.8)", fontSize: 15, textAlign: "center", lineHeight: 22 },
  cameraWrap: { flex: 1, position: "relative" },
  frame: {
    position: "absolute",
    left: 32,
    right: 32,
    top: "28%",
    height: 220,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: 16,
  },
  bottomPanel: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: "rgba(10,10,10,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  count: { fontSize: 28, fontWeight: "800" },
  countLabel: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "600", marginTop: 2 },
  list: { color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 18 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
});
