import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { SerialEntryData } from "@/types/scan";
import {
  colors,
  fontSize,
  fontWeight,
  spacing,
} from "@/theme/unified";

const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

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
  const hasValue = entry.serial_number.trim().length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Unit #{index + 1}</Text>
        <TouchableOpacity style={styles.removeButton} onPress={onRemove} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={18} color={colors.error[500]} />
        </TouchableOpacity>
      </View>

      <TextInput
        style={[
          styles.input,
          {
            borderColor: hasValue
              ? validationError
                ? colors.error[500]
                : colors.success[500]
              : colors.neutral[300],
          },
        ]}
        value={entry.serial_number}
        onChangeText={onChangeText}
        placeholder="Serial number"
        placeholderTextColor={TEXT_MUTED}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {validationError && <Text style={styles.errorText}>{validationError}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: spacing.md,
    backgroundColor: SURFACE_MUTED,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: TEXT_MUTED,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.error[50],
  },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    color: TEXT_STRONG,
    fontSize: fontSize.md,
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.error[700],
  },
});
