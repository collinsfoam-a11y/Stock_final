/**
 * VarianceReasonModal Component
 * Modal for selecting variance reason when quantity differs
 */
import React from "react";
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { VarianceReason } from "@/types/scan";

import { semanticColors, colors } from "@/theme/legacyCompat";
interface VarianceReasonModalProps {
  visible: boolean;
  reasons: VarianceReason[];
  selectedReason: string | null;
  varianceNote: string;
  onReasonSelect: (reasonCode: string) => void;
  onNoteChange: (note: string) => void;
  onContinue: () => void;
}

export const VarianceReasonModal: React.FC<VarianceReasonModalProps> = ({
  visible,
  reasons,
  selectedReason,
  varianceNote,
  onReasonSelect,
  onNoteChange,
  onContinue,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Variance Reason Required</Text>
          <Text style={styles.modalSubtitle}>Please select a reason for the variance</Text>

          {reasons.map((reason) => (
            <TouchableOpacity
              key={reason.code}
              style={[styles.reasonOption, selectedReason === reason.code && styles.reasonSelected]}
              onPress={() => onReasonSelect(reason.code)}
            >
              <Text style={styles.reasonText}>{reason.label}</Text>
            </TouchableOpacity>
          ))}

          {selectedReason === "other" && (
            <TextInput
              style={styles.noteInput}
              placeholder="Enter reason"
              placeholderTextColor={semanticColors.text.tertiary}
              value={varianceNote}
              onChangeText={onNoteChange}
              multiline
            />
          )}

          <TouchableOpacity
            style={[styles.confirmButton, !selectedReason && styles.buttonDisabled]}
            onPress={onContinue}
            disabled={!selectedReason}
          >
            <Text style={styles.confirmButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.neutral[800],
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: semanticColors.text.inverse,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.neutral[400],
    marginBottom: 24,
  },
  reasonOption: {
    backgroundColor: colors.neutral[800],
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: colors.neutral[700],
  },
  reasonSelected: {
    borderColor: colors.info[500],
    backgroundColor: colors.success[900],
  },
  reasonText: {
    color: semanticColors.text.inverse,
    fontSize: 16,
  },
  noteInput: {
    backgroundColor: colors.neutral[800],
    borderRadius: 12,
    padding: 16,
    color: semanticColors.text.inverse,
    fontSize: 16,
    minHeight: 80,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.neutral[700],
  },
  confirmButton: {
    backgroundColor: colors.info[500],
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  confirmButtonText: {
    color: semanticColors.text.inverse,
    fontSize: 18,
    fontWeight: "bold",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
