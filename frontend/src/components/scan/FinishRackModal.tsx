import React from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ModernButton } from "@/components/ui/ModernButton";
import { borderRadius, colors, spacing, typography } from "@/theme/unified";

import { useUiTokens } from "@/hooks/useUiTokens";
interface ScanStats {
  pendingItems: number;
  scannedItems: number;
  verifiedItems: number;
}

interface FinishRackModalProps {
  currentFloor?: string | null;
  currentRack?: string | null;
  isFinishing: boolean;
  onClose: () => void;
  onConfirm: () => void;
  sessionStats: ScanStats;
  visible: boolean;
}

export function FinishRackModal({
  currentFloor,
  currentRack,
  isFinishing,
  onClose,
  onConfirm,
  sessionStats,
  visible,
}: FinishRackModalProps) {
  const uiTokens = useUiTokens();
  const successWash = uiTokens.mode === "dark" ? "rgba(63, 185, 80, 0.14)" : colors.success[50];
  const summarySurface =
    uiTokens.mode === "dark" ? uiTokens.colors.surfaceElevated : colors.neutral[50];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={[
            styles.modalContent,
            {
              backgroundColor: uiTokens.colors.surface,
              borderColor: uiTokens.colors.border,
            },
          ]}
        >
          <View style={[styles.modalIconContainer, { backgroundColor: successWash }]}>
            <Ionicons name="checkmark-circle" size={36} color={uiTokens.colors.success} />
          </View>

          <Text style={[styles.modalTitle, { color: uiTokens.colors.textPrimary }]}>
            Complete Rack Scan?
          </Text>
          <Text style={[styles.modalText, { color: uiTokens.colors.textSecondary }]}>
            This will finalize the scan for {currentFloor || "this location"}{" "}
            {currentRack ? `• ${currentRack}` : ""}. You won't be able to add more items after
            confirming.
          </Text>

          <View
            style={[
              styles.modalSummary,
              {
                backgroundColor: summarySurface,
                borderColor: uiTokens.colors.border,
              },
            ]}
          >
            <View style={[styles.modalSummaryRow, { borderBottomColor: uiTokens.colors.border }]}>
              <Text style={[styles.modalSummaryLabel, { color: uiTokens.colors.textSecondary }]}>
                Items Scanned
              </Text>
              <Text style={[styles.modalSummaryValue, { color: uiTokens.colors.textPrimary }]}>
                {sessionStats.scannedItems}
              </Text>
            </View>
            <View style={[styles.modalSummaryRow, { borderBottomColor: uiTokens.colors.border }]}>
              <Text style={[styles.modalSummaryLabel, { color: uiTokens.colors.textSecondary }]}>
                Verified
              </Text>
              <Text style={[styles.modalSummaryValue, { color: uiTokens.colors.success }]}>
                {sessionStats.verifiedItems}
              </Text>
            </View>
            <View style={[styles.modalSummaryRow, { borderBottomColor: uiTokens.colors.border }]}>
              <Text style={[styles.modalSummaryLabel, { color: uiTokens.colors.textSecondary }]}>
                Pending Review
              </Text>
              <Text style={[styles.modalSummaryValue, { color: uiTokens.colors.warning }]}>
                {sessionStats.pendingItems}
              </Text>
            </View>
          </View>

          <View style={styles.modalActions}>
            <ModernButton
              title="Keep Scanning"
              onPress={onClose}
              variant="outline"
              style={{ flex: 1 }}
            />
            <ModernButton
              title="Complete"
              onPress={onConfirm}
              loading={isFinishing}
              icon="checkmark"
              style={{ flex: 1 }}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.55)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  modalIconContainer: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: "700",
    color: colors.neutral[900],
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  modalText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    marginBottom: spacing.lg,
    lineHeight: 22,
    textAlign: "center",
  },
  modalSummary: {
    backgroundColor: colors.neutral[50],
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  modalSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  modalSummaryLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    fontWeight: "500",
  },
  modalSummaryValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: "700",
    color: colors.neutral[900],
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
});
