import React, { useMemo } from "react";
import { Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { Column } from "@/components/admin/realtime-dashboard/realtimeDashboardShared";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

interface ColumnSettingsModalProps {
  columns: Column[];
  onClose: () => void;
  onResetDefaults: () => void;
  onToggle: (field: string) => void;
  visible: boolean;
}

type ColumnSettingsTokens = ReturnType<typeof useUiTokens>;

export function ColumnSettingsModal({
  columns,
  onClose,
  onResetDefaults,
  onToggle,
  visible,
}: ColumnSettingsModalProps) {
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Column Settings</Text>
            <TouchableOpacity
              {...getAccessibleButtonProps({ label: "Close column settings" })}
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={22} color={uiTokens.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSubtitle}>Toggle columns to show or hide them in the table</Text>

          <ScrollView
            style={styles.columnList}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
          >
            {columns.map((column) => (
              <View key={column.field} style={styles.columnItem}>
                <Text style={styles.columnLabel}>{column.label}</Text>
                <Switch
                  value={column.visible}
                  onValueChange={() => onToggle(column.field)}
                  trackColor={{
                    false: colorWithAlpha(uiTokens.colors.textMuted, 0.36),
                    true: colorWithAlpha(uiTokens.colors.accent, 0.36),
                  }}
                  thumbColor={column.visible ? uiTokens.colors.accent : uiTokens.colors.surface}
                  accessibilityLabel={`Show ${column.label} column`}
                  accessibilityState={{ checked: column.visible }}
                />
              </View>
            ))}
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity
              {...getAccessibleButtonProps({ label: "Reset visible columns to defaults" })}
              style={styles.resetButton}
              onPress={onResetDefaults}
            >
              <Text style={styles.resetButtonText}>Reset to Defaults</Text>
            </TouchableOpacity>
            <TouchableOpacity
              {...getAccessibleButtonProps({ label: "Apply column settings" })}
              style={styles.doneButton}
              onPress={onClose}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (uiTokens: ColumnSettingsTokens) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: uiTokens.colors.overlay,
      justifyContent: "center",
      alignItems: "center",
    },
    modalContent: {
      width: "90%",
      maxWidth: 400,
      maxHeight: "80%",
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.xl,
      padding: uiTokens.spacing.lg,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: uiTokens.spacing.md,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: uiTokens.colors.textPrimary,
    },
    closeButton: {
      ...getMinimumTouchTargetStyle(),
      alignItems: "center",
      justifyContent: "center",
    },
    modalSubtitle: {
      fontSize: 14,
      color: uiTokens.colors.textSecondary,
      marginBottom: uiTokens.spacing.lg,
    },
    columnList: {
      flex: 1,
    },
    columnItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: uiTokens.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: uiTokens.colors.border,
    },
    columnLabel: {
      fontSize: 14,
      color: uiTokens.colors.textPrimary,
    },
    modalActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: uiTokens.spacing.md,
      marginTop: uiTokens.spacing.lg,
    },
    resetButton: {
      ...getMinimumTouchTargetStyle(),
      flex: 1,
      borderRadius: uiTokens.radius.md,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: uiTokens.spacing.sm,
    },
    resetButtonText: {
      fontSize: 14,
      color: uiTokens.colors.textSecondary,
    },
    doneButton: {
      ...getMinimumTouchTargetStyle(),
      flex: 1,
      borderRadius: uiTokens.radius.md,
      backgroundColor: uiTokens.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: uiTokens.spacing.sm,
    },
    doneButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: uiTokens.colors.surface,
    },
  });
