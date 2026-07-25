import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AppIcon from "@/components/ui/AppIcon";
import type { SerialEntryData } from "@/types/scan";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { SerialEntryCard } from "./SerialEntryCard";

interface SerialEntriesSectionProps {
  serialEntries: SerialEntryData[];
  serialValidationErrors: string[];
  serialValidationMessages: Record<string, string | null>;
  onOpenScanner: () => void;
  onAddSerial: () => void;
  onSerialChange: (index: number, text: string) => void;
  onSerialBlur?: (index: number) => void;
  onRemoveSerial: (index: number) => void;
  isScannerOpening?: boolean;
}

export const SerialEntriesSection: React.FC<SerialEntriesSectionProps> = ({
  serialEntries,
  serialValidationErrors,
  serialValidationMessages,
  onOpenScanner,
  onAddSerial,
  onSerialChange,
  onSerialBlur,
  onRemoveSerial,
  isScannerOpening = false,
}) => {
  const uiTokens = useUiTokens();

  const filledSerialCount = useMemo(
    () => serialEntries.filter((entry) => entry.serial_number.trim().length > 0).length,
    [serialEntries]
  );

  const uniqueValidationErrors = useMemo(
    () => [...new Set(serialValidationErrors)],
    [serialValidationErrors]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        section: {
          marginTop: uiTokens.spacing.md,
        },
        header: {
          marginBottom: uiTokens.spacing.md,
        },
        titleRow: {
          flexDirection: "row",
          alignItems: "center",
        },
        title: {
          marginLeft: uiTokens.spacing.xs,
          fontSize: 14,
          fontWeight: "700",
          color: uiTokens.colors.textPrimary,
        },
        helperText: {
          marginTop: uiTokens.spacing.xs,
          fontSize: 12,
          color: uiTokens.colors.textSecondary,
        },
        scanButton: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: uiTokens.spacing.sm,
          minHeight: 48,
          paddingVertical: uiTokens.spacing.md,
          borderRadius: uiTokens.radius.md,
          backgroundColor: uiTokens.colors.accent,
        },
        disabledButton: {
          opacity: 0.55,
        },
        scanButtonText: {
          fontSize: 14,
          fontWeight: "700",
          color: uiTokens.colors.surfaceElevated,
        },
        validationContainer: {
          marginTop: uiTokens.spacing.md,
          borderRadius: uiTokens.radius.md,
          padding: uiTokens.spacing.md,
          backgroundColor: colorWithAlpha(
            uiTokens.colors.error,
            uiTokens.mode === "dark" ? 0.2 : 0.1
          ),
          borderWidth: 1,
          borderColor: colorWithAlpha(uiTokens.colors.error, 0.4),
        },
        validationText: {
          fontSize: 12,
          color: uiTokens.colors.error,
          fontWeight: "600",
        },
        list: {
          marginTop: uiTokens.spacing.md,
          gap: uiTokens.spacing.sm,
        },
        emptyText: {
          fontSize: 12,
          color: uiTokens.colors.textSecondary,
          textAlign: "center",
          paddingVertical: uiTokens.spacing.md,
        },
        addButton: {
          marginTop: uiTokens.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 44,
          gap: uiTokens.spacing.sm,
          borderWidth: 1,
          borderColor: colorWithAlpha(uiTokens.colors.accent, 0.35),
          backgroundColor: colorWithAlpha(
            uiTokens.colors.accent,
            uiTokens.mode === "dark" ? 0.2 : 0.08
          ),
          borderRadius: uiTokens.radius.md,
          paddingVertical: uiTokens.spacing.sm,
        },
        addButtonText: {
          fontSize: 13,
          fontWeight: "700",
          color: uiTokens.colors.accentStrong,
        },
      }),
    [uiTokens]
  );

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <AppIcon name="barcode-outline" size={20} color={uiTokens.colors.accent} />
          <Text style={styles.title}>Serial Numbers</Text>
        </View>
        <Text style={styles.helperText}>
          Scan or type serial numbers — quantity auto-updates ({filledSerialCount} captured)
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.scanButton, isScannerOpening && styles.disabledButton]}
        onPress={onOpenScanner}
        disabled={isScannerOpening}
        accessibilityRole="button"
        accessibilityLabel="Scan serial numbers"
        accessibilityHint="Opens the camera to capture serial numbers"
        accessibilityState={{
          disabled: isScannerOpening,
        }}
      >
        <AppIcon name="scan" size={22} color={uiTokens.colors.surfaceElevated} />
        <Text style={styles.scanButtonText}>
          {isScannerOpening ? "Opening Scanner…" : "Scan Serial Numbers"}
        </Text>
      </TouchableOpacity>

      {uniqueValidationErrors.length > 0 && (
        <View style={styles.validationContainer} accessibilityRole="alert">
          {uniqueValidationErrors.slice(0, 3).map((error) => (
            <Text key={error} style={styles.validationText}>
              • {error}
            </Text>
          ))}
          {uniqueValidationErrors.length > 3 && (
            <Text style={styles.validationText}>
              +{uniqueValidationErrors.length - 3} more errors
            </Text>
          )}
        </View>
      )}

      <View style={styles.list}>
        {serialEntries.length === 0 ? (
          <Text style={styles.emptyText}>No serial numbers added yet.</Text>
        ) : (
          serialEntries.map((entry, index) => (
            <SerialEntryCard
              key={entry.id}
              entry={entry}
              index={index}
              validationError={serialValidationMessages[entry.id]}
              onChangeText={(text) => onSerialChange(index, text)}
              onBlur={() => onSerialBlur?.(index)}
              onRemove={() => onRemoveSerial(index)}
            />
          ))
        )}
      </View>

      <TouchableOpacity
        style={styles.addButton}
        onPress={onAddSerial}
        accessibilityRole="button"
        accessibilityLabel="Add serial manually"
        accessibilityHint="Adds an empty serial number field"
      >
        <AppIcon name="add-circle-outline" size={20} color={uiTokens.colors.accentStrong} />
        <Text style={styles.addButtonText}>Add Serial Manually</Text>
      </TouchableOpacity>
    </View>
  );
};
