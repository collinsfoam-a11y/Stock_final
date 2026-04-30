import React from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { DateFormatType } from "@/types/scan";
import {
  colors,
  fontSize,
  fontWeight,
  radius as borderRadius,
  spacing,
} from "@/theme/unified";
import type { DatePickerPart, DateParts } from "@/domains/inventory/hooks/scan/useFlexibleDateField";

const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const ACCENT_SOFT = "#e6f4f1";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

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
      activeOpacity={0.85}
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
  section: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    borderRadius: 20,
    backgroundColor: SURFACE_MUTED,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semiBold,
    color: TEXT_STRONG,
  },
  formatPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: spacing.xs,
    flex: 1,
  },
  formatOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: colors.white,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  formatOptionActive: {
    backgroundColor: ACCENT_SOFT,
    borderColor: ACCENT,
  },
  formatOptionText: {
    fontSize: fontSize.xs,
    color: TEXT_MUTED,
  },
  formatOptionTextActive: {
    color: ACCENT,
    fontWeight: fontWeight.medium,
  },
  inputShell: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: 18,
    padding: spacing.sm,
    backgroundColor: colors.white,
  },
  partsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  smallPicker: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.white,
  },
  smallPickerFull: {
    width: "100%",
  },
  smallPickerText: {
    fontSize: fontSize.md,
    color: TEXT_STRONG,
    fontWeight: fontWeight.medium,
  },
  placeholderText: {
    color: TEXT_MUTED,
  },
});
