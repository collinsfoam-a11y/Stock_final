import React from "react";
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { AnimatedPressable } from "@/components/ui";
import { auroraTheme } from "@/theme/auroraTheme";
import {
  getRoleBadgeStyle,
  getStatusStyle,
  SortField,
  SortOrder,
  User,
  userTextStyles,
} from "@/components/admin/users/userManagementShared";

const { width } = Dimensions.get("window");
const isWeb = Platform.OS === "web";
const isTablet = width > 768;

interface UsersTableProps {
  onDeleteUser: (user: User) => void;
  onEditUser: (user: User) => void;
  onPageChange: (page: number) => void;
  onSort: (field: SortField) => void;
  onToggleSelectAll: () => void;
  onToggleSelectUser: (userId: string) => void;
  onToggleStatus: (user: User) => void;
  page: number;
  pageSize: number;
  selectedUsers: Set<string>;
  sortBy: SortField;
  sortOrder: SortOrder;
  total: number;
  totalPages: number;
  users: User[];
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString();
};

export function UsersTable({
  onDeleteUser,
  onEditUser,
  onPageChange,
  onSort,
  onToggleSelectAll,
  onToggleSelectUser,
  onToggleStatus,
  page,
  pageSize,
  selectedUsers,
  sortBy,
  sortOrder,
  total,
  totalPages,
  users,
}: UsersTableProps) {
  const showTableLayout = isWeb || isTablet;

  return (
    <>
      <View style={styles.tableContainer} testID="users-table">
        {showTableLayout ? (
          <>
            <View style={styles.tableHeader}>
              <AnimatedPressable style={styles.checkboxCell} onPress={onToggleSelectAll}>
                <Ionicons
                  name={
                    selectedUsers.size === users.length && users.length > 0
                      ? "checkbox"
                      : "square-outline"
                  }
                  size={20}
                  color={auroraTheme.colors.primary[600]}
                />
              </AnimatedPressable>
              <SortableHeader
                active={sortBy === "username"}
                cellStyle={styles.usernameCell}
                label="Username"
                onPress={() => onSort("username")}
                sortOrder={sortOrder}
              />
              <SortableHeader
                active={sortBy === "email"}
                cellStyle={styles.emailCell}
                label="Email"
                onPress={() => onSort("email")}
                sortOrder={sortOrder}
              />
              <SortableHeader
                active={sortBy === "role"}
                cellStyle={styles.roleCell}
                label="Role"
                onPress={() => onSort("role")}
                sortOrder={sortOrder}
              />
              <View style={[styles.headerCell, styles.statusCell]}>
                <Text style={styles.headerText}>Status</Text>
              </View>
              <SortableHeader
                active={sortBy === "created_at"}
                cellStyle={styles.dateCell}
                label="Created"
                onPress={() => onSort("created_at")}
                sortOrder={sortOrder}
              />
              <View style={[styles.headerCell, styles.actionsCell]}>
                <Text style={styles.headerText}>Actions</Text>
              </View>
            </View>

            {users.length === 0 ? (
              <EmptyUsersState />
            ) : (
              users.map((user) => (
                <DesktopUserRow
                  key={user.id}
                  onDelete={onDeleteUser}
                  onEdit={onEditUser}
                  onSelect={onToggleSelectUser}
                  onToggleStatus={onToggleStatus}
                  selected={selectedUsers.has(user.id)}
                  user={user}
                />
              ))
            )}
          </>
        ) : users.length === 0 ? (
          <EmptyUsersState />
        ) : (
          users.map((user) => (
            <MobileUserCard
              key={user.id}
              onDelete={onDeleteUser}
              onEdit={onEditUser}
              onToggleStatus={onToggleStatus}
              user={user}
            />
          ))
        )}
      </View>

      {total > pageSize && (
        <View style={styles.pagination}>
          <Text style={styles.paginationText}>
            Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of{" "}
            {total}
          </Text>
          <View style={styles.paginationButtons}>
            <PageButton
              direction="back"
              disabled={page === 1}
              onPress={() => page > 1 && onPageChange(page - 1)}
            />
            <Text style={styles.pageNumber}>
              Page {page} of {totalPages}
            </Text>
            <PageButton
              direction="forward"
              disabled={page === totalPages}
              onPress={() => page < totalPages && onPageChange(page + 1)}
            />
          </View>
        </View>
      )}
    </>
  );
}

function SortableHeader({
  active,
  cellStyle,
  label,
  onPress,
  sortOrder,
}: {
  active: boolean;
  cellStyle: object;
  label: string;
  onPress: () => void;
  sortOrder: SortOrder;
}) {
  return (
    <AnimatedPressable style={[styles.headerCell, cellStyle]} onPress={onPress}>
      <Text style={styles.headerText}>{label}</Text>
      {active && (
        <Ionicons
          name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
          size={14}
          color={auroraTheme.colors.primary[600]}
        />
      )}
    </AnimatedPressable>
  );
}

function DesktopUserRow({
  onDelete,
  onEdit,
  onSelect,
  onToggleStatus,
  selected,
  user,
}: {
  onDelete: (user: User) => void;
  onEdit: (user: User) => void;
  onSelect: (userId: string) => void;
  onToggleStatus: (user: User) => void;
  selected: boolean;
  user: User;
}) {
  const roleBadge = getRoleBadgeStyle(user.role);
  const statusBadge = getStatusStyle(user.isActive);

  return (
    <View style={[styles.tableRow, selected && styles.tableRowSelected]} testID={`user-row-${user.username}`}>
      <AnimatedPressable style={styles.checkboxCell} onPress={() => onSelect(user.id)}>
        <Ionicons
          name={selected ? "checkbox" : "square-outline"}
          size={20}
          color={auroraTheme.colors.primary[600]}
        />
      </AnimatedPressable>
      <View style={[styles.cell, styles.usernameCell]}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.username.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.username}>{user.username}</Text>
            {user.fullName && <Text style={styles.fullName}>{user.fullName}</Text>}
          </View>
        </View>
      </View>
      <View style={[styles.cell, styles.emailCell]}>
        <Text style={styles.cellText}>{user.email || "-"}</Text>
      </View>
      <View style={[styles.cell, styles.roleCell]}>
        <View style={[styles.badge, { backgroundColor: roleBadge.bg }]}>
          <Text style={[styles.badgeText, { color: roleBadge.text }]}>
            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </Text>
        </View>
      </View>
      <View style={[styles.cell, styles.statusCell]}>
        <View style={[styles.badge, { backgroundColor: statusBadge.bg }]}>
          <Text style={[styles.badgeText, { color: statusBadge.text }]}>
            {user.isActive ? "Active" : "Inactive"}
          </Text>
        </View>
      </View>
      <View style={[styles.cell, styles.dateCell]}>
        <Text style={styles.cellText}>{formatDate(user.createdAt)}</Text>
      </View>
      <View style={[styles.cell, styles.actionsCell]}>
        <View style={styles.actionButtons}>
          <ActionButton
            icon="pencil"
            label={`Edit user ${user.username}`}
            onPress={() => onEdit(user)}
            testID={`user-edit-${user.username}`}
            color={auroraTheme.colors.primary[600]}
          />
          <ActionButton
            icon={user.isActive ? "pause-circle-outline" : "play-circle-outline"}
            label={`${user.isActive ? "Deactivate" : "Activate"} user ${user.username}`}
            onPress={() => onToggleStatus(user)}
            testID={`user-toggle-${user.username}`}
            color={
              user.isActive
                ? auroraTheme.colors.warning[600]
                : auroraTheme.colors.success[600]
            }
          />
          <ActionButton
            icon="trash-outline"
            label={`Delete user ${user.username}`}
            onPress={() => onDelete(user)}
            testID={`user-delete-${user.username}`}
            color={auroraTheme.colors.error[600]}
          />
        </View>
      </View>
    </View>
  );
}

function MobileUserCard({
  onDelete,
  onEdit,
  onToggleStatus,
  user,
}: {
  onDelete: (user: User) => void;
  onEdit: (user: User) => void;
  onToggleStatus: (user: User) => void;
  user: User;
}) {
  const roleBadge = getRoleBadgeStyle(user.role);
  const statusBadge = getStatusStyle(user.isActive);

  return (
    <View style={styles.mobileCard}>
      <View style={styles.mobileCardHeader}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.username.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.username}>{user.username}</Text>
            {user.email && <Text style={styles.mobileEmail}>{user.email}</Text>}
          </View>
        </View>
        <View style={styles.mobileBadges}>
          <View style={[styles.badge, { backgroundColor: roleBadge.bg }]}>
            <Text style={[styles.badgeText, { color: roleBadge.text }]}>
              {user.role}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: statusBadge.bg }]}>
            <Text style={[styles.badgeText, { color: statusBadge.text }]}>
              {user.isActive ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.mobileCardActions}>
        <MobileAction
          icon="pencil"
          label="Edit"
          onPress={() => onEdit(user)}
          color={auroraTheme.colors.primary[600]}
        />
        <MobileAction
          icon={user.isActive ? "pause-circle" : "play-circle"}
          label={user.isActive ? "Deactivate" : "Activate"}
          onPress={() => onToggleStatus(user)}
          color={
            user.isActive
              ? auroraTheme.colors.warning[600]
              : auroraTheme.colors.success[600]
          }
        />
        <MobileAction
          icon="trash"
          label="Delete"
          onPress={() => onDelete(user)}
          color={auroraTheme.colors.error[600]}
        />
      </View>
    </View>
  );
}

function ActionButton({
  color,
  icon,
  label,
  onPress,
  testID,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <AnimatedPressable
      style={styles.actionButton}
      onPress={onPress}
      testID={testID}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={color} />
    </AnimatedPressable>
  );
}

function MobileAction({
  color,
  icon,
  label,
  onPress,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable style={styles.mobileAction} onPress={onPress}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.mobileActionText, color === auroraTheme.colors.error[600] && { color }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function PageButton({
  direction,
  disabled,
  onPress,
}: {
  direction: "back" | "forward";
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      style={[styles.pageButton, disabled && styles.pageButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons
        name={direction === "back" ? "chevron-back" : "chevron-forward"}
        size={20}
        color={
          disabled
            ? auroraTheme.colors.neutral[300]
            : auroraTheme.colors.primary[600]
        }
      />
    </AnimatedPressable>
  );
}

function EmptyUsersState() {
  return (
    <View style={styles.emptyState} testID="users-empty-state">
      <Ionicons
        name="people-outline"
        size={48}
        color={auroraTheme.colors.neutral[300]}
      />
      <Text style={styles.emptyText}>No users found</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tableContainer: {
    marginHorizontal: auroraTheme.spacing.lg,
    backgroundColor: auroraTheme.colors.background.secondary,
    borderRadius: auroraTheme.borderRadius.lg,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: auroraTheme.colors.neutral[100],
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.neutral[200],
    paddingVertical: auroraTheme.spacing.sm,
  },
  headerCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: auroraTheme.spacing.xs,
    paddingHorizontal: auroraTheme.spacing.sm,
  },
  headerText: {
    ...userTextStyles.label,
    color: auroraTheme.colors.text.secondary,
    fontWeight: "600",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.neutral[100],
    paddingVertical: auroraTheme.spacing.sm,
    alignItems: "center",
  },
  tableRowSelected: {
    backgroundColor: auroraTheme.colors.primary[50],
  },
  cell: {
    paddingHorizontal: auroraTheme.spacing.sm,
  },
  cellText: {
    ...userTextStyles.body,
    color: auroraTheme.colors.text.primary,
  },
  checkboxCell: {
    width: 40,
    alignItems: "center",
  },
  usernameCell: {
    flex: 2,
    minWidth: 150,
  },
  emailCell: {
    flex: 2,
    minWidth: 180,
  },
  roleCell: {
    flex: 1,
    minWidth: 100,
  },
  statusCell: {
    flex: 1,
    minWidth: 80,
  },
  dateCell: {
    flex: 1,
    minWidth: 100,
  },
  actionsCell: {
    width: 120,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: auroraTheme.spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: auroraTheme.colors.primary[100],
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...userTextStyles.label,
    color: auroraTheme.colors.primary[700],
    fontWeight: "700",
  },
  username: {
    ...userTextStyles.body,
    color: auroraTheme.colors.text.primary,
    fontWeight: "600",
  },
  fullName: {
    ...userTextStyles.caption,
    color: auroraTheme.colors.text.secondary,
  },
  badge: {
    paddingHorizontal: auroraTheme.spacing.sm,
    paddingVertical: 2,
    borderRadius: auroraTheme.borderRadius.sm,
  },
  badgeText: {
    ...userTextStyles.caption,
    fontWeight: "600",
  },
  actionButtons: {
    flexDirection: "row",
    gap: auroraTheme.spacing.xs,
  },
  actionButton: {
    padding: auroraTheme.spacing.xs,
    borderRadius: auroraTheme.borderRadius.sm,
  },
  emptyState: {
    padding: auroraTheme.spacing["2xl"],
    alignItems: "center",
    gap: auroraTheme.spacing.md,
  },
  emptyText: {
    ...userTextStyles.body,
    color: auroraTheme.colors.text.tertiary,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: auroraTheme.spacing.lg,
    paddingVertical: auroraTheme.spacing.md,
  },
  paginationText: {
    ...userTextStyles.caption,
    color: auroraTheme.colors.text.secondary,
  },
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: auroraTheme.spacing.sm,
  },
  pageButton: {
    padding: auroraTheme.spacing.xs,
    borderRadius: auroraTheme.borderRadius.sm,
    borderWidth: 1,
    borderColor: auroraTheme.colors.neutral[200],
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageNumber: {
    ...userTextStyles.label,
    color: auroraTheme.colors.text.primary,
  },
  mobileCard: {
    backgroundColor: auroraTheme.colors.background.primary,
    margin: auroraTheme.spacing.sm,
    borderRadius: auroraTheme.borderRadius.md,
    padding: auroraTheme.spacing.md,
    borderWidth: 1,
    borderColor: auroraTheme.colors.neutral[100],
  },
  mobileCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: auroraTheme.spacing.md,
  },
  mobileBadges: {
    flexDirection: "row",
    gap: auroraTheme.spacing.xs,
  },
  mobileEmail: {
    ...userTextStyles.caption,
    color: auroraTheme.colors.text.secondary,
  },
  mobileCardActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: auroraTheme.colors.neutral[100],
    paddingTop: auroraTheme.spacing.sm,
  },
  mobileAction: {
    alignItems: "center",
    gap: 2,
  },
  mobileActionText: {
    ...userTextStyles.caption,
    color: auroraTheme.colors.text.secondary,
  },
});
