/**
 * Notifications Screen - Display user notifications
 * Part of FR-M-23: Recount notifications
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";

import { getCountLineById, type Notification } from "../src/services/api/api";
import ModernCard from "../src/components/ui/ModernCard";
import ModernHeader from "../src/components/ui/ModernHeader";
import { useNotificationStore } from "../src/store/notificationStore";
import { useUiTokens } from "@/hooks/useUiTokens";
import { createLogger } from "@/services/logging";
import { toastService } from "@/services/toastService";
import { hitSlop, radius, spacing } from "@/theme/legacyCompat";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { safeBackNavigation } from "@/utils/navigation";

const log = createLogger("notifications");

interface NotificationFilterTabProps {
  active: boolean;
  count?: number;
  label: string;
  onPress: () => void;
  uiTokens: ThemeTokens;
}

function NotificationFilterTab({
  active,
  count,
  label,
  onPress,
  uiTokens,
}: NotificationFilterTabProps) {
  const activeTextColor =
    uiTokens.mode === "dark" ? uiTokens.colors.background : uiTokens.colors.surfaceElevated;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${label}${count === undefined ? "" : `, ${count}`}`}
      accessibilityHint="Filters the notification list"
      accessibilityState={{ selected: active }}
      hitSlop={hitSlop.small}
      onPress={onPress}
      style={[
        styles.filterTab,
        {
          backgroundColor: active ? uiTokens.colors.accent : uiTokens.colors.surfaceElevated,
          borderColor: active ? uiTokens.colors.accent : uiTokens.colors.border,
          borderRadius: uiTokens.radius.md,
        },
      ]}
    >
      <Text
        style={[
          styles.filterText,
          { color: active ? activeTextColor : uiTokens.colors.textSecondary },
        ]}
      >
        {count === undefined ? label : `${label} (${count})`}
      </Text>
    </TouchableOpacity>
  );
}

const getReadableError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Notification target lookup failed without a readable error message";
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

export default function NotificationsScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const { notifications, unreadCount, isLoading, fetchNotifications, markAsRead, markAllAsRead } =
    useNotificationStore();
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const readCount = useMemo(
    () => Math.max(0, notifications.length - unreadCount),
    [notifications.length, unreadCount]
  );

  useEffect(() => {
    fetchNotifications(showUnreadOnly);
  }, [fetchNotifications, showUnreadOnly]);

  const getNotificationIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "recount_assigned":
        return { name: "refresh-circle", color: uiTokens.colors.warning };
      case "count_approved":
        return { name: "checkmark-circle", color: uiTokens.colors.success };
      case "count_rejected":
        return { name: "close-circle", color: uiTokens.colors.error };
      case "session_reminder":
        return { name: "time", color: uiTokens.colors.info };
      default:
        return { name: "notifications", color: uiTokens.colors.textSecondary };
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification._id);
    }

    const metadata = notification.metadata || {};
    const actionCountLineId =
      metadata.count_line_id || notification.action_url?.match(/\/count-lines\/([^/]+)/)?.[1];

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
      log.warn("Failed to open notification target", {
        error: getReadableError(error),
      });
      toastService.showError("Could not open this notification.");
    }
  };

  const renderNotificationItem = ({ item }: { item: Notification }) => {
    const iconInfo = getNotificationIcon(item.type);

    return (
      <TouchableOpacity
        accessibilityLabel={item.read ? item.title : `${item.title}, unread`}
        accessibilityRole="button"
        activeOpacity={0.75}
        onPress={() => handleNotificationPress(item)}
      >
        <ModernCard
          accessible={false}
          style={[
            styles.notificationCard,
            !item.read && styles.unreadCard,
            {
              backgroundColor: item.read
                ? uiTokens.colors.surfaceElevated
                : colorWithAlpha(uiTokens.colors.accent, uiTokens.mode === "dark" ? 0.18 : 0.1),
              borderColor: item.read ? uiTokens.colors.border : uiTokens.colors.accent,
              ...(!item.read ? { borderLeftColor: uiTokens.colors.accent } : null),
            },
          ]}
        >
          <View style={styles.notificationContent}>
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: colorWithAlpha(
                    iconInfo.color,
                    uiTokens.mode === "dark" ? 0.22 : 0.12
                  ),
                },
              ]}
            >
              <Ionicons name={iconInfo.name as any} size={24} color={iconInfo.color} />
            </View>

            <View style={styles.textContainer}>
              <Text style={[styles.notificationTitle, { color: uiTokens.colors.textPrimary }]}>
                {item.title}
              </Text>
              <Text
                style={[styles.notificationMessage, { color: uiTokens.colors.textSecondary }]}
                numberOfLines={2}
              >
                {item.message}
              </Text>
              <View style={styles.metaRow}>
                <Text style={[styles.timeText, { color: uiTokens.colors.textMuted }]}>
                  {formatTimeAgo(item.created_at)}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: colorWithAlpha(iconInfo.color, 0.12),
                      borderColor: colorWithAlpha(iconInfo.color, 0.28),
                    },
                  ]}
                >
                  <Text style={[styles.statusBadgeText, { color: iconInfo.color }]}>
                    {item.read ? "Read" : "Unread"}
                  </Text>
                </View>
              </View>
            </View>

            {!item.read ? (
              <View style={[styles.unreadDot, { backgroundColor: uiTokens.colors.accent }]} />
            ) : null}
          </View>
        </ModernCard>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="notifications-off-outline" size={64} color={uiTokens.colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: uiTokens.colors.textPrimary }]}>
        No Notifications
      </Text>
      <Text style={[styles.emptySubtitle, { color: uiTokens.colors.textSecondary }]}>
        {showUnreadOnly
          ? "You have no unread notifications"
          : "Recount, approval, and session alerts will appear here."}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: uiTokens.colors.background }]}>
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />
      <ModernHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        showBackButton
        onBackPress={() => safeBackNavigation(router, { fallbackHref: "/welcome" })}
        rightAction={
          unreadCount > 0
            ? { icon: "checkmark-done", onPress: () => void markAllAsRead() }
            : undefined
        }
      />

      <ModernCard
        accessible={false}
        padding={0}
        style={[
          styles.summaryCard,
          {
            backgroundColor: uiTokens.colors.surfaceElevated,
            borderColor: uiTokens.colors.border,
          },
        ]}
      >
        <View style={styles.summaryContent}>
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryValue, { color: uiTokens.colors.textPrimary }]}>
              {notifications.length}
            </Text>
            <Text style={[styles.summaryLabel, { color: uiTokens.colors.textSecondary }]}>
              Total
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: uiTokens.colors.border }]} />
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryValue, { color: uiTokens.colors.accent }]}>
              {unreadCount}
            </Text>
            <Text style={[styles.summaryLabel, { color: uiTokens.colors.textSecondary }]}>
              Unread
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: uiTokens.colors.border }]} />
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryValue, { color: uiTokens.colors.success }]}>
              {readCount}
            </Text>
            <Text style={[styles.summaryLabel, { color: uiTokens.colors.textSecondary }]}>
              Read
            </Text>
          </View>
        </View>
      </ModernCard>

      <View
        style={[
          styles.filterContainer,
          {
            backgroundColor: uiTokens.colors.surface,
            borderBottomColor: uiTokens.colors.border,
          },
        ]}
      >
        <NotificationFilterTab
          active={!showUnreadOnly}
          label="All"
          onPress={() => setShowUnreadOnly(false)}
          uiTokens={uiTokens}
        />
        <NotificationFilterTab
          active={showUnreadOnly}
          count={unreadCount}
          label="Unread"
          onPress={() => setShowUnreadOnly(true)}
          uiTokens={uiTokens}
        />
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
            colors={[uiTokens.colors.accent]}
            tintColor={uiTokens.colors.accent}
          />
        }
      />

      {isLoading ? (
        <View style={[styles.loadingOverlay, { backgroundColor: uiTokens.colors.overlay }]}>
          <ActivityIndicator size="large" color={uiTokens.colors.accent} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryCard: {
    borderWidth: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  summaryContent: {
    flexDirection: "row",
    padding: spacing.lg,
  },
  summaryMetric: {
    alignItems: "center",
    flex: 1,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: spacing.xxs,
    textTransform: "uppercase",
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
  },
  filterContainer: {
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  filterTab: {
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "700",
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing["3xl"],
  },
  notificationCard: {
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  unreadCard: {
    borderLeftWidth: 3,
  },
  notificationContent: {
    alignItems: "flex-start",
    flexDirection: "row",
  },
  iconContainer: {
    alignItems: "center",
    borderRadius: radius.full,
    height: 48,
    justifyContent: "center",
    marginRight: spacing.md,
    width: 48,
  },
  textContainer: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  notificationMessage: {
    fontSize: 14,
    lineHeight: 19,
    marginBottom: spacing.xs,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusBadge: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  unreadDot: {
    borderRadius: radius.full,
    height: 10,
    marginLeft: spacing.sm,
    marginTop: spacing.xs,
    width: 10,
  },
  emptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingVertical: spacing["5xl"],
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
