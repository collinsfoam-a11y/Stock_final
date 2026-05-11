import React, { useMemo } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { SerialEntryData } from "@/types/scan";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";

interface SerialEntryCardProps {
  entry: SerialEntryData;
  index: number;
  validationError?: string | null;
  onChangeText: (text: string) => void;
  onRemove: () => void;
}

export const SerialEntryCard: React.FC<SerialEntryCardProps> = ({
  entry,
  index,
  validationError,
  onChangeText,
  onRemove,
}) => {
  const uiTokens = useUiTokens();
  const hasValue = entry.serial_number.trim().length > 0;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          borderRadius: uiTokens.radius.lg,
          padding: uiTokens.spacing.md,
          backgroundColor: uiTokens.colors.surfaceElevated,
          borderWidth: 1,
          borderColor: uiTokens.colors.border,
        },
        header: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: uiTokens.spacing.sm,
        },
        label: {
          fontSize: 12,
          fontWeight: "700",
          color: uiTokens.colors.textSecondary,
        },
        removeButton: {
          padding: uiTokens.spacing.xs,
          borderRadius: uiTokens.radius.sm,
          backgroundColor: colorWithAlpha(
            uiTokens.colors.error,
            uiTokens.mode === "dark" ? 0.24 : 0.1
          ),
        },
        input: {
          minHeight: 48,
          borderRadius: uiTokens.radius.md,
          borderWidth: 1,
          paddingHorizontal: uiTokens.spacing.md,
          backgroundColor: uiTokens.colors.surface,
          color: uiTokens.colors.textPrimary,
          fontSize: 14,
        },
        errorText: {
          marginTop: uiTokens.spacing.xs,
          fontSize: 12,
          color: uiTokens.colors.error,
          fontWeight: "600",
        },
      }),
    [uiTokens]
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Unit #{index + 1}</Text>
        <TouchableOpacity style={styles.removeButton} onPress={onRemove}>
          <Ionicons name="trash-outline" size={18} color={uiTokens.colors.error} />
        </TouchableOpacity>
      </View>

      <TextInput
        style={[
          styles.input,
          {
            borderColor: hasValue
              ? validationError
                ? uiTokens.colors.error
                : uiTokens.colors.success
              : uiTokens.colors.border,
          },
        ]}
        value={entry.serial_number}
        onChangeText={onChangeText}
        placeholder="Serial number"
        placeholderTextColor={uiTokens.colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {validationError && <Text style={styles.errorText}>{validationError}</Text>}
    </View>
  );
};
