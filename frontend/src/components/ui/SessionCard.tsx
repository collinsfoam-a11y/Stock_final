/**
 * SessionCard Component - Premium session display card
 * Features:
 * - Modern glass morphism design
 * - Progress indicator
 * - Status badge
 * - Animated interactions
 * - Rich session info display
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import { StatusBadge } from "./StatusBadge";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";

import { semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

type SessionStatus = "active" | "completed" | "paused" | "pending";

interface SessionCardProps {
  id: string;
  name: string;
  location?: string;
  barcode?: string;
  itemCount?: number;
  totalItems?: number;
  status?: SessionStatus;
  lastUpdated?: string;
  createdBy?: string;
  onPress?: () => void;
  onResume?: () => void;
  style?: ViewStyle;
  index?: number;
}

const statusConfig: Record<
  SessionStatus,
  {
    variant: "success" | "warning" | "error" | "info" | "neutral";
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  active: { variant: "success", label: "Active", icon: "radio-button-on" },
  completed: { variant: "info", label: "Completed", icon: "checkmark-circle" },
  paused: { variant: "warning", label: "Paused", icon: "pause-circle" },
  pending: { variant: "neutral", label: "Pending", icon: "time" },
};

export const SessionCard: React.FC<SessionCardProps> = ({
  id: _id,
  name,
  location,
  barcode,
  itemCount = 0,
  totalItems,
  status = "active",
  lastUpdated,
  createdBy,
  onPress,
  onResume,
  style,
  index = 0,
}) => {
  const tokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(tokens), [tokens]);
  const scale = useSharedValue(1);
  const statusInfo = statusConfig[status];

  // Calculate progress percentage
  const progress = totalItems ? (itemCount / totalItems) * 100 : 0;

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const renderProgressBar = () => {
    if (!totalItems) return null;

    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={[tokens.colors.accent, tokens.colors.accentStrong]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]}
          />
        </View>
        <Text style={styles.progressText}>
          {itemCount} / {totalItems} items
        </Text>
      </View>
    );
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <AnimatedTouchableOpacity
        style={[styles.container, style, animatedStyle]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        {/* Card Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
              <Ionicons name="folder-open" size={20} color={tokens.colors.accent} />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              {location && (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={12} color={tokens.colors.textMuted} />
                  <Text style={styles.location}>{location}</Text>
                </View>
              )}
              {barcode && (
                <View style={styles.locationRow}>
                  <Ionicons name="barcode-outline" size={12} color={tokens.colors.textMuted} />
                  <Text style={styles.location}>{barcode}</Text>
                </View>
              )}
            </View>
          </View>
          <StatusBadge
            label={statusInfo.label}
            variant={statusInfo.variant}
            icon={statusInfo.icon}
            size="small"
            pulse={status === "active"}
          />
        </View>

        {/* Progress Bar */}
        {renderProgressBar()}

        {/* Card Footer */}
        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            {createdBy && (
              <View style={styles.infoItem}>
                <Ionicons name="person-outline" size={12} color={tokens.colors.textMuted} />
                <Text style={styles.infoText}>{createdBy}</Text>
              </View>
            )}
            {lastUpdated && (
              <View style={styles.infoItem}>
                <Ionicons name="time-outline" size={12} color={tokens.colors.textMuted} />
                <Text style={styles.infoText}>{lastUpdated}</Text>
              </View>
            )}
          </View>

          {onResume && status !== "completed" && (
            <TouchableOpacity style={styles.resumeButton} onPress={onResume}>
              <Ionicons name="play" size={14} color={uiSemanticColors.text.inverse} />
              <Text style={styles.resumeText}>Resume</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Item count badge */}
        {!totalItems && itemCount > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{itemCount}</Text>
            <Text style={styles.countLabel}>items</Text>
          </View>
        )}
      </AnimatedTouchableOpacity>
    </Animated.View>
  );
};

const createStyles = (tokens: ThemeTokens) => StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.surface,
    borderRadius: radius.lg,
    padding: gap.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: gap.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: gap.sm,
    marginRight: gap.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colorWithAlpha(tokens.colors.accent, 0.12),
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colorWithAlpha(tokens.colors.accent, 0.25),
  },
  headerInfo: {
    flex: 1,
    gap: gap.xxs,
  },
  name: {
    fontSize: font.size.base,
    fontWeight: "600",
    color: tokens.colors.textPrimary,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: gap.xs,
  },
  location: {
    fontSize: font.size.sm,
    color: tokens.colors.textMuted,
  },
  progressContainer: {
    marginBottom: gap.md,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colorWithAlpha(tokens.colors.textMuted, 0.18),
    overflow: "hidden",
    marginBottom: 6,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontSize: font.size.sm,
    color: tokens.colors.textMuted,
    textAlign: "right",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: gap.sm,
    borderTopWidth: 1,
    borderTopColor: colorWithAlpha(tokens.colors.border, 0.6),
  },
  footerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: gap.md,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: gap.xs,
  },
  infoText: {
    fontSize: font.size.sm,
    color: tokens.colors.textMuted,
  },
  resumeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: gap.xs,
    paddingHorizontal: gap.sm,
    paddingVertical: gap.sm,
    borderRadius: radius.sm,
    backgroundColor: tokens.colors.accent,
    minHeight: 44,
  },
  resumeText: {
    fontSize: font.size.sm,
    color: uiSemanticColors.text.inverse,
    fontWeight: "600",
  },
  countBadge: {
    position: "absolute",
    top: -8,
    right: gap.md,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: gap.sm,
    paddingVertical: gap.xs,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: gap.xs,
  },
  countText: {
    fontSize: font.size.base,
    fontWeight: "700",
    color: uiSemanticColors.text.inverse,
  },
  countLabel: {
    fontSize: font.size.sm,
    color: colorWithAlpha(uiSemanticColors.text.inverse, 0.8),
  },
});

export default SessionCard;
