import React, { useMemo } from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { DateFormatType } from "@/types/scan";
import { useUiTokens } from "@/hooks/useUiTokens";
import ModernCard from "@/components/ui/ModernCard";
import { colorWithAlpha } from "@/theme/themeTokens";
import {
  getAccessibleButtonProps,
  getDecorativeIconProps,
} from "@/utils/accessibility";
import type {
  DatePickerPart,
  DateParts,
} from "@/domains/inventory/hooks/scan/useFlexibleDateField";

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
  const uiTokens = useUiTokens();
  const decorativeIconProps = getDecorativeIconProps();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        fieldLabel: {
          fontSize: 12,
          fontWeight: "600",
          color: uiTokens.colors.textSecondary,
        },
        formatOption: {
          paddingHorizontal: uiTokens.spacing.sm,
          paddingVertical: uiTokens.spacing.xs,
          borderRadius: uiTokens.radius.full,
          borderWidth: 1,
          borderColor: uiTokens.colors.border,
          backgroundColor: uiTokens.colors.surface,
        },
        formatOptionActive: {
          backgroundColor: colorWithAlpha(trackColor, uiTokens.mode === "dark" ? 0.24 : 0.12),
          borderColor: trackColor,
        },
        formatOptionText: {
          fontSize: 11,
          color: uiTokens.colors.textSecondary,
        },
        formatOptionTextActive: {
          color: trackColor,
          fontWeight: "600",
        },
        formatPicker: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          gap: uiTokens.spacing.xs,
          flex: 1,
        },
        inputShell: {
          marginTop: uiTokens.spacing.sm,
          borderWidth: 1,
          borderRadius: uiTokens.radius.md,
          padding: uiTokens.spacing.sm,
          backgroundColor: uiTokens.colors.surface,
        },
        labelRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: uiTokens.spacing.md,
        },
        partsRow: {
          flexDirection: "row",
          gap: uiTokens.spacing.sm,
        },
        placeholderText: {
          color: uiTokens.colors.textMuted,
        },
        section: {
          marginTop: uiTokens.spacing.md,
        },
        smallPicker: {
          flex: 1,
          minHeight: 44,
          borderWidth: 1,
          borderColor: uiTokens.colors.border,
          borderRadius: uiTokens.radius.md,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: uiTokens.spacing.sm,
          backgroundColor: uiTokens.colors.surfaceElevated,
        },
        smallPickerFull: {
          width: "100%",
        },
        smallPickerText: {
          fontSize: 14,
          color: uiTokens.colors.textPrimary,
        },
        toggleLabel: {
          marginLeft: uiTokens.spacing.sm,
          fontSize: 14,
          fontWeight: "600",
          color: uiTokens.colors.textPrimary,
        },
        toggleLabelContainer: {
          flexDirection: "row",
          alignItems: "center",
        },
        toggleRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
      }),
    [trackColor, uiTokens]
  );

  const renderPickerButton = ({
    value: partValue,
    placeholder,
    fullWidth = false,
    onPress,
  }: {
    value: string;
    placeholder: string;
    fullWidth?: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={[styles.smallPicker, fullWidth && styles.smallPickerFull]}
       hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={onPress}
      {...getAccessibleButtonProps({
        label: `${label} ${placeholder} picker`,
        hint: `Opens the ${label.toLowerCase()} ${placeholder.toLowerCase()} selector.`,
      })}
    >
      <Text style={[styles.smallPickerText, !partValue && styles.placeholderText]}>
        {partValue || placeholder}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View>
      <ModernCard style={{ padding: uiTokens.spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={styles.toggleLabelContainer}>
          <Ionicons
            {...decorativeIconProps}
            name={iconName}
            size={20}
            color={iconColor}
          />
          <Text style={styles.toggleLabel}>Has {label}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggleEnabled}
          accessibilityRole="switch"
          accessibilityLabel={`Has ${label}`}
          accessibilityState={{ checked: enabled }}
          trackColor={{
            false: colorWithAlpha(uiTokens.colors.textMuted, uiTokens.mode === "dark" ? 0.45 : 0.3),
            true: trackColor,
          }}
          thumbColor={enabled ? uiTokens.colors.surfaceElevated : uiTokens.colors.surface}
        />
      </ModernCard>

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
                   hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={() => onChangeFormat(option.value)}
                  {...getAccessibleButtonProps({
                    label: `${label} format ${option.label}`,
                    selected: format === option.value,
                  })}
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
                borderColor: value && !isValid ? uiTokens.colors.error : uiTokens.colors.border,
              },
            ]}
          >
            {isFull ? (
              <View style={styles.partsRow}>
                {renderPickerButton({
                  value: parts.day,
                  placeholder: "DD",
                  onPress: () => onOpenPicker("day"),
                })}
                {renderPickerButton({
                  value: parts.month,
                  placeholder: "MM",
                  onPress: () => onOpenPicker("month"),
                })}
                {renderPickerButton({
                  value: parts.year,
                  placeholder: "YYYY",
                  onPress: () => onOpenPicker("year"),
                })}
              </View>
            ) : isMonthYear ? (
              <View style={styles.partsRow}>
                {renderPickerButton({
                  value: parts.month,
                  placeholder: "MM",
                  onPress: () => onOpenPicker("month"),
                })}
                {renderPickerButton({
                  value: parts.year,
                  placeholder: "YYYY",
                  onPress: () => onOpenPicker("year"),
                })}
              </View>
            ) : (
              renderPickerButton({
                value: parts.year,
                placeholder: "YYYY",
                fullWidth: true,
                onPress: () => onOpenPicker("year"),
              })
            )}
          </View>
        </View>
      )}
    </View>
  );
};
