import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import ModernInput from "@/components/ui/ModernInput";
import ModernCard from "@/components/ui/ModernCard";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";

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
  const uiTokens = useUiTokens();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          borderRadius: uiTokens.radius.full,
          borderWidth: 1,
          marginRight: uiTokens.spacing.sm,
          paddingHorizontal: uiTokens.spacing.md,
          paddingVertical: uiTokens.spacing.sm,
          backgroundColor: uiTokens.colors.surface,
          borderColor: uiTokens.colors.border,
        },
        chipActive: {
          borderColor: uiTokens.colors.accent,
          backgroundColor: colorWithAlpha(
            uiTokens.colors.accent,
            uiTokens.mode === "dark" ? 0.24 : 0.12
          ),
        },
        chipText: {
          fontSize: 13,
          color: uiTokens.colors.textSecondary,
          fontWeight: "600",
        },
        chipTextActive: {
          color: uiTokens.colors.accentStrong,
          fontWeight: "700",
        },
        chipsScroll: {
          marginTop: uiTokens.spacing.xs,
        },
        chipsContent: {
          paddingRight: uiTokens.spacing.sm,
        },
        readOnlyValue: {
          color: uiTokens.colors.textPrimary,
          fontSize: 20,
          fontWeight: "800",
        },
        section: {
          marginBottom: uiTokens.spacing.lg,
        },
        sectionHeader: {
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: uiTokens.spacing.sm,
        },
        sectionTitle: {
          fontSize: 14,
          fontWeight: "700",
          color: uiTokens.colors.textSecondary,
          letterSpacing: 0.2,
          textTransform: "uppercase",
        },
      }),
    [uiTokens]
  );

  if (!showMrp) return null;

  return (
    <View style={styles.section}>
      <ModernCard style={{ padding: uiTokens.spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: mrpVariants.length > 0 || mrpEditable ? uiTokens.spacing.sm : 0 }}>
        <Text style={styles.sectionTitle}>Price Validation (MRP)</Text>
        <Switch
          value={mrpEditable}
          onValueChange={onToggleMrpEditable}
          trackColor={{
            false: colorWithAlpha(
              uiTokens.colors.textMuted,
              uiTokens.mode === "dark" ? 0.45 : 0.28
            ),
            true: uiTokens.colors.accent,
          }}
          thumbColor={mrpEditable ? uiTokens.colors.surfaceElevated : uiTokens.colors.surface}
        />
      </ModernCard>

      {mrpVariants.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsContent}
        >
          {mrpVariants.map((variant, index) => {
            const variantKey = variant?.id || variant?.value || index;
            const isSelected = selectedMrpVariant?.value === variant.value;

            return (
              <TouchableOpacity
                key={`mrp-${variantKey}-${index}`}
                style={[styles.chip, isSelected && styles.chipActive]}
                 hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={() => onSelectMrpVariant(variant)}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
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
