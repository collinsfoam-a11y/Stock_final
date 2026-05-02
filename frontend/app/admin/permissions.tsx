import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { usePermission } from "../../src/hooks/usePermission";
import { LoadingSpinner, ScreenContainer } from "../../src/components/ui";
import { GlassCard } from "../../src/components/ui/GlassCard";
import { AnimatedPressable } from "../../src/components/ui/AnimatedPressable";
import {
  getAvailablePermissions,
  getUserPermissions,
  addUserPermissions,
  removeUserPermissions,
} from "../../src/services/api";
import { useSettingsStore } from "../../src/store/settingsStore";
import { auroraTheme } from "../../src/theme/auroraTheme";
import Ionicons from "@expo/vector-icons/Ionicons";

const isWeb = Platform.OS === "web";

export default function PermissionsScreen() {
  const router = useRouter();
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
      Alert.alert(
        "Access Denied",
        "You do not have permission to access this screen.",
        [{ text: "OK", onPress: () => router.back() }],
      );
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
      Alert.alert(
        "Input Required",
        "Please enter a username to load permissions.",
      );
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
            categories[cat].some((p: string) =>
              p.toLowerCase().includes(searchQuery.toLowerCase()),
            ),
        )
      : categoryKeys;

    return filteredCategories.map((category) => {
      const permissions = categories[category];
      const filteredPermissions = searchQuery
        ? permissions.filter((p: string) =>
            p.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : permissions;

      if (filteredPermissions.length === 0) return null;

      return (
        <GlassCard
          key={category}
          variant="medium"
          style={styles.categoryContainer}
        >
          <View style={styles.categoryHeader}>
            <Ionicons
              name={getCategoryIcon(category)}
              size={20}
              color={auroraTheme.colors.primary[400]}
            />
            <Text style={styles.categoryTitle}>
              {category.toUpperCase().replace("_", " ")}
            </Text>
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
                    >
                      <Ionicons
                        name={hasPermission ? "close" : "add"}
                        size={16}
                        color="#fff"
                      />
                      <Text style={styles.buttonText}>
                        {hasPermission ? "Remove" : "Add"}
                      </Text>
                    </AnimatedPressable>
                  )}
                </View>
              );
            })}
          </View>
        </GlassCard>
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
        backgroundType="aurora"
        header={{
          title: "Permissions",
          subtitle: "Loading system permissions...",
          showBackButton: true,
        }}
      >
        <View style={styles.centered}>
          <LoadingSpinner size={36} color={auroraTheme.colors.primary[500]} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      backgroundType="aurora"
      auroraVariant="secondary"
      header={{
        title: "Permissions",
        subtitle: "Manage User Access Control",
        showBackButton: true,
      }}
    >
      {offlineMode && (
        <View style={styles.topPanel}>
          <GlassCard variant="strong" style={styles.noticeCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={20}
              color={auroraTheme.colors.warning[500]}
            />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>
                Permissions are unavailable offline
              </Text>
              <Text style={styles.noticeBody}>
                Available permission rules and user permission assignments are
                loaded from the backend. Reconnect to view or update access.
              </Text>
            </View>
          </GlassCard>
        </View>
      )}

      <View style={styles.topPanel}>
        <GlassCard variant="strong" style={styles.controlPanel}>
          <View style={styles.inputSection}>
            <Text style={styles.sectionLabel}>User Target</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={auroraTheme.colors.text.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter username (e.g., staff1)"
                  placeholderTextColor={auroraTheme.colors.text.muted}
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
                color={auroraTheme.colors.text.muted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Search across all categories..."
                placeholderTextColor={auroraTheme.colors.text.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                editable={!offlineMode}
              />
            </View>
          </View>
        </GlassCard>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentContainer,
          isWeb && styles.contentContainerWeb,
        ]}
      >
        <View style={styles.statsRow}>
          <GlassCard variant="light" style={styles.statBox}>
            <Text style={styles.statValue}>
              {availablePermissions?.permissions?.length || 0}
            </Text>
            <Text style={styles.statLabel}>Total Perms</Text>
          </GlassCard>
          {selectedUsername && (
            <GlassCard variant="light" style={styles.statBox}>
              <Text
                style={[
                  styles.statValue,
                  { color: auroraTheme.colors.primary[400] },
                ]}
              >
                {userPermissions.length}
              </Text>
              <Text style={styles.statLabel}>User Active</Text>
            </GlassCard>
          )}
        </View>

        {renderPermissionCategories()}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  topPanel: {
    padding: auroraTheme.spacing.md,
    zIndex: 10,
  },
  controlPanel: {
    padding: auroraTheme.spacing.lg,
    gap: 16,
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: auroraTheme.spacing.md,
  },
  noticeCopy: {
    flex: 1,
    gap: 4,
  },
  noticeTitle: {
    color: auroraTheme.colors.text.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  noticeBody: {
    color: auroraTheme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: auroraTheme.colors.text.secondary,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  inputSection: {
    marginBottom: 4,
  },
  searchSection: {
    marginTop: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: auroraTheme.borderRadius.md,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.light,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: auroraTheme.colors.text.primary,
    padding: auroraTheme.spacing.md,
    fontSize: 16,
  },
  loadButton: {
    backgroundColor: auroraTheme.colors.primary[500],
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: auroraTheme.borderRadius.md,
    shadowColor: auroraTheme.colors.primary[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledButton: {
    opacity: 0.5,
  },
  loadButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: auroraTheme.spacing.md,
    paddingBottom: 40,
  },
  contentContainerWeb: {
    maxWidth: 1000,
    alignSelf: "center",
    width: "100%",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: auroraTheme.spacing.lg,
  },
  statBox: {
    flex: 1,
    padding: auroraTheme.spacing.md,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: auroraTheme.colors.text.primary,
  },
  statLabel: {
    fontSize: 12,
    color: auroraTheme.colors.text.muted,
    marginTop: 2,
  },
  categoryContainer: {
    marginBottom: auroraTheme.spacing.lg,
    padding: auroraTheme.spacing.lg,
    overflow: "hidden",
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.light,
    paddingBottom: 12,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: auroraTheme.colors.text.primary,
    letterSpacing: 0.5,
  },
  permissionsGrid: {
    gap: 8,
  },
  permissionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: auroraTheme.borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  permissionText: {
    flex: 1,
    color: auroraTheme.colors.text.secondary,
    fontSize: 15,
    fontWeight: "500",
  },
  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: auroraTheme.borderRadius.sm,
    gap: 6,
  },
  addButton: {
    backgroundColor: auroraTheme.colors.success[600],
  },
  removeButton: {
    backgroundColor: auroraTheme.colors.error[600],
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
