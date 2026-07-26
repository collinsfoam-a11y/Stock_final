/**
 * Help Screen - Lavanya eMart
 * App documentation and help
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import ModernCard from "@/components/ui/ModernCard";
import ModernHeader from "@/components/ui/ModernHeader";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import {
  spacing as unifiedSpacing,
  textStyles,
  radius as unifiedRadius,
} from "@/theme/legacyCompat";
import { safeBackNavigation } from "@/utils/navigation";
import { duration } from "@/theme/staffUiScale";

// ---------------------------------------------------------------------------
// Safe Animated View (web-compatible)
// ---------------------------------------------------------------------------

interface SafeAnimatedViewProps {
  children: React.ReactNode;
  style?: any;
  entering?: any;
  delay?: number;
}

const SafeAnimatedView: React.FC<SafeAnimatedViewProps> = ({
  children,
  style,
  entering,
  delay = 0,
}) => {
  if (Platform.OS === "web") {
    return <View style={style}>{children}</View>;
  }
  const animationProps = entering
    ? { entering: entering.delay(delay).duration(duration.slower).springify() }
    : {};
  return (
    <Animated.View style={style} {...animationProps}>
      {children}
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Types & Data
// ---------------------------------------------------------------------------

interface HelpSection {
  title: string;
  icon: string;
  items: HelpItem[];
}

interface HelpItem {
  question: string;
  answer: string;
  icon?: string;
}

const helpSections: HelpSection[] = [
  {
    title: "Getting Started",
    icon: "rocket",
    items: [
      {
        question: "How do I login?",
        answer:
          'Enter your username and password. If you enabled "Remember Me", your username will be saved for next time.',
        icon: "log-in",
      },
      {
        question: "What are the user roles?",
        answer:
          "Staff: Can scan items and create count sessions. Supervisor: Can approve counts, view reports, and configure settings.",
        icon: "people",
      },
      {
        question: "How do I scan a barcode?",
        answer:
          "Navigate to the Scan screen, tap the barcode scanner icon, and point your camera at the barcode. You can also manually enter the barcode.",
        icon: "barcode",
      },
    ],
  },
  {
    title: "Stock Counting",
    icon: "cube",
    items: [
      {
        question: "How do I create a counting session?",
        answer:
          'Go to Home screen, tap "New Session", select a warehouse, and start scanning items.',
        icon: "add-circle",
      },
      {
        question: "How do I enter quantity?",
        answer:
          'After scanning an item, tap the quantity field and enter the counted quantity. Tap "Save" to record.',
        icon: "calculator",
      },
      {
        question: "What if an item is not found?",
        answer:
          'Tap "Item Not Found" button and enter the item details manually. It will be reported for review.',
        icon: "alert-circle",
      },
      {
        question: "How do I refresh stock from ERP?",
        answer:
          'Tap the refresh icon next to "ERP Stock" on the scan screen to fetch the latest stock quantity.',
        icon: "refresh",
      },
    ],
  },
  {
    title: "Supervisor Features",
    icon: "shield-checkmark",
    items: [
      {
        question: "How do I approve count lines?",
        answer:
          'Go to Dashboard, select a session, review count lines, and tap "Approve" for each line.',
        icon: "checkmark-circle",
      },
      {
        question: "How do I configure database mapping?",
        answer:
          "Go to Settings > Database Mapping, enter connection details, select tables and columns, and save the mapping.",
        icon: "settings",
      },
      {
        question: "How do I view activity logs?",
        answer:
          "Go to Dashboard > Activity Logs to view all user activities and system events.",
        icon: "list",
      },
    ],
  },
  {
    title: "Troubleshooting",
    icon: "bug",
    items: [
      {
        question: "Cannot connect to server",
        answer:
          "Check your internet connection and ensure the backend server is running. Verify the backend URL in settings.",
        icon: "wifi",
      },
      {
        question: "Barcode not found",
        answer:
          "Check if the item exists in ERP. Verify database mapping configuration if you're a supervisor.",
        icon: "search",
      },
      {
        question: "Sync not working",
        answer:
          "Check ERP connection settings. Ensure SQL Server is accessible and credentials are correct.",
        icon: "sync",
      },
      {
        question: "App crashes or freezes",
        answer:
          "Close and restart the app. If problem persists, clear app cache or reinstall.",
        icon: "warning",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HelpScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(uiTokens), [uiTokens]);
  const [expandedItems, setExpandedItems] = React.useState<Set<string>>(
    new Set()
  );

  const handleBack = useCallback(() => {
    safeBackNavigation(router, { fallbackHref: "/welcome" });
  }, [router]);

  const toggleItem = useCallback(
    (sectionIndex: number, itemIndex: number) => {
      const key = `${sectionIndex}-${itemIndex}`;
      setExpandedItems((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    []
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />
      <ModernHeader
        title="Help"
        subtitle="Quick answers and support"
        showBackButton
        onBackPress={handleBack}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {helpSections.map((section, sectionIndex) => (
          <SafeAnimatedView
            key={section.title}
            entering={FadeInDown}
            delay={sectionIndex * 80}
          >
            <ModernCard padding={0} style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View
                  style={[
                    styles.sectionIcon,
                    {
                      backgroundColor: colorWithAlpha(
                        uiTokens.colors.accent,
                        uiTokens.mode === "dark" ? 0.18 : 0.1
                      ),
                    },
                  ]}
                >
                  <Ionicons
                    name={section.icon as any}
                    size={22}
                    color={uiTokens.colors.accent}
                  />
                </View>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>

              {section.items.map((item, itemIndex) => {
                const key = `${sectionIndex}-${itemIndex}`;
                const isExpanded = expandedItems.has(key);

                return (
                  <View key={itemIndex} style={styles.itemContainer}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isExpanded }}
                      accessibilityLabel={item.question}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                      onPress={() => toggleItem(sectionIndex, itemIndex)}
                      style={[
                        styles.questionContainer,
                        isExpanded && {
                          backgroundColor: colorWithAlpha(
                            uiTokens.colors.accent,
                            uiTokens.mode === "dark" ? 0.12 : 0.06
                          ),
                        },
                      ]}
                    >
                      <View style={styles.questionContent}>
                        {item.icon && (
                          <Ionicons
                            name={item.icon as any}
                            size={20}
                            color={uiTokens.colors.textSecondary}
                            style={styles.itemIcon}
                          />
                        )}
                        <Text style={styles.question}>{item.question}</Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={20}
                        color={uiTokens.colors.textSecondary}
                      />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View
                        style={[
                          styles.answerContainer,
                          {
                            backgroundColor: colorWithAlpha(
                              uiTokens.colors.accent,
                              uiTokens.mode === "dark" ? 0.08 : 0.04
                            ),
                          },
                        ]}
                      >
                        <Text style={styles.answer}>{item.answer}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ModernCard>
          </SafeAnimatedView>
        ))}

        {/* Contact Support */}
        <SafeAnimatedView entering={FadeInDown} delay={400}>
          <ModernCard padding={unifiedSpacing.lg} style={styles.contactCard}>
            <View
              style={[
                styles.contactIcon,
                {
                  backgroundColor: colorWithAlpha(
                    uiTokens.colors.info,
                    uiTokens.mode === "dark" ? 0.18 : 0.1
                  ),
                },
              ]}
            >
              <Ionicons
                name="mail"
                size={24}
                color={uiTokens.colors.info}
              />
            </View>
            <Text style={styles.contactTitle}>Need More Help?</Text>
            <Text style={styles.contactText}>
              Contact your system administrator or IT support team for
              additional assistance.
            </Text>
          </ModernCard>
        </SafeAnimatedView>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (tokens: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: unifiedSpacing.lg,
      paddingBottom: unifiedSpacing["2xl"],
      gap: unifiedSpacing.lg,
    },
    sectionCard: {
      borderRadius: unifiedRadius.lg,
      overflow: "hidden",
      backgroundColor: tokens.colors.surfaceElevated,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: unifiedSpacing.lg,
      paddingTop: unifiedSpacing.lg,
      paddingBottom: unifiedSpacing.md,
      gap: unifiedSpacing.md,
    },
    sectionIcon: {
      width: 40,
      height: 40,
      borderRadius: unifiedRadius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionTitle: {
      ...textStyles.h6,
      color: tokens.colors.textPrimary,
      flex: 1,
    },
    itemContainer: {
      paddingHorizontal: unifiedSpacing.sm,
      paddingBottom: unifiedSpacing.sm,
    },
    questionContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 48,
      paddingVertical: unifiedSpacing.sm,
      paddingHorizontal: unifiedSpacing.md,
      borderRadius: unifiedRadius.sm,
    },
    questionContent: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: unifiedSpacing.sm,
    },
    itemIcon: {
      marginRight: unifiedSpacing.xs,
    },
    question: {
      flex: 1,
      ...textStyles.body,
      fontWeight: "600",
    },
    answerContainer: {
      padding: unifiedSpacing.md,
      borderRadius: unifiedRadius.sm,
      marginTop: unifiedSpacing.xs,
    },
    answer: {
      ...textStyles.caption,
      lineHeight: 21,
    },
    contactCard: {
      alignItems: "center",
      backgroundColor: tokens.colors.surfaceElevated,
      borderRadius: unifiedRadius.lg,
    },
    contactIcon: {
      width: 48,
      height: 48,
      borderRadius: unifiedRadius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    contactTitle: {
      ...textStyles.h6,
      color: tokens.colors.textPrimary,
      marginTop: unifiedSpacing.md,
      marginBottom: unifiedSpacing.sm,
    },
    contactText: {
      ...textStyles.body,
      color: tokens.colors.textSecondary,
      textAlign: "center",
    },
  });
