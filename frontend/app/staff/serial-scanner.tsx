// app/staff/serial-scanner.tsx
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from "expo-camera";
import { useRouter } from "expo-router";

// Fix 1: Use correct alias imports
import { useScanGate } from "@/scanner/useScanGate";
import {
  ScanMode,
  decide,
  normalizeScanValue,
  scoreCandidate,
} from "@/scanner/serialScanRules";
import { colors } from "@/theme/modernDesign";
import ModernButton from "@/components/ui/ModernButton";
import ModernHeader from "@/components/ui/ModernHeader";

function toast(msg: string) {
  Alert.alert("Scan", msg);
}

export default function SerialScannerScreen() {
  const router = useRouter();
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
              : "Wrong code detected. Scan the ITEM EAN barcode (digits).",
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
    [mode, canProcess, release, addValue],
  );

  // Fix 5: Dynamic barcode types
  const barcodeTypes = useMemo(() => {
    if (mode === "SERIAL")
      return ["code128", "code39", "code93", "qr", "datamatrix"];
    if (mode === "ITEM") return ["ean13", "ean8", "upc_a", "upc_e"];
    return [
      "ean13",
      "ean8",
      "upc_a",
      "upc_e",
      "code128",
      "code39",
      "code93",
      "qr",
      "datamatrix",
    ];
  }, [mode]);

  const handleOpenSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        "Settings Unavailable",
        "Please enable camera permission manually from app settings.",
      );
    }
  }, []);

  return (
    <View style={styles.container}>
      <ModernHeader
        title="Scan Serials"
        showBackButton
        onBackPress={() => router.back()}
      />

      <View style={styles.topBar}>
        <View style={styles.modeRow}>
          <ModeChip
            label="SERIAL"
            active={mode === "SERIAL"}
            onPress={() => setMode("SERIAL")}
          />
          <ModeChip
            label="ITEM"
            active={mode === "ITEM"}
            onPress={() => setMode("ITEM")}
          />
          <ModeChip
            label="AUTO"
            active={mode === "AUTO"}
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
          <Text style={styles.count}>Scanned: {serials.length}</Text>
          <ModernButton
            title="Done"
            variant="primary"
            style={{ height: 40, minWidth: 100 }}
            onPress={() => {
              // Return logic: Pass back to previous screen
              // For now, we just go back. Ideally update a store or pass params.
              router.back();
              // In a real app, you might do: router.push({ pathname: '..', params: { newSerials: serials }})
              // or use a global store action.
            }}
          />
        </View>

        <Text style={styles.list} numberOfLines={3}>
          {serials.slice(-6).join(", ")}
        </Text>
      </View>
    </View>
  );
}

function ModeChip(props: {
  label: ScanMode;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.chip, props.active && styles.chipActive]}
    >
      <Text style={[styles.chipText, props.active && styles.chipTextActive]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topBar: { paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#000" },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  hint: { color: "rgba(255,255,255,0.7)", marginTop: 8, fontSize: 12 },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
  },
  permissionText: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
  },

  cameraWrap: { flex: 1, position: "relative" },
  frame: {
    position: "absolute",
    left: 40,
    right: 40,
    top: "30%",
    height: 200,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.6)",
    borderRadius: 12,
  },

  bottomPanel: {
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.9)",
    paddingBottom: 32,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  count: { color: "#fff", fontSize: 18, fontWeight: "700" },
  list: { color: "rgba(255,255,255,0.6)", fontSize: 12 },

  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  chipActive: {
    backgroundColor: colors.primary[500],
    borderColor: colors.primary[500],
  },
  chipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
});
