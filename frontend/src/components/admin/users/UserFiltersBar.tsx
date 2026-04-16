import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { AnimatedPressable } from "@/components/ui";
import { auroraTheme } from "@/theme/auroraTheme";
import { userTextStyles } from "@/components/admin/users/userManagementShared";

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
  return (
    <>
      <View style={styles.filterBar}>
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={20}
            color={auroraTheme.colors.neutral[400]}
          />
          <TextInput
            style={styles.searchInput}
            testID="users-search-input"
            placeholder="Search users..."
            placeholderTextColor={auroraTheme.colors.neutral[400]}
            value={search}
            onChangeText={onChangeSearch}
          />
          {search.length > 0 && (
            <AnimatedPressable onPress={() => onChangeSearch("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color={auroraTheme.colors.neutral[400]}
              />
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
            />
            {["staff", "supervisor", "admin"].map((role) => (
              <FilterButton
                key={role}
                active={roleFilter === role}
                label={role.charAt(0).toUpperCase() + role.slice(1)}
                onPress={() => onChangeRoleFilter(roleFilter === role ? null : role)}
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
            />
            <FilterButton
              active={activeFilter === true}
              label="Active"
              onPress={() => onChangeActiveFilter(activeFilter === true ? null : true)}
            />
            <FilterButton
              active={activeFilter === false}
              label="Inactive"
              onPress={() =>
                onChangeActiveFilter(activeFilter === false ? null : false)
              }
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
            />
            <BulkButton
              icon="pause-circle"
              label="Deactivate"
              style={styles.bulkButtonWarning}
              onPress={() => onBulkAction("deactivate")}
            />
            <BulkButton
              icon="trash"
              label="Delete"
              style={styles.bulkButtonDanger}
              onPress={() => onBulkAction("delete")}
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
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      style={[styles.filterButton, active && styles.filterButtonActive]}
      onPress={onPress}
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  style: object;
}) {
  return (
    <AnimatedPressable style={[styles.bulkButton, style]} onPress={onPress}>
      <Ionicons name={icon} size={16} color="#fff" />
      <Text style={styles.bulkButtonText}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    paddingHorizontal: auroraTheme.spacing.lg,
    paddingVertical: auroraTheme.spacing.md,
    backgroundColor: auroraTheme.colors.background.secondary,
    marginBottom: auroraTheme.spacing.md,
    gap: auroraTheme.spacing.md,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: auroraTheme.colors.background.primary,
    borderRadius: auroraTheme.borderRadius.md,
    paddingHorizontal: auroraTheme.spacing.sm,
    paddingVertical: auroraTheme.spacing.xs,
    gap: auroraTheme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    ...userTextStyles.body,
    color: auroraTheme.colors.text.primary,
    padding: auroraTheme.spacing.xs,
  },
  filterGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: auroraTheme.spacing.sm,
    flexWrap: "wrap",
  },
  filterLabel: {
    ...userTextStyles.label,
    color: auroraTheme.colors.text.secondary,
  },
  filterButtons: {
    flexDirection: "row",
    gap: auroraTheme.spacing.xs,
    flexWrap: "wrap",
  },
  filterButton: {
    paddingHorizontal: auroraTheme.spacing.sm,
    paddingVertical: auroraTheme.spacing.xs,
    borderRadius: auroraTheme.borderRadius.md,
    backgroundColor: auroraTheme.colors.background.primary,
    borderWidth: 1,
    borderColor: auroraTheme.colors.neutral[200],
  },
  filterButtonActive: {
    backgroundColor: auroraTheme.colors.primary[100],
    borderColor: auroraTheme.colors.primary[300],
  },
  filterButtonText: {
    ...userTextStyles.caption,
    color: auroraTheme.colors.text.secondary,
  },
  filterButtonTextActive: {
    color: auroraTheme.colors.primary[700],
    fontWeight: "600",
  },
  bulkActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: auroraTheme.spacing.lg,
    paddingVertical: auroraTheme.spacing.sm,
    backgroundColor: auroraTheme.colors.primary[50],
    marginHorizontal: auroraTheme.spacing.lg,
    marginBottom: auroraTheme.spacing.md,
    borderRadius: auroraTheme.borderRadius.md,
  },
  bulkText: {
    ...userTextStyles.label,
    color: auroraTheme.colors.primary[700],
    fontWeight: "600",
  },
  bulkButtons: {
    flexDirection: "row",
    gap: auroraTheme.spacing.sm,
  },
  bulkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: auroraTheme.spacing.xs,
    paddingHorizontal: auroraTheme.spacing.sm,
    paddingVertical: auroraTheme.spacing.xs,
    borderRadius: auroraTheme.borderRadius.sm,
  },
  bulkButtonSuccess: {
    backgroundColor: auroraTheme.colors.success[600],
  },
  bulkButtonWarning: {
    backgroundColor: auroraTheme.colors.warning[600],
  },
  bulkButtonDanger: {
    backgroundColor: auroraTheme.colors.error[600],
  },
  bulkButtonText: {
    ...userTextStyles.caption,
    color: "#fff",
    fontWeight: "600",
  },
});
