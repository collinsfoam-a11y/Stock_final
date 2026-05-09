import React, { useMemo } from "react";
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

import { AnimatedPressable, ModernCard } from "@/components/ui";
import {
  USER_ROLE_OPTIONS,
  User,
  UserFormState,
  userTextStyles,
} from "@/components/admin/users/userManagementShared";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

const isE2E = process.env.EXPO_PUBLIC_E2E === "true";
const isTablet = Platform.OS === "web";

interface UserFormModalProps {
  editingUser: User | null;
  formError: string | null;
  onChangeField: (key: keyof UserFormState, value: UserFormState[keyof UserFormState]) => void;
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
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
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
      <View
        style={styles.modalOverlay}
        accessibilityViewIsModal={visible}
        accessibilityLabel={title}
      >
        <ModernCard variant="outlined" elevation="none" style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalDescription}>{description}</Text>
            </View>
            <AnimatedPressable
              style={styles.modalCloseButton}
              onPress={onClose}
              testID="user-form-close"
              {...getAccessibleButtonProps({ label: "Close user form" })}
            >
              <Ionicons name="close" size={20} color={uiTokens.colors.textSecondary} />
            </AnimatedPressable>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalBody}
            showsVerticalScrollIndicator={false}
          >
            {formError && (
              <View style={styles.formErrorBanner}>
                <Ionicons name="alert-circle" size={18} color={uiTokens.colors.error} />
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
                placeholderTextColor={uiTokens.colors.textMuted}
                accessibilityLabel="Username"
              />
              {editingUser && (
                <Text style={styles.formHint}>Username is immutable after account creation.</Text>
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
                  placeholderTextColor={uiTokens.colors.textMuted}
                  accessibilityLabel="Full name"
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
                  placeholderTextColor={uiTokens.colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  accessibilityLabel="Email address"
                />
              </View>
            </View>

            <View style={styles.formGrid}>
              <View style={styles.formFieldHalf}>
                <Text style={styles.formLabel}>{editingUser ? "New Password" : "Password"}</Text>
                <TextInput
                  style={styles.formInput}
                  testID="user-form-password"
                  value={userForm.password}
                  onChangeText={(value) => onChangeField("password", value)}
                  placeholder={editingUser ? "Leave blank to keep current password" : "Required"}
                  placeholderTextColor={uiTokens.colors.textMuted}
                  secureTextEntry
                  accessibilityLabel={editingUser ? "New password" : "Password"}
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
                  placeholderTextColor={uiTokens.colors.textMuted}
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={4}
                  accessibilityLabel="4 digit PIN"
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Role</Text>
              <View style={styles.roleOptionRow}>
                {USER_ROLE_OPTIONS.map((role) => (
                  <AnimatedPressable
                    key={role}
                    style={[styles.roleOption, userForm.role === role && styles.roleOptionActive]}
                    onPress={() => onChangeField("role", role)}
                    testID={`user-form-role-${role}`}
                    {...getAccessibleButtonProps({
                      label: `Set role to ${role}`,
                      selected: userForm.role === role,
                    })}
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
                    style={[styles.roleOption, userForm.isActive && styles.roleOptionActive]}
                    onPress={() => onChangeField("isActive", true)}
                    testID="user-form-status-active"
                    {...getAccessibleButtonProps({
                      label: "Set account status active",
                      selected: userForm.isActive,
                    })}
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
                    style={[styles.roleOption, !userForm.isActive && styles.roleOptionDanger]}
                    onPress={() => onChangeField("isActive", false)}
                    testID="user-form-status-inactive"
                    {...getAccessibleButtonProps({
                      label: "Set account status inactive",
                      selected: !userForm.isActive,
                    })}
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
              {...getAccessibleButtonProps({ label: "Cancel user form", disabled: submitting })}
            >
              <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.modalPrimaryButton, submitting && styles.modalPrimaryButtonDisabled]}
              onPress={onSubmit}
              disabled={submitting}
              testID="user-form-submit"
              {...getAccessibleButtonProps({
                label: editingUser ? "Save user changes" : "Create user",
                disabled: submitting,
                busy: submitting,
              })}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={uiTokens.colors.surface} />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color={uiTokens.colors.surface} />
                  <Text style={styles.modalPrimaryButtonText}>
                    {editingUser ? "Save Changes" : "Create User"}
                  </Text>
                </>
              )}
            </AnimatedPressable>
          </View>
        </ModernCard>
      </View>
    </Modal>
  );
}

type UserFormTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: UserFormTokens) =>
  StyleSheet.create({
  modalOverlay: {
    flex: 1,
    padding: uiTokens.spacing.lg,
    backgroundColor: uiTokens.colors.overlay,
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
    padding: uiTokens.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: uiTokens.colors.border,
  },
  modalHeaderText: {
    flex: 1,
    gap: uiTokens.spacing.xs,
  },
  modalTitle: {
    ...userTextStyles.h3,
    color: uiTokens.colors.textPrimary,
  },
  modalDescription: {
    ...userTextStyles.body,
    color: uiTokens.colors.textSecondary,
  },
  modalCloseButton: {
    ...getMinimumTouchTargetStyle(),
    alignItems: "center",
    justifyContent: "center",
    padding: uiTokens.spacing.xs,
    borderRadius: uiTokens.radius.sm,
  },
  modalScroll: {
    maxHeight: 480,
  },
  modalBody: {
    padding: uiTokens.spacing.lg,
    gap: uiTokens.spacing.md,
  },
  formErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.spacing.sm,
    padding: uiTokens.spacing.sm,
    borderRadius: uiTokens.radius.md,
    backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.1),
    borderWidth: 1,
    borderColor: colorWithAlpha(uiTokens.colors.error, 0.28),
  },
  formErrorText: {
    ...userTextStyles.body,
    flex: 1,
    color: uiTokens.colors.error,
  },
  formGrid: {
    flexDirection: isTablet ? "row" : "column",
    gap: uiTokens.spacing.md,
  },
  formField: {
    gap: uiTokens.spacing.xs,
  },
  formFieldHalf: {
    flex: 1,
    gap: uiTokens.spacing.xs,
  },
  formLabel: {
    ...userTextStyles.label,
    color: uiTokens.colors.textPrimary,
  },
  formInput: {
    ...userTextStyles.body,
    color: uiTokens.colors.textPrimary,
    minHeight: 48,
    borderWidth: 1,
    borderColor: uiTokens.colors.border,
    backgroundColor: uiTokens.colors.background,
    borderRadius: uiTokens.radius.md,
    paddingHorizontal: uiTokens.spacing.md,
    paddingVertical: uiTokens.spacing.sm,
  },
  formInputDisabled: {
    backgroundColor: colorWithAlpha(uiTokens.colors.textMuted, 0.1),
    color: uiTokens.colors.textMuted,
  },
  formHint: {
    ...userTextStyles.caption,
    color: uiTokens.colors.textMuted,
  },
  roleOptionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTokens.spacing.sm,
  },
  roleOption: {
    ...getMinimumTouchTargetStyle(),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTokens.spacing.md,
    paddingVertical: uiTokens.spacing.sm,
    borderRadius: uiTokens.radius.md,
    borderWidth: 1,
    borderColor: uiTokens.colors.border,
    backgroundColor: uiTokens.colors.background,
  },
  roleOptionActive: {
    borderColor: colorWithAlpha(uiTokens.colors.accent, 0.42),
    backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.12),
  },
  roleOptionDanger: {
    borderColor: colorWithAlpha(uiTokens.colors.error, 0.42),
    backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.1),
  },
  roleOptionText: {
    ...userTextStyles.label,
    color: uiTokens.colors.textSecondary,
  },
  roleOptionTextActive: {
    color: uiTokens.colors.accentStrong,
    fontWeight: "700",
  },
  roleOptionDangerText: {
    color: uiTokens.colors.error,
    fontWeight: "700",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: uiTokens.spacing.sm,
    padding: uiTokens.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: uiTokens.colors.border,
  },
  modalSecondaryButton: {
    ...getMinimumTouchTargetStyle(),
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTokens.spacing.lg,
    paddingVertical: uiTokens.spacing.sm,
    borderRadius: uiTokens.radius.md,
    borderWidth: 1,
    borderColor: uiTokens.colors.border,
    backgroundColor: uiTokens.colors.background,
  },
  modalSecondaryButtonText: {
    ...userTextStyles.label,
    color: uiTokens.colors.textSecondary,
  },
  modalPrimaryButton: {
    ...getMinimumTouchTargetStyle(),
    minWidth: 160,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTokens.spacing.xs,
    paddingHorizontal: uiTokens.spacing.lg,
    paddingVertical: uiTokens.spacing.sm,
    borderRadius: uiTokens.radius.md,
    backgroundColor: uiTokens.colors.accent,
  },
  modalPrimaryButtonDisabled: {
    opacity: 0.7,
  },
  modalPrimaryButtonText: {
    ...userTextStyles.label,
    color: uiTokens.colors.surface,
    fontWeight: "700",
  },
});
