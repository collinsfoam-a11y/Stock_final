import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { FlexibleDateField } from "@/components/scan/FlexibleDateField";
import ModernCard from "@/components/ui/ModernCard";
import { DateFormatType } from "@/types/scan";
import { colors, spacing } from "@/theme/unified";
import type {
  DateParts,
  DatePickerPart,
} from "@/domains/inventory/hooks/scan/useFlexibleDateField";

const SURFACE_BORDER = "#d9e5e2";
const SURFACE_CARD = "#ffffff";
const ACCENT = "#0f766e";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

interface DateFieldController {
  handleFormatChange: (format: DateFormatType) => void;
  isFull: boolean;
  isMonthYear: boolean;
  isValid: boolean;
  openPicker: (part: DatePickerPart) => void;
  parts: DateParts;
}

interface ItemDateFieldsSectionProps {
  expiryDateField: DateFieldController;
  hasExpiryDate: boolean;
  hasMfgDate: boolean;
  itemExpiryDate: string;
  itemExpiryDateFormat: DateFormatType;
  itemMfgDate: string;
  itemMfgDateFormat: DateFormatType;
  mfgDateField: DateFieldController;
  showExpiryDate: boolean;
  showMfgDate: boolean;
  toggleExpiryDateEnabled: (enabled: boolean) => void;
  toggleMfgDateEnabled: (enabled: boolean) => void;
}

export function ItemDateFieldsSection({
  expiryDateField,
  hasExpiryDate,
  hasMfgDate,
  itemExpiryDate,
  itemExpiryDateFormat,
  itemMfgDate,
  itemMfgDateFormat,
  mfgDateField,
  showExpiryDate,
  showMfgDate,
  toggleExpiryDateEnabled,
  toggleMfgDateEnabled,
}: ItemDateFieldsSectionProps) {
  if (!showMfgDate && !showExpiryDate) return null;

  return (
    <ModernCard style={styles.sectionCard} contentStyle={styles.sectionCardContent}>
      <Text style={styles.sectionKicker}>Date tracking</Text>
      <Text style={styles.sectionTitle}>Capture manufacturing and expiry details</Text>
      <Text style={styles.sectionSubtitle}>
        Enable only the fields available on the pack and choose the matching date precision.
      </Text>

      <View style={styles.fieldsStack}>
        {showMfgDate && (
          <FlexibleDateField
            label="Manufacturing Date"
            enabled={hasMfgDate}
            onToggleEnabled={toggleMfgDateEnabled}
            format={itemMfgDateFormat}
            onChangeFormat={mfgDateField.handleFormatChange}
            value={itemMfgDate}
            isValid={mfgDateField.isValid}
            isFull={mfgDateField.isFull}
            isMonthYear={mfgDateField.isMonthYear}
            parts={mfgDateField.parts}
            onOpenPicker={mfgDateField.openPicker}
            iconName="calendar-outline"
            iconColor={colors.primary[600]}
            trackColor={colors.primary[600]}
          />
        )}

        {showExpiryDate && (
          <View style={showMfgDate ? styles.dateFieldSpacing : undefined}>
            <FlexibleDateField
              label="Expiry Date"
              enabled={hasExpiryDate}
              onToggleEnabled={toggleExpiryDateEnabled}
              format={itemExpiryDateFormat}
              onChangeFormat={expiryDateField.handleFormatChange}
              value={itemExpiryDate}
              isValid={expiryDateField.isValid}
              isFull={expiryDateField.isFull}
              isMonthYear={expiryDateField.isMonthYear}
              parts={expiryDateField.parts}
              onOpenPicker={expiryDateField.openPicker}
              iconName="time-outline"
              iconColor={colors.warning[600]}
              trackColor={colors.warning[600]}
            />
          </View>
        )}
      </View>
    </ModernCard>
  );
}

const styles = StyleSheet.create({
  dateFieldSpacing: {
    marginTop: spacing.md,
  },
  fieldsStack: {
    marginTop: spacing.md,
  },
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
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    color: TEXT_MUTED,
    fontSize: 13,
    lineHeight: 20,
  },
});
