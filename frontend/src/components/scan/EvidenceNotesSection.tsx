import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

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
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

type DamageType = "returnable" | "nonreturnable";

interface EvidenceNotesSectionProps {
  damagePhoto: string | null;
  damageQty: string;
  damageType: DamageType;
  isDamageEnabled: boolean;
  itemPhotos: string[];
  remark: string;
  varianceRemark: string;
  onAddItemPhoto: () => void;
  onDamageQtyChange: (value: string) => void;
  onDamageToggle: (enabled: boolean) => void;
  onDamageTypeChange: (type: DamageType) => void;
  onRemarkChange: (value: string) => void;
  onRemoveDamagePhoto: () => void;
  onRemoveItemPhoto: (index: number) => void;
  onTakeDamagePhoto: () => void;
  onVarianceRemarkChange: (value: string) => void;
}

export function EvidenceNotesSection({
  damagePhoto,
  damageQty,
  damageType,
  isDamageEnabled,
  itemPhotos,
  remark,
  varianceRemark,
  onAddItemPhoto,
  onDamageQtyChange,
  onDamageToggle,
  onDamageTypeChange,
  onRemarkChange,
  onRemoveDamagePhoto,
  onRemoveItemPhoto,
  onTakeDamagePhoto,
  onVarianceRemarkChange,
}: EvidenceNotesSectionProps) {
  return (
    <>
      <ModernCard style={styles.sectionCard} contentStyle={styles.sectionCardContent}>
        <Text style={styles.sectionKicker}>Evidence</Text>
        <Text style={styles.sectionHeading}>Damage and proof collection</Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelContainer}>
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color={colors.error[600]}
            />
            <Text style={styles.toggleLabel}>Is Damaged Item</Text>
          </View>
          <Switch
            value={isDamageEnabled}
            onValueChange={onDamageToggle}
            trackColor={{
              false: colors.neutral[200],
              true: colors.error[500],
            }}
            thumbColor={isDamageEnabled ? colors.white : colors.neutral[50]}
          />
        </View>

        {isDamageEnabled && (
          <View style={styles.damageContainer}>
            <Text style={styles.damageHeader}>Select Damage Type</Text>

            <View style={styles.damageTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.damageTypeButton,
                  damageType === "returnable" && styles.damageTypeSelected,
                ]}
                onPress={() => onDamageTypeChange("returnable")}
              >
                <Text
                  style={[
                    styles.damageTypeText,
                    damageType === "returnable" &&
                      styles.damageTypeTextSelected,
                  ]}
                >
                  Returnable
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.damageTypeButton,
                  damageType === "nonreturnable" && styles.damageTypeSelected,
                ]}
                onPress={() => onDamageTypeChange("nonreturnable")}
              >
                <Text
                  style={[
                    styles.damageTypeText,
                    damageType === "nonreturnable" &&
                      styles.damageTypeTextSelected,
                  ]}
                >
                  Non-Returnable
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: spacing.md }}>
              <Text style={[styles.detailLabel, { color: colors.error[700] }]}>
                Damage Quantity
              </Text>
              <TextInput
                style={[
                  styles.damageQtyInput,
                  {
                    color: TEXT_STRONG,
                  },
                ]}
                value={damageQty}
                onChangeText={onDamageQtyChange}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={TEXT_MUTED}
              />
            </View>

            <View style={styles.photoContainer}>
              <TouchableOpacity
                style={[
                  styles.photoButton,
                  damagePhoto && styles.photoButtonSuccess,
                ]}
                onPress={onTakeDamagePhoto}
              >
                <Ionicons
                  name={damagePhoto ? "checkmark-circle" : "camera"}
                  size={24}
                  color={damagePhoto ? colors.white : colors.error[600]}
                />
                <Text
                  style={[
                    styles.photoButtonText,
                    damagePhoto && { color: colors.white },
                  ]}
                >
                  {damagePhoto ? "Update Photo" : "Capture Photo"}
                </Text>
              </TouchableOpacity>

              {damagePhoto && (
                <View style={styles.photoPreviewWrapper}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={colors.success[600]}
                  />
                  <Text style={styles.photoPreviewText}>Photo captured</Text>
                  <TouchableOpacity onPress={onRemoveDamagePhoto}>
                    <Text style={styles.photoRemoveText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}
      </ModernCard>

      <ModernCard style={styles.sectionCard} contentStyle={styles.sectionCardContent}>
        <Text style={styles.sectionKicker}>Photos</Text>
        <Text style={styles.sectionTitle}>Item Photos (Optional)</Text>
        <Text style={styles.sectionSubtitle}>
          Capture additional pack evidence when labels, dates, or damage need visual proof.
        </Text>

        <View style={styles.itemPhotosRow}>
          {itemPhotos.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.itemPhotoWrapper}>
              <ModernCard style={styles.itemPhotoCard}>
                <Ionicons
                  name="image"
                  size={32}
                  color={colors.primary[200]}
                />
                <TouchableOpacity
                  style={styles.removePhotoBadge}
                  onPress={() => onRemoveItemPhoto(index)}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={colors.error[600]}
                  />
                </TouchableOpacity>
              </ModernCard>
            </View>
          ))}

          {itemPhotos.length < 3 && (
            <TouchableOpacity style={styles.addPhotoCard} onPress={onAddItemPhoto}>
              <Ionicons
                name="add-circle-outline"
                size={32}
                color={ACCENT}
              />
              <Text style={styles.addPhotoSubtext}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </ModernCard>

      <ModernCard style={styles.sectionCard} contentStyle={styles.sectionCardContent}>
        <Text style={styles.sectionKicker}>Notes</Text>
        <Text style={styles.sectionTitle}>Variance remark</Text>
        <ModernInput
          value={varianceRemark}
          onChangeText={onVarianceRemarkChange}
          placeholder="Variance reason (if any)"
          label="Variance Remark"
          containerStyle={styles.inputContainer}
        />
      </ModernCard>

      <ModernCard style={styles.sectionCard} contentStyle={styles.sectionCardContent}>
        <Text style={styles.sectionKicker}>Notes</Text>
        <Text style={styles.sectionTitle}>Operator remarks</Text>
        <ModernInput
          value={remark}
          onChangeText={onRemarkChange}
          placeholder="Add remarks (optional)"
          label="Remarks"
          multiline
          numberOfLines={3}
          containerStyle={styles.inputContainer}
        />
      </ModernCard>
    </>
  );
}

const styles = StyleSheet.create({
  addPhotoCard: {
    alignItems: "center",
    backgroundColor: SURFACE_MUTED,
    borderColor: SURFACE_BORDER,
    borderRadius: 18,
    borderStyle: "dashed",
    borderWidth: 2,
    height: 100,
    justifyContent: "center",
    width: 100,
  },
  addPhotoSubtext: {
    color: ACCENT,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginTop: 4,
  },
  damageContainer: {
    backgroundColor: colors.error[50],
    borderColor: colors.error[200],
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 20,
  },
  damageHeader: {
    color: colors.error[700],
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  damageQtyInput: {
    borderColor: colors.error[200],
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 24,
    fontWeight: fontWeight.bold,
    height: 56,
    marginTop: 4,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
  },
  damageTypeButton: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.error[200],
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    paddingVertical: spacing.md,
  },
  damageTypeContainer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  damageTypeSelected: {
    backgroundColor: colors.error[100],
    borderColor: colors.error[500],
  },
  damageTypeText: {
    color: colors.error[700],
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  damageTypeTextSelected: {
    color: colors.error[800],
    fontWeight: fontWeight.bold,
  },
  detailLabel: {
    color: colors.neutral[500],
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: 4,
  },
  inputContainer: {
    marginBottom: 0,
  },
  itemPhotoCard: {
    alignItems: "center",
    height: 100,
    justifyContent: "center",
    padding: spacing.md,
    position: "relative",
    width: 100,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_MUTED,
  },
  itemPhotoWrapper: {
    marginRight: spacing.sm,
  },
  itemPhotosRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  photoButton: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.error[300],
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    padding: spacing.md,
  },
  photoButtonSuccess: {
    backgroundColor: colors.success[600],
    borderColor: colors.success[600],
  },
  photoButtonText: {
    color: colors.error[700],
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  photoContainer: {
    marginTop: spacing.md,
  },
  photoPreviewText: {
    color: colors.success[700],
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  photoPreviewWrapper: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  photoRemoveText: {
    color: colors.error[600],
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  removePhotoBadge: {
    position: "absolute",
    right: 6,
    top: 6,
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
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: TEXT_STRONG,
    marginBottom: spacing.sm,
  },
  toggleLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: TEXT_STRONG,
  },
  toggleLabelContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  toggleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
  },
});
