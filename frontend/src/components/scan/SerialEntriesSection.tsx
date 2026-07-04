import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { SerialEntryData } from "@/types/scan";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { SerialEntryCard } from "./SerialEntryCard";

interface SerialEntriesSectionProps {
  serialEntries: SerialEntryData[];
  serialValidationErrors: string[];
  serialValidationMessages: (string | null)[];
  onOpenScanner: () => void;
  onAddSerial: () => void;
  onSerialChange: (index: number, text: string) => void;
  onRemoveSerial: (index: number) => void;
}

export const SerialEntriesSection: React.FC<SerialEntriesSectionProps> = ({
  serialEntries,
  serialValidationErrors,
  serialValidationMessages,
  onOpenScanner,
  onAddSerial,
  onSerialChange,
  onRemoveSerial,
}) => {
  const uiTokens = useUiTokens();
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
          paddingVertical: uiTokens.spacing.md,
          borderRadius: uiTokens.radius.md,
          backgroundColor: uiTokens.colors.accent,
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
        },
        listContent: {
          gap: uiTokens.spacing.sm,
        },
        addButton: {
          marginTop: uiTokens.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
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

  const renderSerialEntry = useCallback(
    ({ item, index }: { item: SerialEntryData; index: number }) => (
      <SerialEntryCard
        entry={item}
        index={index}
        validationError={serialValidationMessages[index]}
        onChangeText={(text) => onSerialChange(index, text)}
        onRemove={() => onRemoveSerial(index)}
      />
    ),
    [onRemoveSerial, onSerialChange, serialValidationMessages]
  );

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="barcode-outline" size={20} color={uiTokens.colors.accent} />
          <Text style={styles.title}>Serial Numbers</Text>
        </View>
        <Text style={styles.helperText}>
          Scan or type serial numbers - quantity auto-updates ({serialEntries.length} scanned)
        </Text>
      </View>

      <TouchableOpacity style={styles.scanButton} onPress={onOpenScanner}>
        <Ionicons name="scan" size={22} color={uiTokens.colors.surfaceElevated} />
        <Text style={styles.scanButtonText}>Scan Serial Numbers</Text>
      </TouchableOpacity>

      {serialValidationErrors.length > 0 && (
        <View style={styles.validationContainer}>
          {serialValidationErrors.map((error, index) => (
            <Text key={`${error}-${index}`} style={styles.validationText}>
              • {error}
            </Text>
          ))}
        </View>
      )}

      {/* ⚡ Bolt: Replaced FlatList with simple array map when scrollEnabled={false} to remove virtualization overhead. */}
      <View style={[styles.list, styles.listContent]}>
        {serialEntries.map((entry, index) => (
          <React.Fragment key={entry.id}>
            {renderSerialEntry({ item: entry, index })}
          </React.Fragment>
        ))}
      </View>

      <TouchableOpacity style={styles.addButton} onPress={onAddSerial}>
        <Ionicons name="add-circle-outline" size={20} color={uiTokens.colors.accentStrong} />
        <Text style={styles.addButtonText}>Add Serial Manually</Text>
      </TouchableOpacity>
    </View>
  );
};
