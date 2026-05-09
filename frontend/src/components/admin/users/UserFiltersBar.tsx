import React, { useMemo } from "react";
import { StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { AnimatedPressable } from "@/components/ui";
import { userTextStyles } from "@/components/admin/users/userManagementShared";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

interface UserFiltersBarProps {
  activeFilter: boolean | null;
  onBulkAction: (action: "activate" | "deactivate" | "delete") => void;
  onChangeActiveFilter: (value: boolean | null) => void;
  onChangeRoleFilter: (value: string | null) => void;
  onChangeSearch: (value: string) => void;
  roleFilter: string | null;
  search: string;
  selectedCount: number;
}

export function UserFiltersBar({
  activeFilter,
  onBulkAction,
  onChangeActiveFilter,
  onChangeRoleFilter,
  onChangeSearch,
  roleFilter,
  search,
  selectedCount,
}: UserFiltersBarProps) {
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);

  return (
    <>
      <View style={styles.filterBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={uiTokens.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            testID="users-search-input"
            placeholder="Search users..."
            placeholderTextColor={uiTokens.colors.textMuted}
            value={search}
            onChangeText={onChangeSearch}
            accessibilityLabel="Search users"
          />
          {search.length > 0 && (
            <AnimatedPressable
              style={styles.clearSearchButton}
              onPress={() => onChangeSearch("")}
              {...getAccessibleButtonProps({ label: "Clear user search" })}
            >
              <Ionicons name="close-circle" size={20} color={uiTokens.colors.textMuted} />
            </AnimatedPressable>
          )}
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Role:</Text>
          <View style={styles.filterButtons}>
            <FilterButton
              active={!roleFilter}
              label="All"
              onPress={() => onChangeRoleFilter(null)}
              styles={styles}
            />
            {["staff", "supervisor", "admin"].map((role) => (
              <FilterButton
                key={role}
                active={roleFilter === role}
                label={role.charAt(0).toUpperCase() + role.slice(1)}
                onPress={() => onChangeRoleFilter(roleFilter === role ? null : role)}
                styles={styles}
              />
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Status:</Text>
          <View style={styles.filterButtons}>
            <FilterButton
              active={activeFilter === null}
              label="All"
              onPress={() => onChangeActiveFilter(null)}
              styles={styles}
            />
            <FilterButton
              active={activeFilter === true}
              label="Active"
              onPress={() => onChangeActiveFilter(activeFilter === true ? null : true)}
              styles={styles}
            />
            <FilterButton
              active={activeFilter === false}
              label="Inactive"
              onPress={() => onChangeActiveFilter(activeFilter === false ? null : false)}
              styles={styles}
            />
          </View>
        </View>
      </View>

      {selectedCount > 0 && (
        <View style={styles.bulkActions}>
          <Text style={styles.bulkText}>{selectedCount} selected</Text>
          <View style={styles.bulkButtons}>
            <BulkButton
              icon="checkmark-circle"
              label="Activate"
              style={styles.bulkButtonSuccess}
              onPress={() => onBulkAction("activate")}
              styles={styles}
              textColor={uiTokens.colors.surface}
            />
            <BulkButton
              icon="pause-circle"
              label="Deactivate"
              style={styles.bulkButtonWarning}
              onPress={() => onBulkAction("deactivate")}
              styles={styles}
              textColor={uiTokens.colors.surface}
            />
            <BulkButton
              icon="trash"
              label="Delete"
              style={styles.bulkButtonDanger}
              onPress={() => onBulkAction("delete")}
              styles={styles}
              textColor={uiTokens.colors.surface}
            />
          </View>
        </View>
      )}
    </>
  );
}

function FilterButton({
  active,
  label,
  onPress,
  styles,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <AnimatedPressable
      style={[styles.filterButton, active && styles.filterButtonActive]}
      onPress={onPress}
      {...getAccessibleButtonProps({
        label: `${label} user filter`,
        selected: active,
      })}
    >
      <Text style={[styles.filterButtonText, active && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function BulkButton({
  icon,
  label,
  onPress,
  style,
  styles,
  textColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  style: StyleProp<ViewStyle>;
  styles: ReturnType<typeof createStyles>;
  textColor: string;
}) {
  return (
    <AnimatedPressable
      style={[styles.bulkButton, style]}
      onPress={onPress}
      {...getAccessibleButtonProps({ label: `${label} selected users` })}
    >
      <Ionicons name={icon} size={16} color={textColor} />
      <Text style={styles.bulkButtonText}>{label}</Text>
    </AnimatedPressable>
  );
}

type UserFilterTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: UserFilterTokens) =>
  StyleSheet.create({
  filterBar: {
    paddingHorizontal: uiTokens.spacing.lg,
    paddingVertical: uiTokens.spacing.md,
    backgroundColor: uiTokens.colors.surface,
    marginBottom: uiTokens.spacing.md,
    gap: uiTokens.spacing.md,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: uiTokens.colors.background,
    borderRadius: uiTokens.radius.md,
    paddingHorizontal: uiTokens.spacing.sm,
    paddingVertical: uiTokens.spacing.xs,
    gap: uiTokens.spacing.xs,
  },
  searchInput: {
    flex: 1,
    ...userTextStyles.body,
    color: uiTokens.colors.textPrimary,
    padding: uiTokens.spacing.xs,
  },
  clearSearchButton: {
    ...getMinimumTouchTargetStyle(),
    alignItems: "center",
    justifyContent: "center",
  },
  filterGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.spacing.sm,
    flexWrap: "wrap",
  },
  filterLabel: {
    ...userTextStyles.label,
    color: uiTokens.colors.textSecondary,
  },
  filterButtons: {
    flexDirection: "row",
    gap: uiTokens.spacing.xs,
    flexWrap: "wrap",
  },
  filterButton: {
    ...getMinimumTouchTargetStyle(),
    paddingHorizontal: uiTokens.spacing.sm,
    paddingVertical: uiTokens.spacing.xs,
    borderRadius: uiTokens.radius.md,
    backgroundColor: uiTokens.colors.background,
    borderWidth: 1,
    borderColor: uiTokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButtonActive: {
    backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.12),
    borderColor: colorWithAlpha(uiTokens.colors.accent, 0.42),
  },
  filterButtonText: {
    ...userTextStyles.caption,
    color: uiTokens.colors.textSecondary,
  },
  filterButtonTextActive: {
    color: uiTokens.colors.accentStrong,
    fontWeight: "600",
  },
  bulkActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: uiTokens.spacing.lg,
    paddingVertical: uiTokens.spacing.sm,
    backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.1),
    marginHorizontal: uiTokens.spacing.lg,
    marginBottom: uiTokens.spacing.md,
    borderRadius: uiTokens.radius.md,
  },
  bulkText: {
    ...userTextStyles.label,
    color: uiTokens.colors.accentStrong,
    fontWeight: "600",
  },
  bulkButtons: {
    flexDirection: "row",
    gap: uiTokens.spacing.sm,
  },
  bulkButton: {
    ...getMinimumTouchTargetStyle(),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTokens.spacing.xs,
    paddingHorizontal: uiTokens.spacing.sm,
    paddingVertical: uiTokens.spacing.xs,
    borderRadius: uiTokens.radius.sm,
  },
  bulkButtonSuccess: {
    backgroundColor: uiTokens.colors.success,
  },
  bulkButtonWarning: {
    backgroundColor: uiTokens.colors.warning,
  },
  bulkButtonDanger: {
    backgroundColor: uiTokens.colors.error,
  },
  bulkButtonText: {
    ...userTextStyles.caption,
    color: uiTokens.colors.surface,
    fontWeight: "600",
  },
});
