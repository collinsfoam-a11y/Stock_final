import React from "react";
import { StyleSheet, View } from "react-native";

import { FlexibleDateField } from "@/components/scan/FlexibleDateField";
import { DateFormatType } from "@/types/scan";
import { colors, spacing } from "@/theme/unified";
import type {
  DateParts,
  DatePickerPart,
} from "@/domains/inventory/hooks/scan/useFlexibleDateField";

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
    <View style={styles.section}>
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
  );
}

const styles = StyleSheet.create({
  dateFieldSpacing: {
    marginTop: spacing.md,
  },
  section: {
    marginBottom: spacing.xl,
  },
});
