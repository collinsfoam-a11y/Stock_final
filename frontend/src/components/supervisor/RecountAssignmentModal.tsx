import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { SearchableSelectModal } from "../modals/SearchableSelectModal";
import { Modal } from "../ui/Modal";
import ModernInput from "../ui/ModernInput";
import { theme } from "../../styles/unifiedSystem";
import { useUiTokens } from "@/hooks/useUiTokens";

import { semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
export interface AssignableStaffUser {
  username: string;
  full_name?: string | null;
}

interface RecountAssignmentModalProps {
  visible: boolean;
  loading?: boolean;
  staffOptions: AssignableStaffUser[];
  defaultAssignee?: string | null;
  title?: string;
  description?: string;
  onClose: () => void;
  onSubmit: (payload: { notes: string; assignTo?: string }) => Promise<void> | void;
}

const formatStaffLabel = (user: AssignableStaffUser) => {
  if (user.full_name && user.full_name.trim()) {
    return `${user.full_name} (${user.username})`;
  }
  return user.username;
};

export default function RecountAssignmentModal({
  visible,
  loading = false,
  staffOptions,
  defaultAssignee,
  title = "Request Recount",
  description = "Assign this recount to a staff member and add optional instructions.",
  onClose,
  onSubmit,
}: RecountAssignmentModalProps) {
  const uiTokens = useUiTokens();
  const [notes, setNotes] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState<string | undefined>();
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPickerVisible(false);
      return;
    }
    setNotes("");
    setSelectedAssignee(
      defaultAssignee && staffOptions.some((user) => user.username === defaultAssignee)
        ? defaultAssignee
        : undefined
    );
  }, [defaultAssignee, staffOptions, visible]);

  const labelByUsername = useMemo(() => {
    return new Map(staffOptions.map((user) => [user.username, formatStaffLabel(user)]));
  }, [staffOptions]);

  const usernameByLabel = useMemo(() => {
    return new Map(staffOptions.map((user) => [formatStaffLabel(user), user.username]));
  }, [staffOptions]);

  const selectedLabel =
    (selectedAssignee && labelByUsername.get(selectedAssignee)) || "Choose assignee";

  const handleSubmit = async () => {
    await onSubmit({
      notes: notes.trim(),
      assignTo: selectedAssignee,
    });
  };

  return (
    <>
      <Modal visible={visible} onClose={onClose} title={title} size="medium" animationType="fade">
        <View style={styles.content}>
          <Text style={[styles.description, { color: uiTokens.colors.textSecondary }]}>
            {description}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: uiTokens.colors.textMuted }]}>Assign To</Text>
            <TouchableOpacity
              style={[
                styles.selector,
                { borderColor: uiTokens.colors.border, backgroundColor: uiTokens.colors.surface },
              ]}
              onPress={() => setPickerVisible(true)}
              activeOpacity={0.8}
              disabled={loading || staffOptions.length === 0}
            >
              <Text
                style={[
                  styles.selectorText,
                  {
                    color: selectedAssignee
                      ? uiTokens.colors.textPrimary
                      : uiTokens.colors.textMuted,
                  },
                ]}
              >
                {staffOptions.length === 0 ? "No active staff available" : selectedLabel}
              </Text>
            </TouchableOpacity>
          </View>

          <ModernInput
            label="Instructions"
            placeholder="Add recount instructions"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            autoCapitalize="sentences"
            returnKeyType="done"
            containerStyle={styles.notesInput}
          />

          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.cancelButton,
                { borderColor: uiTokens.colors.border, backgroundColor: uiTokens.colors.surface },
              ]}
              onPress={onClose}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={[styles.cancelText, { color: uiTokens.colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                { backgroundColor: uiTokens.colors.warning },
                (!selectedAssignee || loading) && styles.disabledButton,
              ]}
              onPress={() => void handleSubmit()}
              disabled={!selectedAssignee || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={uiSemanticColors.text.inverse} />
              ) : (
                <Text style={styles.confirmText}>Assign Recount</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SearchableSelectModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(label) => {
          const username = usernameByLabel.get(label);
          if (username) {
            setSelectedAssignee(username);
          }
        }}
        options={staffOptions.map(formatStaffLabel)}
        title="Select Staff Assignee"
        placeholder="Search staff"
        testID="recount-assignee-picker"
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.md,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  selector: {
    minHeight: 48,
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
  },
  selectorText: {
    fontSize: 15,
    fontWeight: "500",
  },
  notesInput: {
    marginBottom: theme.spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  button: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
  confirmButton: {},
  disabledButton: {
    opacity: 0.55,
  },
  confirmText: {
    color: uiSemanticColors.text.inverse,
    fontSize: 15,
    fontWeight: "700",
  },
});
