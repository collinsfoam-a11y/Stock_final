import React, { useMemo } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { AnimatedPressable } from "@/components/ui";
import {
  getOperationalActionColor,
  getRoleBadgeStyle,
  getStatusStyle,
  SortField,
  SortOrder,
  User,
  userTextStyles,
} from "@/components/admin/users/userManagementShared";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

const { width } = Dimensions.get("window");
const isWeb = Platform.OS === "web";
const isTablet = width > 768;

interface UsersTableProps {
  ListHeaderComponent?: React.ReactElement | null;
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
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString();
};

export function UsersTable({
  ListHeaderComponent,
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
  refreshControl,
}: UsersTableProps) {
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const showTableLayout = isWeb || isTablet;

  const renderUser = ({ item: user }: { item: User }) =>
    showTableLayout ? (
      <DesktopUserRow
        onDelete={onDeleteUser}
        onEdit={onEditUser}
        onSelect={onToggleSelectUser}
        onToggleStatus={onToggleStatus}
        selected={selectedUsers.has(user.id)}
        styles={styles}
        uiTokens={uiTokens}
        user={user}
      />
    ) : (
      <MobileUserCard
        onDelete={onDeleteUser}
        onEdit={onEditUser}
        onToggleStatus={onToggleStatus}
        styles={styles}
        uiTokens={uiTokens}
        user={user}
      />
    );

  const renderHeader = () => (
    <>
      {ListHeaderComponent}
      <View style={styles.tableContainer} testID="users-table">
        {showTableLayout ? (
          <View style={styles.tableHeader}>
            <AnimatedPressable
              style={styles.checkboxCell}
              onPress={onToggleSelectAll}
              {...getAccessibleButtonProps({
                label:
                  selectedUsers.size === users.length && users.length > 0
                    ? "Clear selected users"
                    : "Select all users",
                selected: selectedUsers.size === users.length && users.length > 0,
              })}
            >
              <Ionicons
                name={
                  selectedUsers.size === users.length && users.length > 0
                    ? "checkbox"
                    : "square-outline"
                }
                size={20}
                color={uiTokens.colors.accent}
              />
            </AnimatedPressable>
            <SortableHeader
              active={sortBy === "username"}
              cellStyle={styles.usernameCell}
              label="Username"
              onPress={() => onSort("username")}
              styles={styles}
              sortOrder={sortOrder}
              uiTokens={uiTokens}
            />
            <SortableHeader
              active={sortBy === "email"}
              cellStyle={styles.emailCell}
              label="Email"
              onPress={() => onSort("email")}
              styles={styles}
              sortOrder={sortOrder}
              uiTokens={uiTokens}
            />
            <SortableHeader
              active={sortBy === "role"}
              cellStyle={styles.roleCell}
              label="Role"
              onPress={() => onSort("role")}
              styles={styles}
              sortOrder={sortOrder}
              uiTokens={uiTokens}
            />
            <View style={[styles.headerCell, styles.statusCell]}>
              <Text style={styles.headerText}>Status</Text>
            </View>
            <SortableHeader
              active={sortBy === "created_at"}
              cellStyle={styles.dateCell}
              label="Created"
              onPress={() => onSort("created_at")}
              styles={styles}
              sortOrder={sortOrder}
              uiTokens={uiTokens}
            />
            <View style={[styles.headerCell, styles.actionsCell]}>
              <Text style={styles.headerText}>Actions</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.mobileListTitle}>Users</Text>
        )}
      </View>
    </>
  );

  const renderFooter = () =>
    total > pageSize ? (
      <View style={styles.pagination}>
        <Text style={styles.paginationText}>
          Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total}
        </Text>
        <View style={styles.paginationButtons}>
          <PageButton
            direction="back"
            disabled={page === 1}
            onPress={() => page > 1 && onPageChange(page - 1)}
            styles={styles}
            uiTokens={uiTokens}
          />
          <Text style={styles.pageNumber}>
            Page {page} of {totalPages}
          </Text>
          <PageButton
            direction="forward"
            disabled={page === totalPages}
            onPress={() => page < totalPages && onPageChange(page + 1)}
            styles={styles}
            uiTokens={uiTokens}
          />
        </View>
      </View>
    ) : null;

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={users}
      keyExtractor={(user) => user.id}
      ListEmptyComponent={() => <EmptyUsersState styles={styles} uiTokens={uiTokens} />}
      ListFooterComponent={renderFooter}
      ListHeaderComponent={renderHeader}
      refreshControl={refreshControl}
      renderItem={renderUser}
    />
  );
}

function SortableHeader({
  active,
  cellStyle,
  label,
  onPress,
  styles,
  sortOrder,
  uiTokens,
}: {
  active: boolean;
  cellStyle: StyleProp<ViewStyle>;
  label: string;
  onPress: () => void;
  styles: UsersTableStyles;
  sortOrder: SortOrder;
  uiTokens: UsersTableTokens;
}) {
  return (
    <AnimatedPressable
      style={[styles.headerCell, cellStyle]}
      onPress={onPress}
      {...getAccessibleButtonProps({
        label: `Sort users by ${label}`,
        selected: active,
      })}
    >
      <Text style={styles.headerText}>{label}</Text>
      {active && (
        <Ionicons
          name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
          size={14}
          color={uiTokens.colors.accent}
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
  styles,
  uiTokens,
  user,
}: {
  onDelete: (user: User) => void;
  onEdit: (user: User) => void;
  onSelect: (userId: string) => void;
  onToggleStatus: (user: User) => void;
  selected: boolean;
  styles: UsersTableStyles;
  uiTokens: UsersTableTokens;
  user: User;
}) {
  const roleBadge = getRoleBadgeStyle(user.role, uiTokens);
  const statusBadge = getStatusStyle(user.isActive, uiTokens);

  return (
    <View
      style={[styles.tableRow, selected && styles.tableRowSelected]}
      testID={`user-row-${user.username}`}
    >
      <AnimatedPressable
        style={styles.checkboxCell}
        onPress={() => onSelect(user.id)}
        {...getAccessibleButtonProps({
          label: `${selected ? "Deselect" : "Select"} user ${user.username}`,
          selected,
        })}
      >
        <Ionicons
          name={selected ? "checkbox" : "square-outline"}
          size={20}
          color={uiTokens.colors.accent}
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
            color={getOperationalActionColor("primary", uiTokens)}
            styles={styles}
          />
          <ActionButton
            icon={user.isActive ? "pause-circle-outline" : "play-circle-outline"}
            label={`${user.isActive ? "Deactivate" : "Activate"} user ${user.username}`}
            onPress={() => onToggleStatus(user)}
            testID={`user-toggle-${user.username}`}
            color={getOperationalActionColor(user.isActive ? "warning" : "success", uiTokens)}
            styles={styles}
          />
          <ActionButton
            icon="trash-outline"
            label={`Delete user ${user.username}`}
            onPress={() => onDelete(user)}
            testID={`user-delete-${user.username}`}
            color={getOperationalActionColor("danger", uiTokens)}
            styles={styles}
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
  styles,
  uiTokens,
  user,
}: {
  onDelete: (user: User) => void;
  onEdit: (user: User) => void;
  onToggleStatus: (user: User) => void;
  styles: UsersTableStyles;
  uiTokens: UsersTableTokens;
  user: User;
}) {
  const roleBadge = getRoleBadgeStyle(user.role, uiTokens);
  const statusBadge = getStatusStyle(user.isActive, uiTokens);

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
            <Text style={[styles.badgeText, { color: roleBadge.text }]}>{user.role}</Text>
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
          color={getOperationalActionColor("primary", uiTokens)}
          styles={styles}
          accessibilityLabel={`Edit user ${user.username}`}
        />
        <MobileAction
          icon={user.isActive ? "pause-circle" : "play-circle"}
          label={user.isActive ? "Deactivate" : "Activate"}
          onPress={() => onToggleStatus(user)}
          color={getOperationalActionColor(user.isActive ? "warning" : "success", uiTokens)}
          styles={styles}
          accessibilityLabel={`${user.isActive ? "Deactivate" : "Activate"} user ${user.username}`}
        />
        <MobileAction
          icon="trash"
          label="Delete"
          onPress={() => onDelete(user)}
          color={getOperationalActionColor("danger", uiTokens)}
          styles={styles}
          accessibilityLabel={`Delete user ${user.username}`}
          destructive
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
  styles,
  testID,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  styles: UsersTableStyles;
  testID: string;
}) {
  return (
    <AnimatedPressable
      style={styles.actionButton}
      onPress={onPress}
      testID={testID}
      {...getAccessibleButtonProps({ label })}
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
  styles,
  accessibilityLabel,
  destructive,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  styles: UsersTableStyles;
  accessibilityLabel: string;
  destructive?: boolean;
}) {
  return (
    <AnimatedPressable
      style={styles.mobileAction}
      onPress={onPress}
      {...getAccessibleButtonProps({ label: accessibilityLabel })}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.mobileActionText, destructive && { color }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function PageButton({
  direction,
  disabled,
  onPress,
  styles,
  uiTokens,
}: {
  direction: "back" | "forward";
  disabled: boolean;
  onPress: () => void;
  styles: UsersTableStyles;
  uiTokens: UsersTableTokens;
}) {
  return (
    <AnimatedPressable
      style={[styles.pageButton, disabled && styles.pageButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
      {...getAccessibleButtonProps({
        label: direction === "back" ? "Previous users page" : "Next users page",
        disabled,
      })}
    >
      <Ionicons
        name={direction === "back" ? "chevron-back" : "chevron-forward"}
        size={20}
        color={disabled ? uiTokens.colors.textMuted : uiTokens.colors.accent}
      />
    </AnimatedPressable>
  );
}

function EmptyUsersState({
  styles,
  uiTokens,
}: {
  styles: UsersTableStyles;
  uiTokens: UsersTableTokens;
}) {
  return (
    <View style={styles.emptyState} testID="users-empty-state">
      <Ionicons name="people-outline" size={48} color={uiTokens.colors.textMuted} />
      <Text style={styles.emptyText}>No users found</Text>
    </View>
  );
}

type UsersTableTokens = ReturnType<typeof useUiTokens>;
type UsersTableStyles = ReturnType<typeof createStyles>;

const createStyles = (uiTokens: UsersTableTokens) =>
  StyleSheet.create({
  tableContainer: {
    marginHorizontal: uiTokens.spacing.lg,
    backgroundColor: uiTokens.colors.surface,
    borderRadius: uiTokens.radius.lg,
    overflow: "hidden",
  },
  listContent: {
    paddingBottom: uiTokens.spacing.lg,
  },
  mobileListTitle: {
    ...userTextStyles.label,
    color: uiTokens.colors.textSecondary,
    padding: uiTokens.spacing.md,
    textTransform: "uppercase",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colorWithAlpha(uiTokens.colors.textMuted, 0.1),
    borderBottomWidth: 1,
    borderBottomColor: uiTokens.colors.border,
    paddingVertical: uiTokens.spacing.sm,
  },
  headerCell: {
    ...getMinimumTouchTargetStyle(),
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.spacing.xs,
    paddingHorizontal: uiTokens.spacing.sm,
  },
  headerText: {
    ...userTextStyles.label,
    color: uiTokens.colors.textSecondary,
    fontWeight: "600",
  },
  tableRow: {
    flexDirection: "row",
    marginHorizontal: uiTokens.spacing.lg,
    backgroundColor: uiTokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colorWithAlpha(uiTokens.colors.textMuted, 0.12),
    paddingVertical: uiTokens.spacing.sm,
    alignItems: "center",
  },
  tableRowSelected: {
    backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.08),
  },
  cell: {
    paddingHorizontal: uiTokens.spacing.sm,
  },
  cellText: {
    ...userTextStyles.body,
    color: uiTokens.colors.textPrimary,
  },
  checkboxCell: {
    ...getMinimumTouchTargetStyle(),
    width: 44,
    alignItems: "center",
    justifyContent: "center",
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
    gap: uiTokens.spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...userTextStyles.label,
    color: uiTokens.colors.accentStrong,
    fontWeight: "700",
  },
  username: {
    ...userTextStyles.body,
    color: uiTokens.colors.textPrimary,
    fontWeight: "600",
  },
  fullName: {
    ...userTextStyles.caption,
    color: uiTokens.colors.textSecondary,
  },
  badge: {
    paddingHorizontal: uiTokens.spacing.sm,
    paddingVertical: uiTokens.spacing.xxs,
    borderRadius: uiTokens.radius.sm,
  },
  badgeText: {
    ...userTextStyles.caption,
    fontWeight: "600",
  },
  actionButtons: {
    flexDirection: "row",
    gap: uiTokens.spacing.xs,
  },
  actionButton: {
    ...getMinimumTouchTargetStyle(),
    alignItems: "center",
    justifyContent: "center",
    padding: uiTokens.spacing.xs,
    borderRadius: uiTokens.radius.sm,
  },
  emptyState: {
    padding: uiTokens.spacing["2xl"],
    alignItems: "center",
    gap: uiTokens.spacing.md,
  },
  emptyText: {
    ...userTextStyles.body,
    color: uiTokens.colors.textMuted,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: uiTokens.spacing.lg,
    paddingVertical: uiTokens.spacing.md,
  },
  paginationText: {
    ...userTextStyles.caption,
    color: uiTokens.colors.textSecondary,
  },
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.spacing.sm,
  },
  pageButton: {
    ...getMinimumTouchTargetStyle(),
    alignItems: "center",
    justifyContent: "center",
    padding: uiTokens.spacing.xs,
    borderRadius: uiTokens.radius.sm,
    borderWidth: 1,
    borderColor: uiTokens.colors.border,
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageNumber: {
    ...userTextStyles.label,
    color: uiTokens.colors.textPrimary,
  },
  mobileCard: {
    backgroundColor: uiTokens.colors.background,
    margin: uiTokens.spacing.sm,
    borderRadius: uiTokens.radius.md,
    padding: uiTokens.spacing.md,
    borderWidth: 1,
    borderColor: colorWithAlpha(uiTokens.colors.textMuted, 0.12),
  },
  mobileCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: uiTokens.spacing.md,
  },
  mobileBadges: {
    flexDirection: "row",
    gap: uiTokens.spacing.xs,
  },
  mobileEmail: {
    ...userTextStyles.caption,
    color: uiTokens.colors.textSecondary,
  },
  mobileCardActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: colorWithAlpha(uiTokens.colors.textMuted, 0.12),
    paddingTop: uiTokens.spacing.sm,
  },
  mobileAction: {
    ...getMinimumTouchTargetStyle(),
    alignItems: "center",
    justifyContent: "center",
    gap: uiTokens.spacing.xxs,
  },
  mobileActionText: {
    ...userTextStyles.caption,
    color: uiTokens.colors.textSecondary,
  },
});
