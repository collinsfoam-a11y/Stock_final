import React, { useCallback } from "react";
import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { SerialEntryData } from "@/types/scan";
import ModernCard from "@/components/ui/ModernCard";
import {
  colors,
  fontSize,
  fontWeight,
  spacing,
} from "@/theme/unified";
import { SerialEntryCard } from "./SerialEntryCard";

const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

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
    <ModernCard style={styles.sectionCard} contentStyle={styles.sectionCardContent}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="barcode-outline" size={20} color={ACCENT} />
          <Text style={styles.title}>Serial Numbers</Text>
        </View>
        <Text style={styles.helperText}>
          Scan or type serial numbers - quantity auto-updates ({serialEntries.length} scanned)
        </Text>
      </View>

      <TouchableOpacity style={styles.scanButton} onPress={onOpenScanner} activeOpacity={0.9}>
        <Ionicons name="scan" size={24} color={colors.white} />
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

      <FlatList
        data={serialEntries}
        keyExtractor={(entry) => entry.id}
        renderItem={renderSerialEntry}
        extraData={serialValidationMessages}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled={Platform.OS === "android"}
        scrollEnabled={false}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
      />

      <TouchableOpacity style={styles.addButton} onPress={onAddSerial} activeOpacity={0.85}>
        <Ionicons name="add-circle-outline" size={20} color={ACCENT} />
        <Text style={styles.addButtonText}>Add Serial Manually</Text>
      </TouchableOpacity>
    </ModernCard>
  );
};

const styles = StyleSheet.create({
  sectionCard: {
    marginTop: spacing.md,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_CARD,
  },
  sectionCardContent: {
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    marginLeft: spacing.xs,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: TEXT_STRONG,
  },
  helperText: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: TEXT_MUTED,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: spacing.md,
    borderRadius: 18,
    backgroundColor: ACCENT,
  },
  scanButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: colors.white,
  },
  validationContainer: {
    marginTop: spacing.md,
    borderRadius: 14,
    padding: spacing.md,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  validationText: {
    fontSize: fontSize.sm,
    color: colors.error[700],
  },
  list: {
    marginTop: spacing.md,
  },
  listContent: {
    gap: spacing.sm,
  },
  addButton: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_MUTED,
  },
  addButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semiBold,
    color: ACCENT,
  },
});
