import React from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import ModernCard from "@/components/ui/ModernCard";
import ModernInput from "@/components/ui/ModernInput";
import {
  colors,
  fontSize,
  fontWeight,
  spacing,
} from "@/theme/unified";

const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const ACCENT_SOFT = "#e6f4f1";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

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
    <ModernCard style={styles.sectionCard} contentStyle={styles.sectionCardContent}>
      <Text style={styles.sectionKicker}>Pricing</Text>
      <Text style={styles.sectionHeading}>Verify the active MRP</Text>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleWrap}>
          <Text style={styles.sectionTitle}>MRP</Text>
          <Text style={styles.sectionSubtitle}>
            Use the system value or unlock manual entry if the pack differs.
          </Text>
        </View>
        <Switch
          value={mrpEditable}
          onValueChange={onToggleMrpEditable}
          trackColor={{
            false: colors.neutral[200],
            true: ACCENT,
          }}
          thumbColor={mrpEditable ? colors.white : colors.neutral[50]}
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
                  isSelected && {
                    backgroundColor: ACCENT_SOFT,
                    borderColor: ACCENT,
                  },
                ]}
                onPress={() => onSelectMrpVariant(variant)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.chipText,
                    isSelected && {
                      color: ACCENT,
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
          containerStyle={styles.mrpInputContainer}
        />
      ) : (
        <View style={styles.readOnlyValueCard}>
          <Text style={styles.readOnlyLabel}>System MRP</Text>
          <Text style={styles.readOnlyValue}>₹{mrp || systemMrp || 0}</Text>
        </View>
      )}
    </ModernCard>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    marginRight: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: TEXT_MUTED,
  },
  chipsScroll: {
    marginTop: spacing.sm,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  mrpInputContainer: {
    marginTop: spacing.sm,
    marginBottom: 0,
  },
  readOnlyLabel: {
    color: TEXT_MUTED,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  readOnlyValue: {
    color: TEXT_STRONG,
    fontSize: 28,
    fontWeight: "700",
  },
  readOnlyValueCard: {
    marginTop: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_MUTED,
    padding: spacing.md,
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
  sectionHeading: {
    color: TEXT_STRONG,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  sectionKicker: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    color: TEXT_MUTED,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  sectionTitleWrap: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: TEXT_STRONG,
    marginBottom: 2,
  },
});
