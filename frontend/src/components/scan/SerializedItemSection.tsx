import React, { useMemo } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import type { SerialEntryData } from "@/types/scan";
import { SerialEntriesSection } from "@/components/scan/SerialEntriesSection";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";

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
  const uiTokens = useUiTokens();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        section: {
          marginBottom: uiTokens.spacing.lg,
        },
        toggleRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingVertical: uiTokens.spacing.sm,
        },
        toggleLabelContainer: {
          flexDirection: "row",
          alignItems: "center",
          gap: uiTokens.spacing.sm,
        },
        toggleLabel: {
          fontSize: 14,
          fontWeight: "700",
          color: uiTokens.colors.textPrimary,
        },
        toggleHint: {
          fontSize: 12,
          marginTop: uiTokens.spacing.xs,
          color: uiTokens.colors.textSecondary,
        },
      }),
    [uiTokens]
  );

  if (!enabled) {
    return null;
  }

  return (
    <>
      <View style={styles.section}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelContainer}>
            <Ionicons name="barcode-outline" size={20} color={uiTokens.colors.accent} />
            <Text style={styles.toggleLabel}>Is Serialized Item</Text>
          </View>
          <Switch
            value={isSerializedItem}
            onValueChange={onSerializedChange}
            trackColor={{
              false: colorWithAlpha(
                uiTokens.colors.textMuted,
                uiTokens.mode === "dark" ? 0.45 : 0.28
              ),
              true: uiTokens.colors.accent,
            }}
            thumbColor={
              isSerializedItem ? uiTokens.colors.surfaceElevated : uiTokens.colors.surface
            }
          />
        </View>
        <Text style={styles.toggleHint}>
          {isSerializedItem
            ? "Capture each unit with a unique serial number before saving."
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
