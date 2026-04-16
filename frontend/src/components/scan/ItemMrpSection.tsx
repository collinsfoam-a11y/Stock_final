import React from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import ModernInput from "@/components/ui/ModernInput";
import {
  colors,
  fontSize,
  fontWeight,
  radius as borderRadius,
  semanticColors,
  spacing,
} from "@/theme/unified";

type MrpVariant = Record<string, any> & {
  id?: string | number;
  value?: number;
};

interface ItemMrpSectionProps {
  mrp: string;
  mrpEditable: boolean;
  mrpVariants: MrpVariant[];
  onMrpChange: (value: string) => void;
  onSelectMrpVariant: (variant: MrpVariant) => void;
  onToggleMrpEditable: (enabled: boolean) => void;
  selectedMrpVariant: MrpVariant | null;
  showMrp: boolean;
  systemMrp?: number | null;
}

export function ItemMrpSection({
  mrp,
  mrpEditable,
  mrpVariants,
  onMrpChange,
  onSelectMrpVariant,
  onToggleMrpEditable,
  selectedMrpVariant,
  showMrp,
  systemMrp,
}: ItemMrpSectionProps) {
  if (!showMrp) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text
          style={[
            styles.sectionTitle,
            { color: semanticColors.text.primary },
          ]}
        >
          MRP
        </Text>
        <Switch
          value={mrpEditable}
          onValueChange={onToggleMrpEditable}
          trackColor={{
            false: colors.neutral[200],
            true: colors.primary[600],
          }}
        />
      </View>

      {mrpVariants.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
        >
          {mrpVariants.map((variant, index) => {
            const variantKey = variant?.id || variant?.value || index;
            const isSelected = selectedMrpVariant?.value === variant.value;

            return (
              <TouchableOpacity
                key={`mrp-${variantKey}-${index}`}
                style={[
                  styles.chip,
                  {
                    backgroundColor: semanticColors.background.paper,
                    borderColor: semanticColors.border.default,
                  },
                  isSelected && {
                    backgroundColor: colors.primary[50],
                    borderColor: colors.primary[600],
                  },
                ]}
                onPress={() => onSelectMrpVariant(variant)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: semanticColors.text.secondary },
                    isSelected && {
                      color: colors.primary[700],
                      fontWeight: fontWeight.medium,
                    },
                  ]}
                >
                  ₹{variant.value}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : mrpEditable ? (
        <ModernInput
          value={mrp}
          onChangeText={onMrpChange}
          keyboardType="numeric"
          placeholder="Enter new MRP"
          icon="pricetag"
        />
      ) : (
        <Text style={styles.readOnlyValue}>₹{mrp || systemMrp || 0}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: {
    fontSize: fontSize.sm,
  },
  chipsScroll: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  readOnlyValue: {
    color: semanticColors.text.primary,
    fontSize: 18,
    fontWeight: fontWeight.bold,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    marginBottom: spacing.sm,
  },
});
