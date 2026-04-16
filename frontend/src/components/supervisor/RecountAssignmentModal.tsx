import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { SearchableSelectModal } from "../modals/SearchableSelectModal";
import { Modal } from "../ui/Modal";
import ModernInput from "../ui/ModernInput";
import { theme } from "../../styles/modernDesignSystem";

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
      defaultAssignee &&
        staffOptions.some((user) => user.username === defaultAssignee)
        ? defaultAssignee
        : undefined,
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
      <Modal
        visible={visible}
        onClose={onClose}
        title={title}
        size="medium"
        animationType="fade"
      >
        <View style={styles.content}>
          <Text style={styles.description}>{description}</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Assign To</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setPickerVisible(true)}
              activeOpacity={0.8}
              disabled={loading || staffOptions.length === 0}
            >
              <Text
                style={[
                  styles.selectorText,
                  !selectedAssignee && styles.selectorPlaceholder,
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
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                (!selectedAssignee || loading) && styles.disabledButton,
              ]}
              onPress={() => void handleSubmit()}
              disabled={!selectedAssignee || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
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
    color: theme.colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  fieldLabel: {
    color: theme.colors.text.tertiary,
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
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: theme.spacing.md,
  },
  selectorText: {
    color: theme.colors.text.primary,
    fontSize: 15,
    fontWeight: "500",
  },
  selectorPlaceholder: {
    color: theme.colors.text.tertiary,
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
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  cancelText: {
    color: theme.colors.text.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  confirmButton: {
    backgroundColor: theme.colors.warning.main,
  },
  disabledButton: {
    opacity: 0.55,
  },
  confirmText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
