import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import type { SerialEntryData } from "@/types/scan";
import { SerialEntriesSection } from "@/components/scan/SerialEntriesSection";
import ModernCard from "@/components/ui/ModernCard";
import {
  colors,
  fontSize,
  fontWeight,
  spacing,
} from "@/theme/unified";

const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

interface SerializedItemSectionProps {
  enabled: boolean;
  isSerializedItem: boolean;
  serialEntries: SerialEntryData[];
  serialValidationErrors: string[];
  serialValidationMessages: (string | null)[];
  onAddSerial: () => void;
  onOpenScanner: () => void;
  onRemoveSerial: (index: number) => void;
  onSerialChange: (index: number, text: string) => void;
  onSerializedChange: (value: boolean) => void;
}

export function SerializedItemSection({
  enabled,
  isSerializedItem,
  serialEntries,
  serialValidationErrors,
  serialValidationMessages,
  onAddSerial,
  onOpenScanner,
  onRemoveSerial,
  onSerialChange,
  onSerializedChange,
}: SerializedItemSectionProps) {
  if (!enabled) {
    return null;
  }

  return (
    <>
      <ModernCard style={styles.sectionCard} contentStyle={styles.sectionCardContent}>
        <Text style={styles.sectionKicker}>Serial control</Text>
        <Text style={styles.sectionTitle}>Track each physical unit</Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelContainer}>
            <Ionicons
              name="barcode-outline"
              size={20}
              color={ACCENT}
            />
            <Text style={styles.toggleLabel}>Is Serialized Item</Text>
          </View>
          <Switch
            value={isSerializedItem}
            onValueChange={onSerializedChange}
            trackColor={{
              false: colors.neutral[200],
              true: ACCENT,
            }}
            thumbColor={isSerializedItem ? colors.white : colors.neutral[50]}
          />
        </View>
        <Text style={styles.toggleHint}>
          {isSerializedItem
            ? "Enable to capture individual serial numbers for each unit"
            : "Turn on if this item has unique serial numbers"}
        </Text>
      </ModernCard>

      {isSerializedItem && (
        <SerialEntriesSection
          serialEntries={serialEntries}
          serialValidationErrors={serialValidationErrors}
          serialValidationMessages={serialValidationMessages}
          onOpenScanner={onOpenScanner}
          onAddSerial={onAddSerial}
          onSerialChange={onSerialChange}
          onRemoveSerial={onRemoveSerial}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    marginBottom: spacing.xl,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_CARD,
  },
  sectionCardContent: {
    padding: spacing.lg,
  },
  sectionKicker: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: TEXT_STRONG,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 44,
  },
  toggleLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  toggleLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: TEXT_STRONG,
  },
  toggleHint: {
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    color: TEXT_MUTED,
    backgroundColor: SURFACE_MUTED,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
