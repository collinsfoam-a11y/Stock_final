import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { auroraTheme } from "@/theme/auroraTheme";
import { Column } from "@/components/admin/realtime-dashboard/realtimeDashboardShared";

interface ColumnSettingsModalProps {
  columns: Column[];
  onClose: () => void;
  onResetDefaults: () => void;
  onToggle: (field: string) => void;
  visible: boolean;
}

export function ColumnSettingsModal({
  columns,
  onClose,
  onResetDefaults,
  onToggle,
  visible,
}: ColumnSettingsModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Column Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons
                name="close"
                size={24}
                color={auroraTheme.colors.text.primary}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSubtitle}>
            Toggle columns to show or hide them in the table
          </Text>

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
                    false: "#767577",
                    true: auroraTheme.colors.primary[300],
                  }}
                  thumbColor={
                    column.visible ? auroraTheme.colors.primary[500] : "#f4f3f4"
                  }
                />
              </View>
            ))}
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={onResetDefaults}
            >
              <Text style={styles.resetButtonText}>Reset to Defaults</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneButton} onPress={onClose}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
    backgroundColor: auroraTheme.colors.surface.base,
    borderRadius: auroraTheme.borderRadius.xl,
    padding: auroraTheme.spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: auroraTheme.spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: auroraTheme.colors.text.primary,
  },
  modalSubtitle: {
    fontSize: 14,
    color: auroraTheme.colors.text.secondary,
    marginBottom: auroraTheme.spacing.lg,
  },
  columnList: {
    flex: 1,
  },
  columnItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: auroraTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.subtle,
  },
  columnLabel: {
    fontSize: 14,
    color: auroraTheme.colors.text.primary,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: auroraTheme.spacing.md,
    marginTop: auroraTheme.spacing.lg,
  },
  resetButton: {
    flex: 1,
    paddingVertical: auroraTheme.spacing.md,
    borderRadius: auroraTheme.borderRadius.md,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.subtle,
    alignItems: "center",
  },
  resetButtonText: {
    fontSize: 14,
    color: auroraTheme.colors.text.secondary,
  },
  doneButton: {
    flex: 1,
    paddingVertical: auroraTheme.spacing.md,
    borderRadius: auroraTheme.borderRadius.md,
    backgroundColor: auroraTheme.colors.primary[500],
    alignItems: "center",
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
