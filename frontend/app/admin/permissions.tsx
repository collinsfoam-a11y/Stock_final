import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { usePermission } from "../../src/hooks/usePermission";
import { LoadingSpinner, ScreenContainer } from "../../src/components/ui";
import ModernCard from "../../src/components/ui/ModernCard";
import { AnimatedPressable } from "../../src/components/ui/AnimatedPressable";
import {
  getAvailablePermissions,
  getUserPermissions,
  addUserPermissions,
  removeUserPermissions,
} from "../../src/services/api";
import { useSettingsStore } from "../../src/store/settingsStore";
import Ionicons from "@expo/vector-icons/Ionicons";
import { safeBackNavigation } from "@/utils/navigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

const isWeb = Platform.OS === "web";

export default function PermissionsScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const { hasRole } = usePermission();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [loading, setLoading] = useState(true);
  const [availablePermissions, setAvailablePermissions] = useState<any>(null);
  const [selectedUsername, setSelectedUsername] = useState("");
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Check if user has admin permissions
  useEffect(() => {
    if (!hasRole("admin")) {
      Alert.alert("Access Denied", "You do not have permission to access this screen.", [
        { text: "OK", onPress: () => safeBackNavigation(router, { userRole: "admin" }) },
      ]);
    }
  }, [hasRole, router]);

  const loadAvailablePermissions = useCallback(async () => {
    if (offlineMode) {
      setAvailablePermissions(null);
      setUserPermissions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await getAvailablePermissions();
      setAvailablePermissions(response.data);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }, [offlineMode]);

  // Load available permissions
  useEffect(() => {
    if (hasRole("admin")) {
      void loadAvailablePermissions();
    }
  }, [hasRole, loadAvailablePermissions]);

  const loadUserPermissions = async (username: string) => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Permission lookup requires a live connection.");
      return;
    }

    if (!username.trim()) {
      Alert.alert("Input Required", "Please enter a username to load permissions.");
      return;
    }
    try {
      setLoading(true);
      const response = await getUserPermissions(username);
      setUserPermissions(response.data.permissions || []);
      setSelectedUsername(username);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to load user permissions");
      setUserPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUserPermission = async (permission: string) => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Permission updates require a live connection.");
      return;
    }

    if (!selectedUsername) {
      Alert.alert("Error", "Please enter a username first");
      return;
    }

    try {
      await addUserPermissions(selectedUsername, [permission]);
      setUserPermissions([...userPermissions, permission]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to add permission");
    }
  };

  const handleRemoveUserPermission = async (permission: string) => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Permission updates require a live connection.");
      return;
    }

    if (!selectedUsername) return;

    try {
      await removeUserPermissions(selectedUsername, [permission]);
      setUserPermissions(userPermissions.filter((p) => p !== permission));
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to remove permission");
    }
  };

  const renderPermissionCategories = () => {
    if (!availablePermissions?.categories) return null;

    const categories = availablePermissions.categories;
    const categoryKeys = Object.keys(categories);

    const filteredCategories = searchQuery
      ? categoryKeys.filter(
          (cat) =>
            cat.toLowerCase().includes(searchQuery.toLowerCase()) ||
            categories[cat].some((p: string) => p.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : categoryKeys;

    return filteredCategories.map((category) => {
      const permissions = categories[category];
      const filteredPermissions = searchQuery
        ? permissions.filter((p: string) => p.toLowerCase().includes(searchQuery.toLowerCase()))
        : permissions;

      if (filteredPermissions.length === 0) return null;

      return (
        <ModernCard
          key={category}
          variant="outlined"
          elevation="none"
          padding={0}
          style={styles.categoryContainer}
        >
          <View style={styles.categoryHeader}>
            <Ionicons
              name={getCategoryIcon(category)}
              size={20}
              color={uiTokens.colors.accent}
            />
            <Text style={styles.categoryTitle}>{category.toUpperCase().replace("_", " ")}</Text>
          </View>

          <View style={styles.permissionsGrid}>
            {filteredPermissions.map((permission: string) => {
              const hasPermission = userPermissions.includes(permission);
              return (
                <View key={permission} style={styles.permissionRow}>
                  <Text style={styles.permissionText}>{permission}</Text>
                  {selectedUsername && (
                    <AnimatedPressable
                      style={[
                        styles.permissionButton,
                        hasPermission ? styles.removeButton : styles.addButton,
                        offlineMode && styles.disabledButton,
                      ]}
                      onPress={() =>
                        hasPermission
                          ? handleRemoveUserPermission(permission)
                          : handleAddUserPermission(permission)
                      }
                      disabled={offlineMode}
                      {...getAccessibleButtonProps({
                        label: `${hasPermission ? "Remove" : "Add"} ${permission} permission`,
                        disabled: offlineMode,
                      })}
                    >
                      <Ionicons
                        name={hasPermission ? "close" : "add"}
                        size={16}
                        color={uiTokens.colors.surface}
                      />
                      <Text style={styles.buttonText}>{hasPermission ? "Remove" : "Add"}</Text>
                    </AnimatedPressable>
                  )}
                </View>
              );
            })}
          </View>
        </ModernCard>
      );
    });
  };

  const getCategoryIcon = (category: string): any => {
    const cat = category.toLowerCase();
    if (cat.includes("user")) return "people-outline";
    if (cat.includes("session")) return "list-outline";
    if (cat.includes("inventory")) return "cube-outline";
    if (cat.includes("report")) return "document-text-outline";
    if (cat.includes("admin")) return "shield-checkmark-outline";
    if (cat.includes("security")) return "lock-closed-outline";
    return "key-outline";
  };

  if (loading && !availablePermissions) {
    return (
      <ScreenContainer
        backgroundType="solid"
        header={{
          title: "Permissions",
          subtitle: "Loading system permissions...",
          showBackButton: true,
        }}
      >
        <View style={styles.centered}>
          <LoadingSpinner size={36} color={uiTokens.colors.accent} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      backgroundType="solid"
      header={{
        title: "Permissions",
        subtitle: "Manage User Access Control",
        showBackButton: true,
      }}
    >
      {offlineMode && (
        <View style={styles.topPanel}>
          <ModernCard variant="outlined" elevation="none" padding={0} style={styles.noticeCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={20}
              color={uiTokens.colors.warning}
            />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>Permissions are unavailable offline</Text>
              <Text style={styles.noticeBody}>
                Available permission rules and user permission assignments are loaded from the
                backend. Reconnect to view or update access.
              </Text>
            </View>
          </ModernCard>
        </View>
      )}

      <View style={styles.topPanel}>
        <ModernCard variant="outlined" elevation="none" padding={0} style={styles.controlPanel}>
          <View style={styles.inputSection}>
            <Text style={styles.sectionLabel}>User Target</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={uiTokens.colors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter username (e.g., staff1)"
                  placeholderTextColor={uiTokens.colors.textMuted}
                  value={selectedUsername}
                  onChangeText={setSelectedUsername}
                  autoCapitalize="none"
                  editable={!offlineMode}
                />
              </View>
              <AnimatedPressable
                style={[styles.loadButton, offlineMode && styles.disabledButton]}
                onPress={() => loadUserPermissions(selectedUsername)}
                disabled={offlineMode}
                {...getAccessibleButtonProps({
                  label: "Load user permissions",
                  disabled: offlineMode,
                })}
              >
                <Text style={styles.loadButtonText}>Load</Text>
              </AnimatedPressable>
            </View>
          </View>

          <View style={styles.searchSection}>
            <Text style={styles.sectionLabel}>Filter Permissions</Text>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="search-outline"
                size={20}
                color={uiTokens.colors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Search across all categories..."
                placeholderTextColor={uiTokens.colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                editable={!offlineMode}
              />
            </View>
          </View>
        </ModernCard>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, isWeb && styles.contentContainerWeb]}
      >
        <View style={styles.statsRow}>
          <ModernCard variant="outlined" elevation="none" padding={0} style={styles.statBox}>
            <Text style={styles.statValue}>{availablePermissions?.permissions?.length || 0}</Text>
            <Text style={styles.statLabel}>Total Perms</Text>
          </ModernCard>
          {selectedUsername && (
            <ModernCard variant="outlined" elevation="none" padding={0} style={styles.statBox}>
              <Text style={[styles.statValue, { color: uiTokens.colors.accent }]}>
                {userPermissions.length}
              </Text>
              <Text style={styles.statLabel}>User Active</Text>
            </ModernCard>
          )}
        </View>

        {renderPermissionCategories()}
      </ScrollView>
    </ScreenContainer>
  );
}

type PermissionsTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: PermissionsTokens) =>
  StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  topPanel: {
    padding: uiTokens.spacing.md,
    zIndex: 10,
  },
  controlPanel: {
    padding: uiTokens.spacing.lg,
    gap: uiTokens.spacing.md,
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: uiTokens.spacing.md,
    padding: uiTokens.spacing.md,
  },
  noticeCopy: {
    flex: 1,
    gap: uiTokens.spacing.xs,
  },
  noticeTitle: {
    color: uiTokens.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  noticeBody: {
    color: uiTokens.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: uiTokens.colors.textSecondary,
    marginBottom: uiTokens.spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  inputSection: {
    marginBottom: uiTokens.spacing.xs,
  },
  searchSection: {
    marginTop: uiTokens.spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.spacing.md,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colorWithAlpha(uiTokens.colors.textMuted, 0.08),
    borderRadius: uiTokens.radius.md,
    borderWidth: 1,
    borderColor: uiTokens.colors.border,
    paddingHorizontal: uiTokens.spacing.md,
  },
  inputIcon: {
    marginRight: uiTokens.spacing.sm,
  },
  input: {
    flex: 1,
    color: uiTokens.colors.textPrimary,
    padding: uiTokens.spacing.md,
    fontSize: 16,
  },
  loadButton: {
    ...getMinimumTouchTargetStyle(),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTokens.colors.accent,
    paddingHorizontal: uiTokens.spacing.lg,
    paddingVertical: uiTokens.spacing.md,
    borderRadius: uiTokens.radius.md,
  },
  disabledButton: {
    opacity: 0.5,
  },
  loadButtonText: {
    color: uiTokens.colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: uiTokens.spacing.md,
    paddingBottom: uiTokens.spacing["3xl"],
  },
  contentContainerWeb: {
    maxWidth: 1000,
    alignSelf: "center",
    width: "100%",
  },
  statsRow: {
    flexDirection: "row",
    gap: uiTokens.spacing.md,
    marginBottom: uiTokens.spacing.lg,
  },
  statBox: {
    flex: 1,
    padding: uiTokens.spacing.md,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: uiTokens.colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: uiTokens.colors.textMuted,
    marginTop: uiTokens.spacing.xxs,
  },
  categoryContainer: {
    marginBottom: uiTokens.spacing.lg,
    padding: uiTokens.spacing.lg,
    overflow: "hidden",
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: uiTokens.spacing.md,
    gap: uiTokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: uiTokens.colors.border,
    paddingBottom: uiTokens.spacing.md,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: uiTokens.colors.textPrimary,
    letterSpacing: 0.5,
  },
  permissionsGrid: {
    gap: uiTokens.spacing.sm,
  },
  permissionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: uiTokens.spacing.sm,
    paddingHorizontal: uiTokens.spacing.md,
    backgroundColor: colorWithAlpha(uiTokens.colors.textMuted, 0.06),
    borderRadius: uiTokens.radius.md,
    borderWidth: 1,
    borderColor: colorWithAlpha(uiTokens.colors.textMuted, 0.12),
  },
  permissionText: {
    flex: 1,
    color: uiTokens.colors.textSecondary,
    fontSize: 15,
    fontWeight: "500",
  },
  permissionButton: {
    ...getMinimumTouchTargetStyle(),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTokens.spacing.md,
    paddingVertical: uiTokens.spacing.sm,
    borderRadius: uiTokens.radius.sm,
    gap: uiTokens.spacing.xs,
  },
  addButton: {
    backgroundColor: uiTokens.colors.success,
  },
  removeButton: {
    backgroundColor: uiTokens.colors.error,
  },
  buttonText: {
    color: uiTokens.colors.surface,
    fontSize: 14,
    fontWeight: "700",
  },
});
