import React from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { DateFormatType } from "@/types/scan";
import {
  colors,
  fontSize,
  fontWeight,
  radius as borderRadius,
  semanticColors,
  spacing,
} from "@/theme/unified";
import type { DatePickerPart, DateParts } from "@/domains/inventory/hooks/scan/useFlexibleDateField";

const DATE_FORMAT_OPTIONS: {
  value: DateFormatType;
  label: string;
}[] = [
  { value: "full", label: "Full Date" },
  { value: "month_year", label: "Month & Year" },
  { value: "year_only", label: "Year Only" },
];

interface FlexibleDateFieldProps {
  label: string;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  format: DateFormatType;
  onChangeFormat: (format: DateFormatType) => void;
  value: string;
  isValid: boolean;
  isFull: boolean;
  isMonthYear: boolean;
  parts: DateParts;
  onOpenPicker: (part: DatePickerPart) => void;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  trackColor: string;
}

const PickerButton = ({
  value,
  placeholder,
  fullWidth = false,
  onPress,
}: {
  value: string;
  placeholder: string;
  fullWidth?: boolean;
  onPress: () => void;
}) => {
  return (
    <TouchableOpacity
      style={[styles.smallPicker, fullWidth && styles.smallPickerFull]}
      onPress={onPress}
    >
      <Text style={[styles.smallPickerText, !value && styles.placeholderText]}>
        {value || placeholder}
      </Text>
    </TouchableOpacity>
  );
};

export const FlexibleDateField: React.FC<FlexibleDateFieldProps> = ({
  label,
  enabled,
  onToggleEnabled,
  format,
  onChangeFormat,
  value,
  isValid,
  isFull,
  isMonthYear,
  parts,
  onOpenPicker,
  iconName,
  iconColor,
  trackColor,
}) => {
  return (
    <View>
      <View style={styles.toggleRow}>
        <View style={styles.toggleLabelContainer}>
          <Ionicons name={iconName} size={20} color={iconColor} />
          <Text style={styles.toggleLabel}>Has {label}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggleEnabled}
          trackColor={{
            false: colors.neutral[200],
            true: trackColor,
          }}
          thumbColor={enabled ? colors.white : colors.neutral[50]}
        />
      </View>

      {enabled && (
        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.formatPicker}>
              {DATE_FORMAT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.formatOption,
                    format === option.value && styles.formatOptionActive,
                  ]}
                  onPress={() => onChangeFormat(option.value)}
                >
                  <Text
                    style={[
                      styles.formatOptionText,
                      format === option.value && styles.formatOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View
            style={[
              styles.inputShell,
              {
                borderColor: value && !isValid ? colors.error[500] : colors.neutral[300],
              },
            ]}
          >
            {isFull ? (
              <View style={styles.partsRow}>
                <PickerButton value={parts.day} placeholder="DD" onPress={() => onOpenPicker("day")} />
                <PickerButton
                  value={parts.month}
                  placeholder="MM"
                  onPress={() => onOpenPicker("month")}
                />
                <PickerButton
                  value={parts.year}
                  placeholder="YYYY"
                  onPress={() => onOpenPicker("year")}
                />
              </View>
            ) : isMonthYear ? (
              <View style={styles.partsRow}>
                <PickerButton
                  value={parts.month}
                  placeholder="MM"
                  onPress={() => onOpenPicker("month")}
                />
                <PickerButton
                  value={parts.year}
                  placeholder="YYYY"
                  onPress={() => onOpenPicker("year")}
                />
              </View>
            ) : (
              <PickerButton
                value={parts.year}
                placeholder="YYYY"
                fullWidth
                onPress={() => onOpenPicker("year")}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  toggleLabel: {
    marginLeft: spacing.sm,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: semanticColors.text.primary,
  },
  section: {
    marginTop: spacing.md,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semiBold,
    color: semanticColors.text.primary,
  },
  formatPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.xs,
    flex: 1,
  },
  formatOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: semanticColors.border.default,
    backgroundColor: semanticColors.background.paper,
  },
  formatOptionActive: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[600],
  },
  formatOptionText: {
    fontSize: fontSize.xs,
    color: semanticColors.text.secondary,
  },
  formatOptionTextActive: {
    color: colors.primary[700],
    fontWeight: fontWeight.medium,
  },
  inputShell: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    backgroundColor: semanticColors.background.paper,
  },
  partsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  smallPicker: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: semanticColors.border.default,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    backgroundColor: semanticColors.background.paper,
  },
  smallPickerFull: {
    width: "100%",
  },
  smallPickerText: {
    fontSize: fontSize.md,
    color: semanticColors.text.primary,
  },
  placeholderText: {
    color: semanticColors.text.disabled,
  },
});
