import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import {
  ActivityFeedItem,
  AnimatedPressable,
  GlassCard,
} from "@/components/ui";
import { ActivityItem } from "@/components/supervisor/dashboard/supervisorDashboardShared";
import { theme } from "@/styles/modernDesignSystem";

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
  return (
    <Animated.View
      entering={FadeInDown.delay(350).springify()}
      style={styles.section}
    >
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <AnimatedPressable onPress={onViewAll} hapticFeedback="light">
          <Text style={styles.sectionLink}>View All</Text>
        </AnimatedPressable>
      </View>

      <GlassCard
        variant="medium"
        intensity={25}
        borderRadius={theme.borderRadius.xl}
        padding={theme.spacing.lg}
        elevation="md"
      >
        {activities.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="time-outline"
              size={48}
              color={theme.colors.text.secondary}
            />
            <Text style={styles.emptyText}>No recent activity</Text>
          </View>
        ) : (
          activities.slice(0, 5).map((activity, index) => (
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
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.primary[500],
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 16,
    color: theme.colors.text.secondary,
  },
});
