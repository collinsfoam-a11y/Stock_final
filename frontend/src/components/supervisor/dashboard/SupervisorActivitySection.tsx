import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ActivityFeedItem, AnimatedPressable, ModernCard } from "@/components/ui";
import { ActivityItem } from "@/components/supervisor/dashboard/supervisorDashboardShared";
import { useUiTokens } from "@/hooks/useUiTokens";
import { spacing } from "@/theme/unified";

interface SupervisorActivitySectionProps {
  activities: ActivityItem[];
  onOpenActivity: (activityId: string) => void;
  onViewAll: () => void;
}

export function SupervisorActivitySection({
  activities,
  onOpenActivity,
  onViewAll,
}: SupervisorActivitySectionProps) {
  const uiTokens = useUiTokens();

  return (
    <Animated.View entering={FadeInDown.delay(350).springify()} style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary }]}>
          Recent Activity
        </Text>
        <AnimatedPressable onPress={onViewAll} hapticFeedback="light">
          <Text style={[styles.sectionLink, { color: uiTokens.colors.accentStrong }]}>
            View All
          </Text>
        </AnimatedPressable>
      </View>

      <ModernCard variant="outlined" elevation="none" intensity={25} padding={spacing.lg}>
        {activities.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={48} color={uiTokens.colors.textSecondary} />
            <Text style={[styles.emptyText, { color: uiTokens.colors.textSecondary }]}>
              No recent activity
            </Text>
          </View>
        ) : (
          activities
            .slice(0, 5)
            .map((activity, index) => (
              <ActivityFeedItem
                key={activity.id}
                type={activity.type}
                title={activity.title}
                description={activity.description}
                timestamp={activity.timestamp}
                status={activity.status}
                onPress={() => onOpenActivity(activity.id)}
                delay={index * 50}
              />
            ))
        )}
      </ModernCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "600",
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 16,
  },
});
