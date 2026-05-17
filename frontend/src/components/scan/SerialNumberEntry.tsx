/**
 * SerialNumberEntry Component
 * Handles serial number input, validation, and management
 */
import React from "react";
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SerialInput } from "@/types/scan";

import { semanticColors, colors } from "@/theme/legacyCompat";
import { colorWithAlpha } from "@/theme/themeTokens";
interface SerialNumberEntryProps {
  serialInputs: SerialInput[];
  requiredSerialCount: number;
  serialCaptureEnabled: boolean;
  serialInputTarget: number;
  expectedSerialCount: number;
  scannerMode: "item" | "serial";
  serialScanTargetId: string | null;
  showScanner: boolean;
  continuousScanMode: boolean;
  serialRequirementMessage: string;
  missingSerialCount: number;
  extraSerialCount: number;
  onToggleSerialCapture: (value: boolean) => void;
  onSerialValueChange: (id: string, value: string) => void;
  onScanSerialSlot: (id: string) => void;
  onRemoveSerial: (id: string) => void;
  onScanNextSerial: () => void;
  onAddSerial: () => void;
  onActivityReset?: () => void;
}

export const SerialNumberEntry: React.FC<SerialNumberEntryProps> = ({
  serialInputs,
  requiredSerialCount,
  serialCaptureEnabled,
  serialInputTarget,
  expectedSerialCount: _expectedSerialCount,
  scannerMode,
  serialScanTargetId,
  showScanner,
  continuousScanMode: _continuousScanMode,
  serialRequirementMessage,
  missingSerialCount,
  extraSerialCount,
  onToggleSerialCapture,
  onSerialValueChange,
  onScanSerialSlot,
  onRemoveSerial,
  onScanNextSerial,
  onAddSerial,
  onActivityReset,
}) => {
  const handleSerialChange = (id: string, text: string) => {
    onActivityReset?.();
    onSerialValueChange(id, text);
  };

  const handleRemove = (id: string) => {
    onActivityReset?.();
    if (requiredSerialCount > 0 && serialInputs.length <= requiredSerialCount) {
      Alert.alert(
        "Cannot Remove",
        `At least ${requiredSerialCount} serial number${requiredSerialCount > 1 ? "s are" : " is"} required.`
      );
      return;
    }
    onRemoveSerial(id);
  };

  return (
    <View style={styles.serialSection}>
      <View style={styles.serialHeader}>
        <Text style={styles.subSectionTitle}>Serial Numbers</Text>
        {requiredSerialCount === 0 && (
          <View style={styles.serialToggleRow}>
            <Text style={styles.serialToggleLabel}>Capture</Text>
            <Switch
              value={serialCaptureEnabled}
              onValueChange={onToggleSerialCapture}
              trackColor={{ false: colors.neutral[600], true: colors.primary[500] }}
              thumbColor={serialCaptureEnabled ? colors.success[50] : colors.neutral[100]}
            />
          </View>
        )}
      </View>
      <Text style={styles.serialRequirementText}>{serialRequirementMessage}</Text>
      {missingSerialCount > 0 && (
        <Text style={styles.serialHelperText}>
          {missingSerialCount} more serial number
          {missingSerialCount > 1 ? "s" : ""} needed to match the counted quantity.
        </Text>
      )}
      {extraSerialCount > 0 && (
        <Text style={styles.serialErrorText}>
          Remove {extraSerialCount} extra serial number
          {extraSerialCount > 1 ? "s" : ""} to match the counted quantity.
        </Text>
      )}

      {(serialCaptureEnabled || requiredSerialCount > 0) && (
        <View style={styles.serialInputsContainer}>
          {serialInputs.map((entry, index) => {
            const isActiveSerialSlot =
              showScanner && scannerMode === "serial" && serialScanTargetId === entry.id;
            const serialLabel = entry.label || `Serial #${index + 1}`;

            return (
              <View
                key={entry.id}
                style={[styles.serialInputRow, isActiveSerialSlot && styles.serialInputRowActive]}
              >
                <View style={styles.serialInputHeader}>
                  <Text style={styles.serialInputLabel}>{serialLabel}</Text>
                  <View style={styles.serialInputActions}>
                    <TouchableOpacity
                      style={styles.serialActionButton}
                      onPress={() => onScanSerialSlot(entry.id ?? "")}
                    >
                      <Ionicons name="scan-outline" size={18} color={colors.primary[500]} />
                    </TouchableOpacity>
                    {(requiredSerialCount === 0 || serialInputs.length > requiredSerialCount) && (
                      <TouchableOpacity
                        style={styles.removeSerialButton}
                        onPress={() => handleRemove(entry.id ?? "")}
                      >
                        <Ionicons name="trash" size={18} color={colors.error[500]} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <TextInput
                  style={styles.serialTextInput}
                  placeholder="Scan or enter serial number"
                  placeholderTextColor={semanticColors.text.tertiary}
                  value={entry.value}
                  onChangeText={(text) => handleSerialChange(entry.id ?? "", text)}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
            );
          })}
          <View style={styles.serialControlsRow}>
            <TouchableOpacity style={styles.scanSerialButton} onPress={onScanNextSerial}>
              <Ionicons name="scan-outline" size={18} color={colors.primary[500]} />
              <Text style={styles.scanSerialButtonText}>Scan Next</Text>
            </TouchableOpacity>
            {serialInputs.length < serialInputTarget && (
              <TouchableOpacity style={styles.addSerialButton} onPress={onAddSerial}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary[500]} />
                <Text style={styles.addSerialButtonText}>Add Serial</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  serialSection: {
    marginBottom: 16,
  },
  serialHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  subSectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: semanticColors.text.inverse,
  },
  serialToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  serialToggleLabel: {
    fontSize: 14,
    color: semanticColors.text.tertiary,
  },
  serialRequirementText: {
    fontSize: 14,
    color: semanticColors.text.tertiary,
    marginBottom: 8,
  },
  serialHelperText: {
    fontSize: 12,
    color: colors.warning[400],
    marginBottom: 8,
    fontStyle: "italic",
  },
  serialErrorText: {
    fontSize: 12,
    color: colors.error[500],
    marginBottom: 8,
    fontWeight: "600",
  },
  serialInputsContainer: {
    marginTop: 12,
  },
  serialInputRow: {
    backgroundColor: colors.neutral[800],
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.neutral[700],
  },
  serialInputRowActive: {
    borderColor: colors.primary[500],
    borderWidth: 2,
    backgroundColor: colorWithAlpha(colors.success[800], 0.35),
  },
  serialInputHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  serialInputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: semanticColors.text.tertiary,
  },
  serialInputActions: {
    flexDirection: "row",
    gap: 8,
  },
  serialActionButton: {
    backgroundColor: colors.neutral[800],
    borderRadius: 8,
    padding: 8,
  },
  removeSerialButton: {
    backgroundColor: colorWithAlpha(colors.error[800], 0.35),
    borderRadius: 8,
    padding: 8,
  },
  serialTextInput: {
    backgroundColor: colors.neutral[800],
    borderRadius: 8,
    padding: 12,
    color: semanticColors.text.inverse,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.neutral[700],
  },
  serialControlsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  scanSerialButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary[500],
    borderRadius: 12,
    padding: 14,
  },
  scanSerialButtonText: {
    color: semanticColors.text.inverse,
    fontSize: 16,
    fontWeight: "600",
  },
  addSerialButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.neutral[800],
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primary[500],
  },
  addSerialButtonText: {
    color: colors.primary[500],
    fontSize: 16,
    fontWeight: "600",
  },
});
