import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import type { SerialEntryData } from "@/types/scan";
import { SerialEntriesSection } from "@/components/scan/SerialEntriesSection";
import {
  colors,
  fontSize,
  fontWeight,
  semanticColors,
  spacing,
} from "@/theme/unified";

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
      <View style={styles.section}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelContainer}>
            <Ionicons
              name="barcode-outline"
              size={20}
              color={colors.primary[600]}
            />
            <Text
              style={[styles.toggleLabel, { color: semanticColors.text.primary }]}
            >
              Is Serialized Item
            </Text>
          </View>
          <Switch
            value={isSerializedItem}
            onValueChange={onSerializedChange}
            trackColor={{
              false: colors.neutral[200],
              true: colors.primary[600],
            }}
            thumbColor={isSerializedItem ? colors.white : colors.neutral[50]}
          />
        </View>
        <Text
          style={[styles.toggleHint, { color: semanticColors.text.secondary }]}
        >
          {isSerializedItem
            ? "Enable to capture individual serial numbers for each unit"
            : "Turn on if this item has unique serial numbers"}
        </Text>
      </View>

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
  section: {
    marginBottom: spacing.xl,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  toggleLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  toggleLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  toggleHint: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
});
