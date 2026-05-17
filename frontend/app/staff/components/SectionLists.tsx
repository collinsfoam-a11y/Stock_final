import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";

import { ModernCard } from "../../../src/components/ui";
import type { SessionType } from "../../../src/types";
import type { AppTheme } from "../../../src/theme/themes";
import { hitSlop, radius, spacing, touchTargets } from "../../../src/theme/legacyCompat";
import { colorWithAlpha } from "../../../src/theme/themeTokens";
import { useReducedMotion } from "../../../src/hooks/useReducedMotion";
import { operationalMotion } from "../../../src/utils/motion";

type SessionListItem = {
  id?: string;
  session_id?: string;
  warehouse?: string;
  item_count?: number;
  total_items?: number;
  created_at?: string;
  started_at?: string;
  updated_at?: string;
  closed_at?: string;
  status?: string;
  type?: SessionType;
};

type SectionListsProps = {
  theme: AppTheme;
  isDark: boolean;
  activeSections: SessionListItem[];
  finishedSections: SessionListItem[];
  isLoading: boolean;
  showFinishedSearch: boolean;
  finishedSearchQuery: string;
  onToggleSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  onStartNewSection: () => void;
  onResumeSection: (sessionId: string, type?: SessionType) => void;
};

const getRelativeTime = (date: Date | string): string => {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return then.toLocaleDateString();
};

export function SectionLists({
  theme,
  isDark,
  activeSections,
  finishedSections,
  isLoading,
  showFinishedSearch,
  finishedSearchQuery,
  onToggleSearch,
  onSearchQueryChange,
  onStartNewSection,
  onResumeSection,
}: SectionListsProps) {
  const inputRef = React.useRef<TextInput>(null);
  const prefersReducedMotion = useReducedMotion();

  React.useEffect(() => {
    if (!showFinishedSearch) return;

    // Small delay to ensure layout is ready
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [showFinishedSearch]);

  const styles = React.useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const [showAllFinished, setShowAllFinished] = React.useState(false);
  const topActiveSections = React.useMemo(() => activeSections.slice(0, 3), [activeSections]);
  const overflowActiveSections = React.useMemo(() => activeSections.slice(3), [activeSections]);

  return (
    <>
      {/* Active sections */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeader}>
            <Ionicons name="layers" size={22} color={theme.colors.accent} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>
              Select Section
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Start a new section"
            accessibilityHint="Creates a new stock counting section"
            hitSlop={hitSlop.small}
            style={[styles.iconButton, { backgroundColor: theme.colors.accent }]}
            onPress={onStartNewSection}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color={theme.colors.text.inverse} />
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionSubtitle}>Tap a section to continue scanning</Text>

        {isLoading ? (
          <ActivityIndicator color={theme.colors.accent} style={styles.loadingIndicator} />
        ) : activeSections.length > 0 ? (
          <View style={styles.listContainer}>
            {topActiveSections.map((session, index) => (
              <Animated.View
                key={session.id || session.session_id}
                entering={
                  prefersReducedMotion
                    ? undefined
                    : FadeInUp.delay(operationalMotion.instant + index * operationalMotion.instant)
                }
              >
                <ModernCard
                  variant="elevated"
                  onPress={() =>
                    onResumeSection(session.session_id || session.id || "", session.type)
                  }
                  style={styles.activeSessionCard}
                  contentStyle={styles.sessionCardContent}
                >
                  <View
                    style={[
                      styles.sessionIcon,
                      { backgroundColor: colorWithAlpha(theme.colors.accent, 0.08) },
                    ]}
                  >
                    <Ionicons name="layers" size={24} color={theme.colors.accent} />
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionName} numberOfLines={1}>
                      {session.warehouse}
                    </Text>
                    <Text style={styles.sessionMeta}>
                      {session.item_count || session.total_items || 0} items •{" "}
                      {new Date(
                        session.created_at || session.started_at || ""
                      ).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.resumeButton}>
                    <Ionicons name="arrow-forward" size={18} color={theme.colors.text.inverse} />
                  </View>
                </ModernCard>
              </Animated.View>
            ))}
            {overflowActiveSections.length > 0 && (
              <>
                <Text style={styles.overflowHint}>Drag horizontally to view more sections</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.overflowScrollContent}
                  style={styles.overflowScroll}
                >
                  {overflowActiveSections.map((session, index) => (
                    <Animated.View
                      key={session.id || session.session_id}
                      entering={
                        prefersReducedMotion
                          ? undefined
                          : FadeInUp.delay(operationalMotion.slow + index * operationalMotion.fast)
                      }
                      style={styles.overflowCardWrapper}
                    >
                      <ModernCard
                        variant="elevated"
                        onPress={() =>
                          onResumeSection(session.session_id || session.id || "", session.type)
                        }
                        style={styles.overflowCard}
                        contentStyle={styles.sessionCardContent}
                      >
                        <View
                          style={[
                            styles.sessionIcon,
                            { backgroundColor: colorWithAlpha(theme.colors.accent, 0.08) },
                          ]}
                        >
                          <Ionicons name="layers" size={24} color={theme.colors.accent} />
                        </View>
                        <View style={styles.sessionInfo}>
                          <Text style={styles.sessionName} numberOfLines={1}>
                            {session.warehouse}
                          </Text>
                          <Text style={styles.sessionMeta}>
                            {session.item_count || session.total_items || 0} items •{" "}
                            {new Date(
                              session.created_at || session.started_at || ""
                            ).toLocaleDateString()}
                          </Text>
                        </View>
                        <View style={styles.resumeButton}>
                          <Ionicons
                            name="arrow-forward"
                            size={18}
                            color={theme.colors.text.inverse}
                          />
                        </View>
                      </ModernCard>
                    </Animated.View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        ) : (
          <ModernCard variant="elevated" intensity={10} style={styles.emptyState}>
            <View style={styles.emptyStateContent}>
              <Ionicons
                name="checkmark-circle-outline"
                size={40}
                color={theme.colors.success.main}
              />
              <Text style={styles.emptyTitle}>All Caught Up!</Text>
              <Text style={styles.emptyText}>No active sections. Start a new one below.</Text>
            </View>
          </ModernCard>
        )}
      </View>

      {/* Finished sections */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-done-circle" size={22} color={theme.colors.success.main} />
            <Text style={styles.sectionTitle}>Previous Sessions</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Toggle previous sessions search"
            accessibilityHint={
              showFinishedSearch
                ? "Hides the previous sessions search field"
                : "Shows a search field for previous sessions"
            }
            accessibilityState={{ selected: showFinishedSearch }}
            hitSlop={hitSlop.small}
            style={[
              styles.searchToggleButton,
              {
                backgroundColor: showFinishedSearch
                  ? theme.colors.accent
                  : theme.colors.background.elevated,
              },
            ]}
            onPress={onToggleSearch}
            activeOpacity={0.7}
          >
            <Ionicons
              name="search"
              size={18}
              color={showFinishedSearch ? theme.colors.text.inverse : theme.colors.text.primary}
            />
          </TouchableOpacity>
        </View>

        {showFinishedSearch && (
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={theme.colors.text.tertiary} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search previous sessions..."
              placeholderTextColor={theme.colors.text.muted}
              value={finishedSearchQuery}
              onChangeText={onSearchQueryChange}
              accessibilityLabel="Search previous sessions"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {finishedSearchQuery.length > 0 && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Clear previous sessions search"
                accessibilityHint="Clears the current search text"
                hitSlop={hitSlop.small}
                onPress={() => onSearchQueryChange("")}
              >
                <Ionicons name="close-circle" size={18} color={theme.colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {finishedSections.length > 0 ? (
          <View style={styles.listContainer}>
            {(showAllFinished ? finishedSections : finishedSections.slice(0, 3)).map(
              (session, index) => (
                <Animated.View
                  key={session.id || session.session_id}
                  entering={
                    prefersReducedMotion
                      ? undefined
                      : FadeInUp.delay(operationalMotion.normal + index * operationalMotion.fast)
                  }
                >
                  <View
                    style={[
                      styles.finishedSessionCard,
                      {
                        backgroundColor: isDark
                          ? colorWithAlpha(theme.colors.text.inverse, 0.03)
                          : colorWithAlpha(theme.colors.text.primary, 0.02),
                      },
                    ]}
                  >
                    <View style={styles.sessionCardContent}>
                      <View
                        style={[
                          styles.sessionIcon,
                          { backgroundColor: colorWithAlpha(theme.colors.success.main, 0.08) },
                        ]}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={24}
                          color={theme.colors.success.main}
                        />
                      </View>
                      <View style={styles.sessionInfo}>
                        <Text style={styles.sessionName} numberOfLines={1}>
                          {session.warehouse}
                        </Text>
                        <Text style={styles.sessionMeta}>
                          {session.item_count || session.total_items || 0} items • Last used{" "}
                          {getRelativeTime(
                            session.closed_at || session.updated_at || session.created_at || ""
                          )}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Animated.View>
              )
            )}
            {finishedSections.length > 3 && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  showAllFinished
                    ? "Show fewer previous sessions"
                    : `Show ${finishedSections.length - 3} more previous sessions`
                }
                accessibilityHint="Toggles the number of previous sessions shown"
                accessibilityState={{ expanded: showAllFinished }}
                hitSlop={hitSlop.small}
                onPress={() => setShowAllFinished(!showAllFinished)}
                style={styles.showMoreButton}
              >
                <Text style={styles.moreText}>
                  {showAllFinished ? "Show Less" : `+${finishedSections.length - 3} more sessions`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.emptyStateSmall}>
            <Text style={styles.emptyTextSmall}>
              {finishedSearchQuery ? "No matching sessions found" : "No previous sessions yet"}
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

const createStyles = (theme: AppTheme, isDark: boolean) =>
  StyleSheet.create({
    section: {
      marginBottom: spacing["3xl"],
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.lg,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.5,
      color: theme.colors.text.primary,
    },
    sectionSubtitle: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      marginBottom: spacing.lg,
    },
    iconButton: {
      width: touchTargets.minimum,
      height: touchTargets.minimum,
      borderRadius: radius.md,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      elevation: 4,
    },
    searchToggleButton: {
      width: touchTargets.minimum,
      height: touchTargets.minimum,
      borderRadius: radius.md,
      justifyContent: "center",
      alignItems: "center",
    },
    listContainer: {
      gap: spacing.md,
    },
    activeSessionCard: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: isDark
        ? colorWithAlpha(theme.colors.text.inverse, 0.05)
        : colorWithAlpha(theme.colors.text.primary, 0.05),
      marginBottom: spacing.md,
      backgroundColor: isDark
        ? colorWithAlpha(theme.colors.background.elevated, 0.7)
        : colorWithAlpha(theme.colors.background.elevated, 0.7),
    },
    finishedSessionCard: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: isDark
        ? colorWithAlpha(theme.colors.text.inverse, 0.05)
        : colorWithAlpha(theme.colors.text.primary, 0.05),
      padding: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: isDark
        ? colorWithAlpha(theme.colors.background.elevated, 0.4)
        : colorWithAlpha(theme.colors.background.elevated, 0.6),
    },
    sessionCardContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
    },
    sessionIcon: {
      width: 52,
      height: 52,
      borderRadius: radius.lg,
      justifyContent: "center",
      alignItems: "center",
    },
    sessionInfo: {
      flex: 1,
    },
    sessionName: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.text.primary,
      marginBottom: spacing.xs,
    },
    sessionMeta: {
      fontSize: 13,
      color: theme.colors.text.secondary,
    },
    resumeButton: {
      width: 40,
      height: 40,
      borderRadius: radius.lg,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.colors.accent,
    },
    emptyState: {
      alignItems: "center",
      padding: spacing["3xl"],
      gap: spacing.md,
      borderRadius: radius["2xl"],
    },
    emptyStateContent: {
      alignItems: "center",
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: "700",
      marginTop: spacing.sm,
      color: theme.colors.text.primary,
    },
    emptyText: {
      fontSize: 14,
      textAlign: "center",
      color: theme.colors.text.secondary,
      lineHeight: 20,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: isDark
        ? colorWithAlpha(theme.colors.text.inverse, 0.1)
        : colorWithAlpha(theme.colors.text.primary, 0.1),
      backgroundColor: isDark
        ? colorWithAlpha(theme.colors.background.paper, 0.6)
        : colorWithAlpha(theme.colors.background.elevated, 0.8),
      marginBottom: spacing.lg,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: theme.colors.text.primary,
      paddingVertical: spacing.xs,
    },
    emptyStateSmall: {
      paddingVertical: spacing["2xl"],
      alignItems: "center",
    },
    emptyTextSmall: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      fontStyle: "italic",
    },
    moreText: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      textAlign: "center",
      marginTop: spacing.sm,
    },
    overflowHint: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    overflowScroll: {
      marginTop: spacing.xs,
    },
    overflowScrollContent: {
      paddingRight: spacing.xl,
      gap: spacing.md,
    },
    overflowCardWrapper: {
      flexDirection: "row",
    },
    overflowCard: {
      minWidth: 260,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: isDark
        ? colorWithAlpha(theme.colors.text.inverse, 0.05)
        : colorWithAlpha(theme.colors.text.primary, 0.05),
      padding: spacing.lg,
      backgroundColor: isDark
        ? colorWithAlpha(theme.colors.background.elevated, 0.7)
        : colorWithAlpha(theme.colors.background.elevated, 0.7),
    },
    loadingIndicator: {
      marginTop: spacing.xl,
    },
    showMoreButton: {
      paddingVertical: spacing.sm,
      alignItems: "center",
    },
  });

export default SectionLists;
