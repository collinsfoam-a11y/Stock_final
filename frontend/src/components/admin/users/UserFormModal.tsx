import React from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { AnimatedPressable, GlassCard } from "@/components/ui";
import { auroraTheme } from "@/theme/auroraTheme";
import {
  USER_ROLE_OPTIONS,
  User,
  UserFormState,
  userTextStyles,
} from "@/components/admin/users/userManagementShared";

const isE2E = process.env.EXPO_PUBLIC_E2E === "true";
const isTablet = Platform.OS === "web";

interface UserFormModalProps {
  editingUser: User | null;
  formError: string | null;
  onChangeField: (
    key: keyof UserFormState,
    value: UserFormState[keyof UserFormState],
  ) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  userForm: UserFormState;
  visible: boolean;
}

export function UserFormModal({
  editingUser,
  formError,
  onChangeField,
  onClose,
  onSubmit,
  submitting,
  userForm,
  visible,
}: UserFormModalProps) {
  const title = editingUser ? "Edit User" : "Create User";
  const description = editingUser
    ? "Update role, access, and credentials for this account."
    : "Add a new account with the correct role and optional PIN.";

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType={isE2E ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <GlassCard variant="strong" style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalDescription}>{description}</Text>
            </View>
            <AnimatedPressable
              style={styles.modalCloseButton}
              onPress={onClose}
              testID="user-form-close"
            >
              <Ionicons
                name="close"
                size={20}
                color={auroraTheme.colors.text.secondary}
              />
            </AnimatedPressable>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalBody}
            showsVerticalScrollIndicator={false}
          >
            {formError && (
              <View style={styles.formErrorBanner}>
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color={auroraTheme.colors.error[600]}
                />
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            )}

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Username</Text>
              <TextInput
                style={[styles.formInput, editingUser && styles.formInputDisabled]}
                testID="user-form-username"
                value={userForm.username}
                onChangeText={(value) => onChangeField("username", value)}
                editable={!editingUser}
                autoCapitalize="none"
                placeholder="Enter username"
                placeholderTextColor={auroraTheme.colors.neutral[400]}
              />
              {editingUser && (
                <Text style={styles.formHint}>
                  Username is immutable after account creation.
                </Text>
              )}
            </View>

            <View style={styles.formGrid}>
              <View style={styles.formFieldHalf}>
                <Text style={styles.formLabel}>Full Name</Text>
                <TextInput
                  style={styles.formInput}
                  testID="user-form-full-name"
                  value={userForm.fullName}
                  onChangeText={(value) => onChangeField("fullName", value)}
                  placeholder="Optional"
                  placeholderTextColor={auroraTheme.colors.neutral[400]}
                />
              </View>
              <View style={styles.formFieldHalf}>
                <Text style={styles.formLabel}>Email</Text>
                <TextInput
                  style={styles.formInput}
                  testID="user-form-email"
                  value={userForm.email}
                  onChangeText={(value) => onChangeField("email", value)}
                  placeholder="Optional"
                  placeholderTextColor={auroraTheme.colors.neutral[400]}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.formGrid}>
              <View style={styles.formFieldHalf}>
                <Text style={styles.formLabel}>
                  {editingUser ? "New Password" : "Password"}
                </Text>
                <TextInput
                  style={styles.formInput}
                  testID="user-form-password"
                  value={userForm.password}
                  onChangeText={(value) => onChangeField("password", value)}
                  placeholder={
                    editingUser ? "Leave blank to keep current password" : "Required"
                  }
                  placeholderTextColor={auroraTheme.colors.neutral[400]}
                  secureTextEntry
                />
              </View>
              <View style={styles.formFieldHalf}>
                <Text style={styles.formLabel}>4-Digit PIN</Text>
                <TextInput
                  style={styles.formInput}
                  testID="user-form-pin"
                  value={userForm.pin}
                  onChangeText={(value) => onChangeField("pin", value)}
                  placeholder="Optional"
                  placeholderTextColor={auroraTheme.colors.neutral[400]}
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Role</Text>
              <View style={styles.roleOptionRow}>
                {USER_ROLE_OPTIONS.map((role) => (
                  <AnimatedPressable
                    key={role}
                    style={[
                      styles.roleOption,
                      userForm.role === role && styles.roleOptionActive,
                    ]}
                    onPress={() => onChangeField("role", role)}
                    testID={`user-form-role-${role}`}
                  >
                    <Text
                      style={[
                        styles.roleOptionText,
                        userForm.role === role && styles.roleOptionTextActive,
                      ]}
                    >
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>

            {editingUser && (
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Account Status</Text>
                <View style={styles.roleOptionRow}>
                  <AnimatedPressable
                    style={[
                      styles.roleOption,
                      userForm.isActive && styles.roleOptionActive,
                    ]}
                    onPress={() => onChangeField("isActive", true)}
                    testID="user-form-status-active"
                  >
                    <Text
                      style={[
                        styles.roleOptionText,
                        userForm.isActive && styles.roleOptionTextActive,
                      ]}
                    >
                      Active
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={[
                      styles.roleOption,
                      !userForm.isActive && styles.roleOptionDanger,
                    ]}
                    onPress={() => onChangeField("isActive", false)}
                    testID="user-form-status-inactive"
                  >
                    <Text
                      style={[
                        styles.roleOptionText,
                        !userForm.isActive && styles.roleOptionDangerText,
                      ]}
                    >
                      Inactive
                    </Text>
                  </AnimatedPressable>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <AnimatedPressable
              style={styles.modalSecondaryButton}
              onPress={onClose}
              disabled={submitting}
              testID="user-form-cancel"
            >
              <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[
                styles.modalPrimaryButton,
                submitting && styles.modalPrimaryButtonDisabled,
              ]}
              onPress={onSubmit}
              disabled={submitting}
              testID="user-form-submit"
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.modalPrimaryButtonText}>
                    {editingUser ? "Save Changes" : "Create User"}
                  </Text>
                </>
              )}
            </AnimatedPressable>
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    padding: auroraTheme.spacing.lg,
    backgroundColor: "rgba(8, 13, 28, 0.72)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    width: "100%",
    maxWidth: 720,
    maxHeight: "92%",
    padding: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: auroraTheme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.light,
  },
  modalHeaderText: {
    flex: 1,
    gap: auroraTheme.spacing.xs,
  },
  modalTitle: {
    ...userTextStyles.h3,
    color: auroraTheme.colors.text.primary,
  },
  modalDescription: {
    ...userTextStyles.body,
    color: auroraTheme.colors.text.secondary,
  },
  modalCloseButton: {
    padding: auroraTheme.spacing.xs,
    borderRadius: auroraTheme.borderRadius.sm,
  },
  modalScroll: {
    maxHeight: 480,
  },
  modalBody: {
    padding: auroraTheme.spacing.lg,
    gap: auroraTheme.spacing.md,
  },
  formErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: auroraTheme.spacing.sm,
    padding: auroraTheme.spacing.sm,
    borderRadius: auroraTheme.borderRadius.md,
    backgroundColor: auroraTheme.colors.error[50],
    borderWidth: 1,
    borderColor: auroraTheme.colors.error[200],
  },
  formErrorText: {
    ...userTextStyles.body,
    flex: 1,
    color: auroraTheme.colors.error[700],
  },
  formGrid: {
    flexDirection: isTablet ? "row" : "column",
    gap: auroraTheme.spacing.md,
  },
  formField: {
    gap: auroraTheme.spacing.xs,
  },
  formFieldHalf: {
    flex: 1,
    gap: auroraTheme.spacing.xs,
  },
  formLabel: {
    ...userTextStyles.label,
    color: auroraTheme.colors.text.primary,
  },
  formInput: {
    ...userTextStyles.body,
    color: auroraTheme.colors.text.primary,
    minHeight: 48,
    borderWidth: 1,
    borderColor: auroraTheme.colors.neutral[200],
    backgroundColor: auroraTheme.colors.background.primary,
    borderRadius: auroraTheme.borderRadius.md,
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: auroraTheme.spacing.sm,
  },
  formInputDisabled: {
    backgroundColor: auroraTheme.colors.neutral[100],
    color: auroraTheme.colors.text.tertiary,
  },
  formHint: {
    ...userTextStyles.caption,
    color: auroraTheme.colors.text.tertiary,
  },
  roleOptionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: auroraTheme.spacing.sm,
  },
  roleOption: {
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: auroraTheme.spacing.sm,
    borderRadius: auroraTheme.borderRadius.md,
    borderWidth: 1,
    borderColor: auroraTheme.colors.neutral[200],
    backgroundColor: auroraTheme.colors.background.primary,
  },
  roleOptionActive: {
    borderColor: auroraTheme.colors.primary[300],
    backgroundColor: auroraTheme.colors.primary[100],
  },
  roleOptionDanger: {
    borderColor: auroraTheme.colors.error[300],
    backgroundColor: auroraTheme.colors.error[50],
  },
  roleOptionText: {
    ...userTextStyles.label,
    color: auroraTheme.colors.text.secondary,
  },
  roleOptionTextActive: {
    color: auroraTheme.colors.primary[700],
    fontWeight: "700",
  },
  roleOptionDangerText: {
    color: auroraTheme.colors.error[700],
    fontWeight: "700",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: auroraTheme.spacing.sm,
    padding: auroraTheme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: auroraTheme.colors.border.light,
  },
  modalSecondaryButton: {
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: auroraTheme.spacing.lg,
    paddingVertical: auroraTheme.spacing.sm,
    borderRadius: auroraTheme.borderRadius.md,
    borderWidth: 1,
    borderColor: auroraTheme.colors.neutral[200],
    backgroundColor: auroraTheme.colors.background.primary,
  },
  modalSecondaryButtonText: {
    ...userTextStyles.label,
    color: auroraTheme.colors.text.secondary,
  },
  modalPrimaryButton: {
    minWidth: 160,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: auroraTheme.spacing.xs,
    paddingHorizontal: auroraTheme.spacing.lg,
    paddingVertical: auroraTheme.spacing.sm,
    borderRadius: auroraTheme.borderRadius.md,
    backgroundColor: auroraTheme.colors.primary[600],
  },
  modalPrimaryButtonDisabled: {
    opacity: 0.7,
  },
  modalPrimaryButtonText: {
    ...userTextStyles.label,
    color: "#fff",
    fontWeight: "700",
  },
});
