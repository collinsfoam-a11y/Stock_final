/**
 * Notifications Screen - Display user notifications
 * Part of FR-M-23: Recount notifications
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNotificationStore } from "../src/store/notificationStore";
import { getCountLineById, type Notification } from "../src/services/api/api";
import ModernHeader from "../src/components/ui/ModernHeader";
import ModernCard from "../src/components/ui/ModernCard";
import {
  colors,
  spacing,
  typography,
  borderRadius,
} from "../src/theme/modernDesign";

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore();

  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  useEffect(() => {
    fetchNotifications(showUnreadOnly);
  }, [fetchNotifications, showUnreadOnly]);

  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification._id);
    }

    const metadata = notification.metadata || {};
    const actionCountLineId =
      metadata.count_line_id ||
      notification.action_url?.match(/\/count-lines\/([^/]+)/)?.[1];

    if (!actionCountLineId) {
      return;
    }

    try {
      const countLine =
        metadata.session_id && metadata.barcode
          ? {
              session_id: metadata.session_id,
              barcode: metadata.barcode,
            }
          : await getCountLineById(actionCountLineId);

      const sessionId = countLine?.session_id;
      const barcode = countLine?.barcode;

      if (!sessionId || !barcode) {
        return;
      }

      router.push({
        pathname: "/staff/item-detail",
        params: { sessionId, barcode },
      } as any);
    } catch (error) {
      console.error("Failed to open notification target:", error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "recount_assigned":
        return { name: "refresh-circle", color: "#F59E0B" };
      case "count_approved":
        return { name: "checkmark-circle", color: "#10B981" };
      case "count_rejected":
        return { name: "close-circle", color: "#EF4444" };
      case "session_reminder":
        return { name: "time", color: "#3B82F6" };
      default:
        return { name: "notifications", color: "#6B7280" };
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderNotificationItem = ({ item }: { item: Notification }) => {
    const iconInfo = getNotificationIcon(item.type);

    return (
      <TouchableOpacity
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <ModernCard
          style={[styles.notificationCard, !item.read && styles.unreadCard]}
        >
          <View style={styles.notificationContent}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: `${iconInfo.color}20` },
              ]}
            >
              <Ionicons
                name={iconInfo.name as any}
                size={24}
                color={iconInfo.color}
              />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.notificationTitle}>{item.title}</Text>
              <Text style={styles.notificationMessage} numberOfLines={2}>
                {item.message}
              </Text>
              <Text style={styles.timeText}>
                {formatTimeAgo(item.created_at)}
              </Text>
            </View>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
        </ModernCard>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name="notifications-off-outline"
        size={64}
        color={colors.gray[300]}
      />
      <Text style={styles.emptyTitle}>No Notifications</Text>
      <Text style={styles.emptySubtitle}>
        {showUnreadOnly
          ? "You have no unread notifications"
          : "Your notifications will appear here"}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ModernHeader
        title="Notifications"
        showBackButton
        onBackPress={() => router.back()}
        rightAction={
          unreadCount > 0
            ? { icon: "checkmark-done", onPress: () => void markAllAsRead() }
            : undefined
        }
      />

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, !showUnreadOnly && styles.activeTab]}
          onPress={() => setShowUnreadOnly(false)}
        >
          <Text
            style={[
              styles.filterText,
              !showUnreadOnly && styles.activeFilterText,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, showUnreadOnly && styles.activeTab]}
          onPress={() => setShowUnreadOnly(true)}
        >
          <Text
            style={[
              styles.filterText,
              showUnreadOnly && styles.activeFilterText,
            ]}
          >
            Unread ({unreadCount})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications}
        renderItem={renderNotificationItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => fetchNotifications(showUnreadOnly)}
            colors={[colors.primary[600]]}
          />
        }
      />

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  filterTab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray[100],
  },
  activeTab: {
    backgroundColor: colors.primary[600],
  },
  filterText: {
    fontSize: typography.fontSize.sm,
    fontWeight: "600",
    color: colors.gray[600],
  },
  activeFilterText: {
    color: colors.white,
  },
  listContent: {
    padding: spacing.lg,
  },
  notificationCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  unreadCard: {
    backgroundColor: colors.primary[50],
    borderLeftWidth: 3,
    borderLeftColor: colors.primary[600],
  },
  notificationContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: "700",
    color: colors.gray[900],
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[600],
    marginBottom: 8,
  },
  timeText: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[400],
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary[600],
    marginLeft: spacing.sm,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing["2xl"],
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: "700",
    color: colors.gray[900],
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    textAlign: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
});
