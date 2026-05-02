import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { SerialEntryData } from "@/types/scan";
import {
  colors,
  fontSize,
  fontWeight,
  radius as borderRadius,
  semanticColors,
  spacing,
} from "@/theme/unified";

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
        <TouchableOpacity style={styles.removeButton} onPress={onRemove}>
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
        placeholderTextColor={semanticColors.text.disabled}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {validationError && <Text style={styles.errorText}>{validationError}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    backgroundColor: semanticColors.background.card,
    borderWidth: 1,
    borderColor: semanticColors.border.default,
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
    color: semanticColors.text.secondary,
  },
  removeButton: {
    padding: spacing.xs,
  },
  input: {
    minHeight: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    backgroundColor: semanticColors.background.paper,
    color: semanticColors.text.primary,
    fontSize: fontSize.md,
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.error[600],
  },
});
