import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

import ModernCard from "@/components/ui/ModernCard";
import ModernInput from "@/components/ui/ModernInput";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getDecorativeIconProps } from "@/utils/accessibility";

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
  const uiTokens = useUiTokens();
  const decorativeIconProps = getDecorativeIconProps();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        addPhotoCard: {
          alignItems: "center",
          backgroundColor: colorWithAlpha(
            uiTokens.colors.accent,
            uiTokens.mode === "dark" ? 0.2 : 0.08
          ),
          borderColor: colorWithAlpha(uiTokens.colors.accent, 0.35),
          borderRadius: uiTokens.radius.md,
          borderStyle: "dashed",
          borderWidth: 2,
          height: 80,
          justifyContent: "center",
          width: "100%",
          flexDirection: "row",
          gap: uiTokens.spacing.sm,
        },
        addPhotoSubtext: {
          color: uiTokens.colors.accentStrong,
          fontSize: 14,
          fontWeight: "600",
        },
        damageContainer: {
          backgroundColor: colorWithAlpha(
            uiTokens.colors.error,
            uiTokens.mode === "dark" ? 0.2 : 0.1
          ),
          borderColor: colorWithAlpha(uiTokens.colors.error, 0.4),
          borderRadius: uiTokens.radius.md,
          borderWidth: 1,
          marginTop: uiTokens.spacing.sm,
          padding: uiTokens.spacing.md,
        },
        damageQtyInput: {
          borderColor: colorWithAlpha(uiTokens.colors.error, 0.45),
          borderRadius: uiTokens.radius.md,
          borderWidth: 1,
          fontSize: 24,
          fontWeight: "800",
          height: 50,
          marginTop: 4,
          paddingHorizontal: uiTokens.spacing.md,
          backgroundColor: uiTokens.colors.surface,
          color: uiTokens.colors.textPrimary,
        },
        damageTypeButton: {
          alignItems: "center",
          backgroundColor: uiTokens.colors.surface,
          borderColor: colorWithAlpha(uiTokens.colors.error, 0.35),
          borderRadius: uiTokens.radius.sm,
          borderWidth: 1,
          flex: 1,
          paddingVertical: uiTokens.spacing.sm,
        },
        damageTypeContainer: {
          flexDirection: "row",
          gap: uiTokens.spacing.sm,
          marginTop: uiTokens.spacing.sm,
        },
        damageTypeSelected: {
          backgroundColor: colorWithAlpha(
            uiTokens.colors.error,
            uiTokens.mode === "dark" ? 0.28 : 0.14
          ),
          borderColor: uiTokens.colors.error,
        },
        damageTypeText: {
          color: uiTokens.colors.error,
          fontSize: 13,
          fontWeight: "600",
        },
        damageTypeTextSelected: {
          color: uiTokens.colors.error,
          fontWeight: "800",
        },
        detailLabel: {
          color: uiTokens.colors.textSecondary,
          fontSize: 12,
          marginBottom: 2,
          fontWeight: "600",
        },
        itemPhotoCard: {
          alignItems: "center",
          height: 100,
          justifyContent: "center",
          padding: uiTokens.spacing.md,
          position: "relative",
          width: 100,
          borderWidth: 1,
          borderColor: uiTokens.colors.border,
          backgroundColor: uiTokens.colors.surfaceElevated,
        },
        itemPhotoWrapper: {
          marginRight: uiTokens.spacing.sm,
        },
        itemPhotosRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: uiTokens.spacing.sm,
        },
        photoButton: {
          alignItems: "center",
          backgroundColor: uiTokens.colors.surface,
          borderColor: colorWithAlpha(uiTokens.colors.error, 0.35),
          borderRadius: uiTokens.radius.md,
          borderWidth: 1,
          flexDirection: "row",
          gap: uiTokens.spacing.sm,
          justifyContent: "center",
          marginTop: uiTokens.spacing.md,
          padding: uiTokens.spacing.md,
        },
        photoButtonSuccess: {
          backgroundColor: uiTokens.colors.success,
          borderColor: uiTokens.colors.success,
        },
        photoButtonText: {
          color: uiTokens.colors.error,
          fontSize: 13,
          fontWeight: "700",
        },
        photoContainer: {
          marginTop: uiTokens.spacing.md,
        },
        photoPreviewText: {
          color: uiTokens.colors.success,
          fontSize: 12,
          fontWeight: "600",
        },
        photoPreviewWrapper: {
          alignItems: "center",
          flexDirection: "row",
          gap: uiTokens.spacing.sm,
          marginTop: uiTokens.spacing.sm,
        },
        photoRemoveText: {
          color: uiTokens.colors.error,
          fontSize: 12,
          fontWeight: "600",
        },
        removePhotoBadge: {
          position: "absolute",
          right: 6,
          top: 6,
        },
        section: {
          marginBottom: uiTokens.spacing.lg,
        },
        sectionTitle: {
          fontSize: 14,
          fontWeight: "700",
          marginBottom: uiTokens.spacing.sm,
          color: uiTokens.colors.textPrimary,
        },
        toggleLabel: {
          fontSize: 14,
          fontWeight: "700",
          color: uiTokens.colors.textPrimary,
        },
        toggleLabelContainer: {
          alignItems: "center",
          flexDirection: "row",
          gap: uiTokens.spacing.sm,
        },
        toggleRow: {
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
        },
      }),
    [uiTokens]
  );

  return (
    <>
      <View style={styles.section}>
        <ModernCard style={{ padding: uiTokens.spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={styles.toggleLabelContainer}>
            <Ionicons
              {...decorativeIconProps}
              name="alert-circle-outline"
              size={20}
              color={uiTokens.colors.error}
            />
            <Text style={styles.toggleLabel}>Is Damaged Item</Text>
          </View>
          <Switch
            value={isDamageEnabled}
            onValueChange={onDamageToggle}
            trackColor={{
              false: colorWithAlpha(
                uiTokens.colors.textMuted,
                uiTokens.mode === "dark" ? 0.45 : 0.28
              ),
              true: uiTokens.colors.error,
            }}
            thumbColor={isDamageEnabled ? uiTokens.colors.surfaceElevated : uiTokens.colors.surface}
          />
        </ModernCard>

        {isDamageEnabled && (
          <View style={styles.damageContainer}>
            <Text style={[styles.detailLabel, { color: uiTokens.colors.error }]}>
              Select Damage Type
            </Text>

            <View style={styles.damageTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.damageTypeButton,
                  damageType === "returnable" && styles.damageTypeSelected,
                ]}
                 hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={() => onDamageTypeChange("returnable")}
              >
                <Text
                  style={[
                    styles.damageTypeText,
                    damageType === "returnable" && styles.damageTypeTextSelected,
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
                 hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={() => onDamageTypeChange("nonreturnable")}
              >
                <Text
                  style={[
                    styles.damageTypeText,
                    damageType === "nonreturnable" && styles.damageTypeTextSelected,
                  ]}
                >
                  Non-Returnable
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: uiTokens.spacing.md }}>
              <Text style={[styles.detailLabel, { color: uiTokens.colors.error }]}>
                Damage Quantity
              </Text>
              <TextInput
                style={styles.damageQtyInput}
                value={damageQty}
                onChangeText={onDamageQtyChange}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={uiTokens.colors.textMuted}
              />
            </View>

            <View style={styles.photoContainer}>
              <TouchableOpacity
                style={[styles.photoButton, damagePhoto && styles.photoButtonSuccess]}
                 hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={onTakeDamagePhoto}
              >
                <Ionicons
                  {...decorativeIconProps}
                  name={damagePhoto ? "checkmark-circle" : "camera"}
                  size={24}
                  color={damagePhoto ? uiTokens.colors.surfaceElevated : uiTokens.colors.error}
                />
                <Text
                  style={[
                    styles.photoButtonText,
                    damagePhoto && { color: uiTokens.colors.surfaceElevated },
                  ]}
                >
                  {damagePhoto ? "Update Photo" : "Capture Photo"}
                </Text>
              </TouchableOpacity>

              {damagePhoto && (
                <View style={styles.photoPreviewWrapper}>
                  <Ionicons
                    {...decorativeIconProps}
                    name="checkmark-circle"
                    size={16}
                    color={uiTokens.colors.success}
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
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Item Photos (Optional)</Text>

        {itemPhotos.length < 3 && (
          <TouchableOpacity 
            style={[styles.addPhotoCard, { marginBottom: itemPhotos.length > 0 ? uiTokens.spacing.md : 0 }]} 
             hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={onAddItemPhoto}
          >
            <Ionicons
              {...decorativeIconProps}
              name="image-outline"
              size={24}
              color={uiTokens.colors.accent}
            />
            <Text style={styles.addPhotoSubtext}>Add Photo</Text>
          </TouchableOpacity>
        )}

        {itemPhotos.length > 0 && (
          <View style={styles.itemPhotosRow}>
            {itemPhotos.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.itemPhotoWrapper}>
                <ModernCard style={styles.itemPhotoCard}>
                  <Ionicons
                    {...decorativeIconProps}
                    name="image"
                    size={32}
                    color={colorWithAlpha(uiTokens.colors.accent, 0.45)}
                  />
                  <TouchableOpacity
                    style={styles.removePhotoBadge}
                     hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={() => onRemoveItemPhoto(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove item photo ${index + 1}`}
                  >
                    <Ionicons
                      {...decorativeIconProps}
                      name="close-circle"
                      size={20}
                      color={uiTokens.colors.error}
                    />
                  </TouchableOpacity>
                </ModernCard>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <ModernInput
          value={varianceRemark}
          onChangeText={onVarianceRemarkChange}
          placeholder="Variance reason (if any)"
          label="Variance Remark"
        />
      </View>

      <View style={styles.section}>
        <ModernInput
          value={remark}
          onChangeText={onRemarkChange}
          placeholder="Add remarks (optional)"
          label="Remarks"
          multiline
          numberOfLines={3}
        />
      </View>
    </>
  );
}
