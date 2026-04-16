import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import ModernButton from "@/components/ui/ModernButton";
import {
  borderRadius,
  colors,
  shadows,
  spacing,
  typography,
} from "@/theme/modernDesign";

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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={styles.modalContent}
        >
          <View style={styles.modalIconContainer}>
            <Ionicons
              name="checkmark-circle"
              size={48}
              color={colors.success[500]}
            />
          </View>

          <Text style={styles.modalTitle}>Complete Rack Scan?</Text>
          <Text style={styles.modalText}>
            This will finalize the scan for {currentFloor || "this location"}{" "}
            {currentRack ? `• ${currentRack}` : ""}. You won't be able to add
            more items after confirming.
          </Text>

          <View style={styles.modalSummary}>
            <View style={styles.modalSummaryRow}>
              <Text style={styles.modalSummaryLabel}>Items Scanned</Text>
              <Text style={styles.modalSummaryValue}>
                {sessionStats.scannedItems}
              </Text>
            </View>
            <View style={styles.modalSummaryRow}>
              <Text style={styles.modalSummaryLabel}>Verified</Text>
              <Text style={[styles.modalSummaryValue, { color: colors.success[600] }]}>
                {sessionStats.verifiedItems}
              </Text>
            </View>
            <View style={styles.modalSummaryRow}>
              <Text style={styles.modalSummaryLabel}>Pending Review</Text>
              <Text style={[styles.modalSummaryValue, { color: colors.warning[600] }]}>
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
            <View style={{ width: spacing.md }} />
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
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius["2xl"],
    padding: spacing.xl,
    ...shadows.xl,
  },
  modalIconContainer: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: typography.fontSize["2xl"],
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  modalText: {
    fontSize: typography.fontSize.base,
    color: colors.gray[600],
    marginBottom: spacing.xl,
    lineHeight: 24,
    textAlign: "center",
  },
  modalSummary: {
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  modalSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  modalSummaryLabel: {
    fontSize: typography.fontSize.base,
    color: colors.gray[600],
    fontWeight: "500",
  },
  modalSummaryValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: "700",
    color: colors.gray[900],
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
});
