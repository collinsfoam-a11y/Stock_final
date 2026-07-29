/**
 * User Management Screen
 * Admin panel for managing users - list, create, edit, delete
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Alert, RefreshControl } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { usePermission } from "../../src/hooks/usePermission";
import { UserFiltersBar } from "../../src/components/admin/users/UserFiltersBar";
import { UserFormModal } from "../../src/components/admin/users/UserFormModal";
import { UsersTable } from "../../src/components/admin/users/UsersTable";
import {
  createEmptyUserForm,
  User,
  UserFormState,
  UserListResponse,
  SortField,
  SortOrder,
  userTextStyles,
} from "../../src/components/admin/users/userManagementShared";
import { useSettingsStore } from "../../src/store/settingsStore";
import apiClient from "../../src/services/httpClient";
import { safeBackNavigation } from "@/utils/navigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { ModernCard } from "@/components/ui/ModernCard";
import { ScreenContainer } from "@/components/ui/ScreenContainer";

export default function UsersScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const { hasRole } = usePermission();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("username");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(createEmptyUserForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadUsers = useCallback(
    async (isRefresh = false) => {
      if (offlineMode) {
        if (isRefresh) {
          setRefreshing(true);
        }
        setUsers([]);
        setTotal(0);
        setTotalPages(1);
        setSelectedUsers(new Set());
        setShowUserModal(false);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const params = new URLSearchParams({
          page: page.toString(),
          page_size: pageSize.toString(),
          sort_by: sortBy,
          sort_order: sortOrder,
        });

        if (search) params.append("search", search);
        if (roleFilter) params.append("role", roleFilter);
        if (activeFilter !== null) params.append("is_active", activeFilter.toString());

        const response = await apiClient.get<UserListResponse>(`/api/users?${params.toString()}`);

        if (response.data) {
          // Normalize snake_case to camelCase
          const data = response.data as any;
          const normalizedUsers = (data.users || []).map((u: any) => ({
            id: u.id,
            username: u.username,
            email: u.email,
            fullName: u.full_name,
            role: u.role,
            isActive: u.is_active,
            createdAt: u.created_at,
            lastLogin: u.last_login,
            permissionsCount: u.permissions_count,
          }));
          setUsers(normalizedUsers);
          setTotal(data.total || 0);
          setTotalPages(data.total_pages || 1);
        }
      } catch (error: any) {
        if (!isRefresh) {
          Alert.alert("Error", error.message || "Failed to load users");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeFilter, offlineMode, page, pageSize, roleFilter, search, sortBy, sortOrder]
  );

  // Check permissions
  useEffect(() => {
    if (!hasRole("admin")) {
      Alert.alert("Access Denied", "You do not have permission to manage users.", [
        { text: "OK", onPress: () => safeBackNavigation(router, { userRole: "admin" }) },
      ]);
      return;
    }
    loadUsers();
  }, [loadUsers, hasRole, router]);

  const onRefresh = useCallback(() => {
    loadUsers(true);
  }, [loadUsers]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      const nextSelected = new Set<string>();
      for (const user of users) {
        nextSelected.add(user.id);
      }
      setSelectedUsers(nextSelected);
    }
  };

  const handleBulkAction = async (action: "activate" | "deactivate" | "delete") => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "User management actions require a live connection.");
      return;
    }

    if (selectedUsers.size === 0) {
      Alert.alert("No Selection", "Please select users first.");
      return;
    }

    const actionText = action === "delete" ? "delete" : action;
    const confirmText =
      action === "delete"
        ? `Are you sure you want to delete ${selectedUsers.size} user(s)? This cannot be undone.`
        : `Are you sure you want to ${actionText} ${selectedUsers.size} user(s)?`;

    Alert.alert(`Confirm ${actionText}`, confirmText, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        style: action === "delete" ? "destructive" : "default",
        onPress: async () => {
          try {
            await apiClient.post("/api/users/bulk", {
              user_ids: Array.from(selectedUsers),
              action,
            });
            setSelectedUsers(new Set());
            loadUsers();
            Alert.alert("Success", `Successfully ${actionText}d ${selectedUsers.size} user(s)`);
          } catch (error: any) {
            Alert.alert("Error", error.message || `Failed to ${actionText} users`);
          }
        },
      },
    ]);
  };

  const handleDeleteUser = async (user: User) => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "User deletion requires a live connection.");
      return;
    }

    Alert.alert(
      "Delete User",
      `Are you sure you want to delete "${user.username}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await apiClient.delete(`/api/users/${user.id}`);
              loadUsers();
              Alert.alert("Success", `User "${user.username}" deleted`);
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to delete user");
            }
          },
        },
      ]
    );
  };

  const handleToggleStatus = async (user: User) => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "User status changes require a live connection.");
      return;
    }

    const action = user.isActive ? "deactivate" : "activate";
    try {
      await apiClient.put(`/api/users/${user.id}`, { is_active: !user.isActive });
      loadUsers();
    } catch (error: any) {
      Alert.alert("Error", error.message || `Failed to ${action} user`);
    }
  };

  const resetUserForm = useCallback(() => {
    setUserForm(createEmptyUserForm());
    setEditingUser(null);
    setFormError(null);
  }, []);

  const openCreateModal = () => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Creating users requires a live connection.");
      return;
    }

    resetUserForm();
    setShowUserModal(true);
  };

  const openEditModal = (user: User) => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Editing users requires a live connection.");
      return;
    }

    setEditingUser(user);
    setUserForm({
      username: user.username,
      email: user.email || "",
      fullName: user.fullName || "",
      password: "",
      pin: "",
      role: user.role,
      isActive: user.isActive,
    });
    setFormError(null);
    setShowUserModal(true);
  };

  const closeUserModal = () => {
    if (submitting) return;
    setShowUserModal(false);
    resetUserForm();
  };

  const updateUserForm = <K extends keyof UserFormState>(key: K, value: UserFormState[K]) => {
    setUserForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const validateUserForm = () => {
    if (!editingUser) {
      const username = userForm.username.trim();
      if (username.length < 3) {
        return "Username must be at least 3 characters.";
      }
    }

    if (userForm.email.trim().length > 0) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(userForm.email.trim())) {
        return "Enter a valid email address.";
      }
    }

    if (!editingUser && userForm.password.trim().length < 6) {
      return "Password must be at least 6 characters.";
    }

    if (userForm.password.trim().length > 0 && userForm.password.trim().length < 6) {
      return "New password must be at least 6 characters.";
    }

    if (userForm.pin.trim().length > 0 && !/^\d{4}$/.test(userForm.pin.trim())) {
      return "PIN must be exactly 4 digits.";
    }

    return null;
  };

  const handleSubmitUser = async () => {
    if (offlineMode) {
      setFormError("User updates require a live connection.");
      return;
    }

    const validationError = validateUserForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const basePayload = {
        email: userForm.email.trim() || null,
        full_name: userForm.fullName.trim() || null,
        role: userForm.role,
      };

      if (editingUser) {
        const payload: Record<string, unknown> = {
          ...basePayload,
          is_active: userForm.isActive,
        };

        if (userForm.password.trim()) payload.password = userForm.password.trim();
        if (userForm.pin.trim()) payload.pin = userForm.pin.trim();

        await apiClient.put(`/api/users/${editingUser.id}`, payload);
      } else {
        const payload: Record<string, unknown> = {
          ...basePayload,
          username: userForm.username.trim(),
          password: userForm.password.trim(),
        };

        if (userForm.pin.trim()) payload.pin = userForm.pin.trim();

        await apiClient.post("/api/users", payload);
      }

      await loadUsers(true);
      const successMessage = editingUser
        ? `User "${editingUser.username}" updated successfully.`
        : `User "${userForm.username.trim()}" created successfully.`;

      setShowUserModal(false);
      resetUserForm();
      Alert.alert("Success", successMessage);
    } catch (error: any) {
      const detail =
        typeof error?.response?.data?.detail?.error?.message === "string"
          ? error.response.data.detail.error.message
          : error?.message || "Failed to save user";
      setFormError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && users.length === 0) {
    return (
      <ScreenContainer>
        <LoadingSpinner isVisible={true} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View
        style={styles.container}
        testID={loading ? "users-screen-loading" : "users-screen-ready"}
      >
        <UsersTable
          ListHeaderComponent={
            <>
              <View style={styles.header}>
                <View style={styles.headerTitle}>
                  <Ionicons name="people" size={28} color={uiTokens.colors.accent} />
                  <Text style={styles.title}>User Management</Text>
                </View>
                <AnimatedPressable
                  style={[styles.createButton, offlineMode && styles.disabledButton]}
                  onPress={openCreateModal}
                  disabled={offlineMode}
                  testID="users-add-button"
                  {...getAccessibleButtonProps({
                    label: "Add user",
                    disabled: offlineMode,
                  })}
                >
                  <Ionicons name="add" size={20} color={uiTokens.colors.surface} />
                  <Text style={styles.createButtonText}>Add User</Text>
                </AnimatedPressable>
              </View>

              {offlineMode && (
                <ModernCard
                  variant="outlined"
                  elevation="none"
                  padding={0}
                  style={styles.offlineNotice}
                >
                  <Text style={styles.offlineNoticeTitle}>
                    User management is unavailable offline
                  </Text>
                  <Text style={styles.offlineNoticeBody}>
                    User lists, account edits, and bulk actions require a live backend connection
                    and are not cached on this device.
                  </Text>
                </ModernCard>
              )}

              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{total}</Text>
                  <Text style={styles.statLabel}>Total Users</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{users.filter((u) => u.isActive).length}</Text>
                  <Text style={styles.statLabel}>Active</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>
                    {users.filter((u) => u.role === "admin").length}
                  </Text>
                  <Text style={styles.statLabel}>Admins</Text>
                </View>
              </View>

              {!offlineMode && (
                <UserFiltersBar
                  activeFilter={activeFilter}
                  onBulkAction={handleBulkAction}
                  onChangeActiveFilter={setActiveFilter}
                  onChangeRoleFilter={setRoleFilter}
                  onChangeSearch={setSearch}
                  roleFilter={roleFilter}
                  search={search}
                  selectedCount={selectedUsers.size}
                />
              )}
            </>
          }
          onDeleteUser={handleDeleteUser}
          onEditUser={openEditModal}
          onPageChange={setPage}
          onSort={handleSort}
          onToggleSelectAll={handleSelectAll}
          onToggleSelectUser={handleSelectUser}
          onToggleStatus={handleToggleStatus}
          page={page}
          pageSize={pageSize}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={uiTokens.colors.accent}
            />
          }
          selectedUsers={selectedUsers}
          sortBy={sortBy}
          sortOrder={sortOrder}
          total={total}
          totalPages={totalPages}
          users={offlineMode ? [] : users}
        />
      </View>
      <UserFormModal
        editingUser={editingUser}
        formError={formError}
        onChangeField={updateUserForm}
        onClose={closeUserModal}
        onSubmit={handleSubmitUser}
        submitting={submitting}
        userForm={userForm}
        visible={showUserModal}
      />
    </ScreenContainer>
  );
}

type UsersScreenTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: UsersScreenTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: uiTokens.colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: uiTokens.spacing.lg,
    paddingVertical: uiTokens.spacing.md,
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.spacing.sm,
  },
  title: {
    ...userTextStyles.h2,
    color: uiTokens.colors.textPrimary,
  },
  createButton: {
    ...getMinimumTouchTargetStyle(),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTokens.spacing.xs,
    backgroundColor: uiTokens.colors.accent,
    paddingHorizontal: uiTokens.spacing.md,
    paddingVertical: uiTokens.spacing.sm,
    borderRadius: uiTokens.radius.md,
  },
  createButtonText: {
    ...userTextStyles.label,
    color: uiTokens.colors.surface,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.5,
  },
  offlineNotice: {
    marginHorizontal: uiTokens.spacing.lg,
    marginBottom: uiTokens.spacing.lg,
    padding: uiTokens.spacing.lg,
    borderColor: colorWithAlpha(uiTokens.colors.warning, 0.28),
  },
  offlineNoticeTitle: {
    ...userTextStyles.h3,
    color: uiTokens.colors.textPrimary,
    fontSize: 16,
    marginBottom: uiTokens.spacing.xs,
  },
  offlineNoticeBody: {
    ...userTextStyles.body,
    color: uiTokens.colors.textSecondary,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: uiTokens.spacing.lg,
    gap: uiTokens.spacing.md,
    marginBottom: uiTokens.spacing.lg,
    flexWrap: "wrap",
  },
  statCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: uiTokens.colors.surface,
    padding: uiTokens.spacing.md,
    borderRadius: uiTokens.radius.lg,
    alignItems: "center",
  },
  statValue: {
    ...userTextStyles.h3,
    color: uiTokens.colors.accent,
  },
  statLabel: {
    ...userTextStyles.caption,
    color: uiTokens.colors.textSecondary,
    marginTop: uiTokens.spacing.xs,
  },
});
